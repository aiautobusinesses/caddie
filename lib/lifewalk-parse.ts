import type { LifeWalkExtractedTask, TaskUrgency } from "@/lib/tasks"
import { isTaskUrgency, normalizeNotifyTimeOfDay } from "@/lib/tasks"

function extractJsonPayload(text: string): unknown {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf("[")
    const end = cleaned.lastIndexOf("]")
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }

    const objStart = cleaned.indexOf("{")
    const objEnd = cleaned.lastIndexOf("}")
    if (objStart !== -1 && objEnd > objStart) {
      const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>
      if (Array.isArray(obj.tasks)) {
        return obj.tasks
      }
    }

    throw new Error("No JSON array found in model response")
  }
}

function normalizeUrgency(value: unknown): TaskUrgency {
  if (typeof value === "string" && isTaskUrgency(value)) {
    return value
  }
  return "soon"
}

function normalizeTask(raw: unknown): LifeWalkExtractedTask | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const item = raw as Record<string, unknown>
  const title = typeof item.title === "string" ? item.title.trim() : ""
  if (!title) {
    return null
  }

  const category =
    typeof item.category === "string" && item.category.trim()
      ? item.category.trim()
      : "Other"

  let estimatedMinutes: number | null = null
  if (typeof item.estimatedMinutes === "number" && Number.isFinite(item.estimatedMinutes)) {
    estimatedMinutes = item.estimatedMinutes
  }

  const recurrence =
    typeof item.recurrence === "string"
      ? item.recurrence
      : item.recurrence === null
        ? null
        : null

  return {
    title,
    category,
    urgency: normalizeUrgency(item.urgency),
    estimatedMinutes,
    recurrence,
    recurrence_rule:
      item.recurrence_rule && typeof item.recurrence_rule === "object"
        ? (item.recurrence_rule as LifeWalkExtractedTask["recurrence_rule"])
        : null,
    notify_days_before:
      typeof item.notify_days_before === "number"
        ? item.notify_days_before
        : 0,
    notify_time_of_day: normalizeNotifyTimeOfDay(
      typeof item.notify_time_of_day === "string"
        ? (item.notify_time_of_day as LifeWalkExtractedTask["notify_time_of_day"])
        : undefined,
    ),
    notify_escalate: Boolean(item.notify_escalate),
  }
}

export function parseLifeWalkTasksFromModelText(text: string): LifeWalkExtractedTask[] {
  const payload = extractJsonPayload(text)
  const list = Array.isArray(payload) ? payload : []

  const tasks: LifeWalkExtractedTask[] = []
  for (const item of list) {
    const task = normalizeTask(item)
    if (task) {
      tasks.push(task)
    }
  }

  if (tasks.length === 0) {
    throw new Error("No valid tasks in model response")
  }

  return tasks
}
