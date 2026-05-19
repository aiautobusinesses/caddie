import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedContext } from "@/lib/api/session"
import type { Database, Json } from "@/lib/database.types"
import { calculateNextDue, parseRecurrenceRule } from "@/lib/recurrence"
import {
  isTaskEventInput,
  resolveEventTypeForDb,
  type TaskEventInput,
  type TaskRow,
} from "@/lib/tasks"

type RouteContext = { params: Promise<{ id: string }> }

type EventBody = {
  event_type: TaskEventInput
  metadata?: Json
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: taskId } = await context.params
  const { supabase, user } = auth

  let body: EventBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isTaskEventInput(body.event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 })
  }

  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  const dbEventType = resolveEventTypeForDb(body.event_type)
  const metadata =
    body.event_type === "why"
      ? ({ ...(typeof body.metadata === "object" && body.metadata && !Array.isArray(body.metadata) ? body.metadata : {}), kind: "why" } as Json)
      : (body.metadata ?? null)

  const { data: event, error: eventError } = await supabase
    .from("task_events")
    .insert({
      task_id: taskId,
      user_id: user.id,
      event_type: dbEventType,
      metadata,
    })
    .select()
    .single()

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 })
  }

  const sideEffectError = await applyEventSideEffects(
    supabase,
    task as TaskRow,
    body.event_type,
    body.metadata,
  )

  if (sideEffectError) {
    return NextResponse.json({ error: sideEffectError }, { status: 500 })
  }

  return NextResponse.json({ event })
}

async function applyEventSideEffects(
  supabase: SupabaseClient<Database>,
  task: TaskRow,
  eventType: TaskEventInput,
  metadata?: Json,
): Promise<string | null> {
  if (eventType === "why" || eventType === "skipped" || eventType === "edited") {
    return null
  }

  if (eventType === "done") {
    return applyDoneSideEffects(supabase, task, metadata)
  }

  if (eventType === "snoozed") {
    return applySnoozedSideEffects(supabase, task, metadata)
  }

  return null
}

async function applyDoneSideEffects(
  supabase: SupabaseClient<Database>,
  task: TaskRow,
  metadata?: Json,
): Promise<string | null> {
  const now = new Date().toISOString()

  if (task.chunked) {
    const anotherSession =
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      "another_session" in metadata &&
      metadata.another_session === true

    if (anotherSession) {
      return null
    }

    const { error } = await supabase
      .from("tasks")
      .update({ status: "archived", last_done_at: now })
      .eq("id", task.id)

    return error?.message ?? null
  }

  if (task.recurrence_rule) {
    const rule = parseRecurrenceRule(task.recurrence_rule)

    if (!rule) {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "archived", last_done_at: now })
        .eq("id", task.id)

      return error?.message ?? null
    }

    const nextDue = calculateNextDue(rule, now, task.next_due)
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "active",
        last_done_at: now,
        next_due: nextDue,
      })
      .eq("id", task.id)

    return error?.message ?? null
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: "archived", last_done_at: now })
    .eq("id", task.id)

  return error?.message ?? null
}

async function applySnoozedSideEffects(
  supabase: SupabaseClient<Database>,
  task: TaskRow,
  metadata?: Json,
): Promise<string | null> {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    typeof metadata.until !== "string" ||
    !metadata.until.trim()
  ) {
    return "snoozed events require metadata.until (date string)"
  }

  if (task.snooze_budget <= 0) {
    return "No snooze budget remaining"
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      snooze_budget: task.snooze_budget - 1,
      next_due: metadata.until,
      status: "snoozed",
    })
    .eq("id", task.id)

  return error?.message ?? null
}
