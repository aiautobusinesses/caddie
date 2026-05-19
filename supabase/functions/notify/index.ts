import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push"

type NotifyTimeOfDay = "morning" | "afternoon" | "evening"

type TaskRow = {
  id: string
  user_id: string
  title: string
  category: string
  estimated_minutes: number | null
  notify_days_before: number
  notify_time_of_day: NotifyTimeOfDay
  next_due: string
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  subscription: webpush.PushSubscription
  endpoint: string
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split("T")[0]
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0]
}

function isDueForNotification(task: TaskRow, today: string): boolean {
  const cutoff = addDaysToDateString(today, task.notify_days_before)
  return task.next_due <= cutoff
}

function matchesNotifyTimeOfDay(task: TaskRow): boolean {
  const hour = new Date().getUTCHours()

  switch (task.notify_time_of_day) {
    case "morning":
      return hour >= 6 && hour <= 11
    case "afternoon":
      return hour >= 12 && hour <= 16
    case "evening":
      return hour >= 17 && hour <= 21
    default:
      return false
  }
}

function buildNotificationBody(task: TaskRow): string {
  const minutes =
    task.estimated_minutes != null ? `${task.estimated_minutes} min` : null
  return minutes ? `${task.category} · ${minutes}` : task.category
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response(JSON.stringify({ error: "Missing environment configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const today = todayDateString()
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select(
      "id, user_id, title, category, estimated_minutes, notify_days_before, notify_time_of_day, next_due",
    )
    .eq("status", "active")
    .not("next_due", "is", null)

  if (tasksError) {
    return new Response(JSON.stringify({ error: tasksError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const dueTasks = (tasks as TaskRow[])
    .filter((task) => isDueForNotification(task, today))
    .filter(matchesNotifyTimeOfDay)

  if (dueTasks.length === 0) {
    return new Response(JSON.stringify({ sent: 0, tasks: 0 }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  const taskIds = dueTasks.map((task) => task.id)

  const { data: recentNotified, error: eventsError } = await supabase
    .from("task_events")
    .select("task_id")
    .eq("event_type", "notified")
    .gte("created_at", twentyHoursAgo)
    .in("task_id", taskIds)

  if (eventsError) {
    return new Response(JSON.stringify({ error: eventsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const recentlyNotifiedIds = new Set(
    (recentNotified ?? []).map((row) => row.task_id as string),
  )

  const tasksToNotify = dueTasks.filter((task) => !recentlyNotifiedIds.has(task.id))

  let sentCount = 0
  let deletedSubscriptions = 0
  const errors: string[] = []

  for (const task of tasksToNotify) {
    const { data: subscriptions, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, subscription, endpoint")
      .eq("user_id", task.user_id)

    if (subsError) {
      errors.push(`subscriptions:${task.id}:${subsError.message}`)
      continue
    }

    if (!subscriptions?.length) {
      continue
    }

    const payload = JSON.stringify({
      title: task.title,
      body: buildNotificationBody(task),
      taskId: task.id,
      actions: ["done", "later", "tomorrow"],
    })

    let delivered = false

    for (const row of subscriptions as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification(row.subscription, payload)
        delivered = true
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode: number }).statusCode)
            : null

        if (statusCode === 410) {
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", row.id)

          if (!deleteError) {
            deletedSubscriptions += 1
          }
        } else {
          const message = error instanceof Error ? error.message : "Push send failed"
          errors.push(`push:${row.endpoint}:${message}`)
        }
      }
    }

    if (delivered) {
      const sentAt = new Date().toISOString()
      const { error: eventError } = await supabase.from("task_events").insert({
        task_id: task.id,
        user_id: task.user_id,
        event_type: "notified",
        metadata: { sent_at: sentAt },
      })

      if (eventError) {
        errors.push(`event:${task.id}:${eventError.message}`)
      } else {
        sentCount += 1
      }
    }
  }

  return new Response(
    JSON.stringify({
      sent: sentCount,
      tasks: tasksToNotify.length,
      deleted_subscriptions: deletedSubscriptions,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  )
})
