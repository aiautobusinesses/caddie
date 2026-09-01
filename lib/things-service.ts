import { isStepEventInput } from "@/lib/tasks"
import type { Json } from "@/lib/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

/** Domain error with an associated HTTP status code. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "ServiceError"
  }
}

export type MarkThingDoneResult = {
  ok: true
  still_going: false
  thing_complete: boolean
  thing_name: string | null
}

export type MarkThingStillGoingResult = {
  ok: true
  still_going: true
}

/**
 * Clear started_at without marking done — keeps the thing in the offer pool.
 * Writes a `stopped` event against the live step so the session is recorded.
 */
export async function markThingStillGoing(
  supabase: SupabaseClient<Database>,
  thingId: string,
  userId: string,
): Promise<MarkThingStillGoingResult> {
  // Fetch the live step id before clearing started_at.
  const { data: thing } = await supabase
    .from("things")
    .select("live_step_id")
    .eq("id", thingId)
    .eq("user_id", userId)
    .single()

  const { error } = await supabase
    .from("things")
    .update({ started_at: null })
    .eq("id", thingId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)

  // Write the stopped event against the live step (if present).
  // Awaited so that a DB failure surfaces rather than being swallowed silently.
  const stepId = (thing as { live_step_id: string | null } | null)?.live_step_id
  if (stepId) {
    const { error: eventError } = await supabase.from("step_events").insert({
      step_id: stepId,
      thing_id: thingId,
      user_id: userId,
      event_type: "stopped" as const,
      metadata: null,
    })
    if (eventError) throw new Error(eventError.message)
  }

  return { ok: true, still_going: true }
}

/**
 * Mark the live step done, advance live_step_id, record a step_event, and
 * return whether the whole thing is now complete.
 */
export async function markThingDone(
  supabase: SupabaseClient<Database>,
  thingId: string,
  userId: string,
): Promise<MarkThingDoneResult> {
  const { data: result, error } = await supabase.rpc("mark_thing_done", {
    p_thing_id: thingId,
    p_user_id: userId,
  })

  if (error) throw new Error(error.message)

  const rpcResult = result as { thing_complete: boolean; thing_name: string | null } | null
  const thingComplete = rpcResult?.thing_complete ?? false
  const thingName = rpcResult?.thing_name ?? null

  return {
    ok: true,
    still_going: false,
    thing_complete: thingComplete,
    thing_name: thingName,
  }
}

export type RecordStepEventInput = {
  event_type: string
  metadata?: Json
}

/**
 * Validate, record, and apply side-effects for a step event.
 * Returns { ok: true } on success; throws on invalid input or DB error.
 *
 * Every event type is a real DB enum value — no collapsing to "edited".
 * `why` events merge caller-supplied metadata with a kind discriminator so
 * the content (the user's reason) is preserved alongside the type marker.
 *
 * For `done` events, delegates to the `record_step_event_done` RPC which
 * marks the step done and advances the thing's live_step_id atomically.
 */
export async function recordStepEvent(
  supabase: SupabaseClient<Database>,
  stepId: string,
  userId: string,
  input: RecordStepEventInput,
): Promise<{ ok: true }> {
  if (!isStepEventInput(input.event_type)) {
    throw new ServiceError("Invalid event_type", 400)
  }

  const { data: stepRaw, error: stepError } = await supabase
    .from("steps")
    .select("id, thing_id, step_order")
    .eq("id", stepId)
    .eq("user_id", userId)
    .single()

  if (stepError || !stepRaw) {
    throw new ServiceError("Step not found", 404)
  }

  const step = stepRaw as {
    id: string
    thing_id: string
    step_order: number
  }

  // For `why` events, merge caller-supplied metadata with a kind discriminator
  // so the user's reason text travels with the event type.
  const metadata: Json =
    input.event_type === "why"
      ? ({
          ...(typeof input.metadata === "object" &&
          input.metadata &&
          !Array.isArray(input.metadata)
            ? input.metadata
            : {}),
          kind: "why",
        } as Json)
      : (input.metadata ?? null)

  if (input.event_type !== "done") {
    // Non-done events: insert the event record and return; no step-level side-effects.
    const { error: eventError } = await supabase.from("step_events").insert({
      step_id: stepId,
      thing_id: step.thing_id,
      user_id: userId,
      event_type: input.event_type,
      metadata,
    })
    if (eventError) throw new Error(eventError.message)

    // `accepted` means the user answered "yes" to the familiarity question.
    // Clear needs_know_how so the question never fires again for this step.
    if (input.event_type === "accepted") {
      const { error: clearError } = await supabase
        .from("steps")
        .update({ needs_know_how: false })
        .eq("id", stepId)
        .eq("user_id", userId)
      if (clearError) throw new Error(clearError.message)
    }

    return { ok: true }
  }

  // Done event — delegate to the atomic RPC which records the event,
  // marks the step done, and advances the thing's live_step_id in one transaction.
  const { error: rpcError } = await supabase.rpc("record_step_event_done", {
    p_step_id: stepId,
    p_user_id: userId,
    p_metadata: metadata as Json,
  })
  if (rpcError) throw new Error(rpcError.message)

  return { ok: true }
}

