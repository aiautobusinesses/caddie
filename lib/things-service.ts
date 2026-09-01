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

  // Write the stopped event. Use live_step_id if available; fall back to a no-op
  // (fire-and-forget insert on a synthetic id) only if the thing has no live step.
  const stepId = (thing as { live_step_id: string | null } | null)?.live_step_id
  if (stepId) {
    // Non-blocking: failure here is not fatal; the clear has already succeeded.
    void supabase.from("step_events").insert({
      step_id: stepId,
      thing_id: thingId,
      user_id: userId,
      event_type: "stopped" as const,
      metadata: null,
    })
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
