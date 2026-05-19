import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import type { TaskRow } from "@/lib/tasks"

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 })
  }

  const activeTasks = (tasks ?? []) as TaskRow[]

  if (activeTasks.length === 0) {
    return NextResponse.json({ tasks: [] })
  }

  const taskIds = activeTasks.map((task) => task.id)

  const { data: events, error: eventsError } = await supabase
    .from("task_events")
    .select("task_id, created_at")
    .eq("user_id", user.id)
    .in("task_id", taskIds)
    .order("created_at", { ascending: false })

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  const latestEventByTask = new Map<string, string>()
  for (const row of events ?? []) {
    const taskId = row.task_id as string
    if (!latestEventByTask.has(taskId)) {
      latestEventByTask.set(taskId, row.created_at as string)
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffIso = cutoff.toISOString()

  const auditTasks = activeTasks.filter((task) => {
    const latest = latestEventByTask.get(task.id)
    if (!latest) {
      return true
    }
    return latest < cutoffIso
  })

  return NextResponse.json({ tasks: auditTasks })
}
