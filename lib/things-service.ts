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
  const { data: thing, error: fetchError } = await supabase
    .from("things")
    .select("id, name, live_step_id")
    .eq("id", thingId)
    .eq("user_id", userId)
    .single()

  if (fetchError || !thing) throw new Error("Thing not found")

  const liveStepId = thing.live_step_id ?? null
  const now = new Date().toISOString()

  if (liveStepId) {
    // Mark the step done first so the "find next undone" query excludes it.
    await supabase
      .from("steps")
      .update({ done: true, done_at: now, last_done_at: now })
      .eq("id", liveStepId)

    const { data: nextStep } = await supabase
      .from("steps")
      .select("id")
      .eq("thing_id", thingId)
      .eq("done", false)
      .neq("id", liveStepId)
      .order("step_order", { ascending: true })
      .limit(1)
      .single()

    const thingComplete = !nextStep

    // Advance the thing and record the event — independent of each other.
    await Promise.all([
      supabase
        .from("things")
        .update({ live_step_id: nextStep?.id ?? null, started_at: null })
        .eq("id", thingId),
      supabase.from("step_events").insert({
        step_id: liveStepId,
        thing_id: thingId,
        user_id: userId,
        event_type: "done",
        metadata: { source: "thing_done" },
      }),
    ])

    return {
      ok: true,
      still_going: false,
      thing_complete: thingComplete,
      thing_name: thingComplete ? thing.name : null,
    }
  }

  // No live step — just clear started_at
  await supabase
    .from("things")
    .update({ started_at: null })
    .eq("id", thingId)
    .eq("user_id", userId)

  return { ok: true, still_going: false, thing_complete: false, thing_name: null }
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
    const [{ error: eventError }, { error: stepError }] = await Promise.all([
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
    if (stepError) throw new Error(stepError.message)
  } else {
    // Non-recurring step — record the event and mark done in parallel,
    // then find the next undone step and advance the thing.
    const [{ error: eventError }, { error: stepError }] = await Promise.all([
      supabase.from("step_events").insert({
        step_id: stepId,
        thing_id: step.thing_id,
        user_id: userId,
        event_type: dbEventType,
        metadata,
      }),
      supabase
        .from("steps")
        .update({ done: true, done_at: now, last_done_at: now })
        .eq("id", stepId),
    ])
    if (eventError) throw new Error(eventError.message)
    if (stepError) throw new Error(stepError.message)

    // Must run after step is marked done so it's excluded from the query.
    const { data: nextStep } = await supabase
      .from("steps")
      .select("id")
      .eq("thing_id", step.thing_id)
      .eq("done", false)
      .neq("id", stepId)
      .order("step_order", { ascending: true })
      .limit(1)
      .single()

    const { error: thingError } = await supabase
      .from("things")
      .update({ live_step_id: nextStep?.id ?? null })
      .eq("id", step.thing_id)
    if (thingError) throw new Error(thingError.message)
  }

  return { ok: true }
}