export type NudgeDirection = "back" | "forward"

/**
 * Nudge the live step of a thing back (to a previous step) or forward (to the
 * next undone step).
 *
 * Nudge back:
 *   - Finds the nearest step with step_order < current, re-opens it (done=false),
 *     moves live_step_id to it, and writes a nudged_back event on the old step.
 * Nudge forward:
 *   - Finds the nearest undone step with step_order > current, moves live_step_id
 *     to it, and writes a nudged_forward event on the old step.
 *
 * Throws ServiceError(404) if the thing or its live step is not found.
 * Throws ServiceError(400) if there is no step to nudge to in that direction.
 */
export async function nudgeStep(
  supabase: SupabaseClient<Database>,
  thingId: string,
  userId: string,
  direction: NudgeDirection,
): Promise<{ ok: true }> {
  // Fetch the thing to get its current live_step_id.
  const { data: thingRaw, error: thingError } = await supabase
    .from("things")
    .select("id, live_step_id")
    .eq("id", thingId)
    .eq("user_id", userId)
    .single()

  if (thingError || !thingRaw) throw new ServiceError("Thing not found", 404)

  const thing = thingRaw as { id: string; live_step_id: string | null }
  if (!thing.live_step_id) throw new ServiceError("Thing has no live step", 400)

  // Fetch all steps for this thing so we can find prev/next by step_order.
  const { data: stepsRaw, error: stepsError } = await supabase
    .from("steps")
    .select("id, step_order, done")
    .eq("thing_id", thingId)
    .eq("user_id", userId)
    .order("step_order", { ascending: true })

  if (stepsError || !stepsRaw) throw new ServiceError("Steps not found", 404)

  const steps = stepsRaw as { id: string; step_order: number; done: boolean }[]
  const currentStep = steps.find((s) => s.id === thing.live_step_id)
  if (!currentStep) throw new ServiceError("Live step not found in steps", 404)

  let targetStep: { id: string; step_order: number; done: boolean } | undefined

  if (direction === "back") {
    // Nearest step with step_order strictly less than current (any done state — re-opening it).
    targetStep = [...steps]
      .reverse()
      .find((s) => s.step_order < currentStep.step_order)
  } else {
    // Nearest undone step with step_order strictly greater than current.
    targetStep = steps.find((s) => s.step_order > currentStep.step_order && !s.done)
  }

  if (!targetStep) {
    throw new ServiceError(
      direction === "back" ? "No previous step to nudge back to" : "No next step to nudge forward to",
      400,
    )
  }

  // For nudge back: re-open the target step so it can be worked again.
  if (direction === "back") {
    const { error: reopenError } = await supabase
      .from("steps")
      .update({ done: false, done_at: null })
      .eq("id", targetStep.id)
      .eq("user_id", userId)
    if (reopenError) throw new Error(reopenError.message)
  }

  // Move live_step_id to the target step.
  const { error: updateError } = await supabase
    .from("things")
    .update({ live_step_id: targetStep.id })
    .eq("id", thingId)
    .eq("user_id", userId)
  if (updateError) throw new Error(updateError.message)

  // Write the nudge event against the original live step.
  const eventType = direction === "back" ? "nudged_back" : "nudged_forward"
  const { error: eventError } = await supabase.from("step_events").insert({
    step_id: thing.live_step_id,
    thing_id: thingId,
    user_id: userId,
    event_type: eventType,
    metadata: null,
  })
  if (eventError) throw new Error(eventError.message)

  return { ok: true }
}
