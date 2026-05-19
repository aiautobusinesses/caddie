import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { scoreTask, type ScoringContext } from "@/lib/scoring"
import type { TaskInsert, TaskRow } from "@/lib/tasks"

function parseScoringContext(
  searchParams: URLSearchParams,
  today: string,
): ScoringContext {
  const energyParam = searchParams.get("energy")
  const timeParam = searchParams.get("time")

  const energy =
    energyParam === "sharp" || energyParam === "steady" || energyParam === "easy"
      ? energyParam
      : null

  const time =
    timeParam === "15" || timeParam === "30" || timeParam === "unlimited"
      ? timeParam
      : null

  return { energy, time, today }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { supabase, user } = auth

  const today = new Date().toISOString().split("T")[0]

  const { error: reactivateError } = await supabase
    .from("tasks")
    .update({ status: "active" })
    .eq("user_id", user.id)
    .eq("status", "snoozed")
    .lte("next_due", today)

  if (reactivateError) {
    return NextResponse.json({ error: reactivateError.message }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const context = parseScoringContext(searchParams, today)

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "id, title, category, estimated_minutes, chunked, snooze_budget, priority, energy, next_due, notify_days_before, created_at, status, user_id, recurrence_rule, last_done_at, recurrence_text, notify_time_of_day, notify_escalate, due_date, space, context_tags, source, visibility, updated_at",
    )
    .eq("user_id", user.id)
    .eq("status", "active")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const activeTasks = (tasks ?? []) as TaskRow[]

  if (activeTasks.length === 0) {
    return NextResponse.json({ tasks: [] })
  }

  const taskIds = activeTasks.map((task) => task.id)

  const { data: snoozeEvents, error: snoozeError } = await supabase
    .from("task_events")
    .select("task_id")
    .eq("event_type", "snoozed")
    .in("task_id", taskIds)

  if (snoozeError) {
    return NextResponse.json({ error: snoozeError.message }, { status: 500 })
  }

  const snoozeCountByTask = new Map<string, number>()
  for (const row of snoozeEvents ?? []) {
    const taskId = row.task_id as string
    snoozeCountByTask.set(taskId, (snoozeCountByTask.get(taskId) ?? 0) + 1)
  }

  const sorted = [...activeTasks].sort((a, b) => {
    const scoreA = scoreTask(a, context, snoozeCountByTask.get(a.id) ?? 0)
    const scoreB = scoreTask(b, context, snoozeCountByTask.get(b.id) ?? 0)
    return scoreB - scoreA
  })

  return NextResponse.json({ tasks: sorted })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Omit<TaskInsert, "user_id">
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body?.title?.trim() || !body?.category?.trim()) {
    return NextResponse.json(
      { error: "title and category are required" },
      { status: 400 },
    )
  }

  const { supabase, user } = auth

  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data }, { status: 201 })
}
