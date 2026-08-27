import { parseRecurrenceRule, calculateNextDue } from "@/lib/recurrence"
import { isStepEventInput, resolveEventTypeForDb } from "@/lib/tasks"
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
 */
export async function markThingStillGoing(
  supabase: SupabaseClient<Database>,
  thingId: string,
  userId: string,
): Promise<MarkThingStillGoingResult> {
  const { error } = await supabase
    .from("things")
    .update({ started_at: null })
    .eq("id", thingId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
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
    .select("id, thing_id, recurrence_rule, next_due, step_order")
    .eq("id", stepId)
    .eq("user_id", userId)
    .single()

  if (stepError || !stepRaw) {
    throw new ServiceError("Step not found", 404)
  }

  const step = stepRaw as {
    id: string
    thing_id: string
    recurrence_rule: unknown
    next_due: string | null
    step_order: number
  }

  const dbEventType = resolveEventTypeForDb(input.event_type)
  const metadata =
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
    // Non-done events: just insert the event record, no side-effects.
    const { error: eventError } = await supabase.from("step_events").insert({
      step_id: stepId,
      thing_id: step.thing_id,
      user_id: userId,
      event_type: dbEventType,
      metadata,
    })
    if (eventError) throw new Error(eventError.message)
    return { ok: true }
  }

  const now = new Date().toISOString()
  const rule = step.recurrence_rule ? parseRecurrenceRule(step.recurrence_rule) : null

  if (rule) {
    // Recurring step — record the event and reset the schedule in parallel.
    const nextDue = calculateNextDue(rule, now, step.next_due ?? null)
    const [{ error: eventError }, { error: stepUpdateError }] = await Promise.all([
      supabase.from("step_events").insert({
        step_id: stepId,
        thing_id: step.thing_id,
        user_id: userId,
        event_type: dbEventType,
        metadata,
      }),
      supabase
        .from("steps")
        .update({ last_done_at: now, next_due: nextDue })
        .eq("id", stepId),
    ])
    if (eventError) throw new Error(eventError.message)
    if (stepUpdateError) throw new Error(stepUpdateError.message)
  } else {
    // Non-recurring step — delegate to the atomic RPC which records the event,
    // marks the step done, and advances the thing's live_step_id in one transaction.
    const { error: rpcError } = await supabase.rpc("record_step_event_done", {
      p_step_id: stepId,
      p_user_id: userId,
      p_metadata: metadata as Json,
    })
    if (rpcError) throw new Error(rpcError.message)
  }

  return { ok: true }
}
