import type { Database } from "@/lib/database.types"
import type { RecurrenceRule } from "@/lib/recurrence"

export type TaskPriority = Database["public"]["Enums"]["task_priority"]
export type TaskEnergy = Database["public"]["Enums"]["task_energy"]
export type TaskSource = Database["public"]["Enums"]["task_source"]
export type TaskStatus = Database["public"]["Enums"]["task_status"]
export type TaskEventType = Database["public"]["Enums"]["event_type"]

/** API input; `why` is stored as `edited` with metadata.kind = "why". */
export type TaskEventInput = TaskEventType | "why"

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"]
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"]

/** Urgency labels used in Life Walk UI and Claude extraction. */
export type TaskUrgency = "now" | "soon" | "someday"

export type NotifyTimeOfDay = Database["public"]["Enums"]["notify_time_of_day"]

export type LifeWalkExtractedTask = {
  title: string
  category: string
  urgency: TaskUrgency
  energy?: TaskEnergy
  estimatedMinutes: number | null
  recurrence: string | null
  recurrence_rule?: RecurrenceRule | null
  notify_days_before?: number
  notify_time_of_day?: NotifyTimeOfDay
  notify_escalate?: boolean
}

const NOTIFY_TIMES: readonly NotifyTimeOfDay[] = ["morning", "afternoon", "evening"]

export function normalizeNotifyTimeOfDay(
  value: NotifyTimeOfDay | undefined | null,
): NotifyTimeOfDay {
  if (value && NOTIFY_TIMES.includes(value)) {
    return value
  }
  return "morning"
}

const URGENCY_TO_PRIORITY: Record<TaskUrgency, TaskPriority> = {
  now: "high",
  soon: "medium",
  someday: "low",
}

const PRIORITY_TO_URGENCY: Record<TaskPriority, TaskUrgency> = {
  high: "now",
  medium: "soon",
  low: "someday",
}

const TASK_ENERGIES: readonly TaskEnergy[] = ["low", "medium", "high"]

export function urgencyToPriority(urgency: TaskUrgency): TaskPriority {
  return URGENCY_TO_PRIORITY[urgency]
}

export function priorityToUrgency(priority: TaskPriority): TaskUrgency {
  return PRIORITY_TO_URGENCY[priority]
}

export function normalizeEnergy(energy: TaskEnergy | undefined | null): TaskEnergy {
  if (energy && TASK_ENERGIES.includes(energy)) {
    return energy
  }
  return "medium"
}

export function isTaskUrgency(value: string): value is TaskUrgency {
  return value === "now" || value === "soon" || value === "someday"
}

const TASK_EVENT_INPUTS: readonly TaskEventInput[] = [
  "done",
  "skipped",
  "snoozed",
  "edited",
  "why",
]

export function isTaskEventInput(value: string): value is TaskEventInput {
  return (TASK_EVENT_INPUTS as readonly string[]).includes(value)
}

export function resolveEventTypeForDb(eventType: TaskEventInput): TaskEventType {
  if (eventType === "why") {
    return "edited"
  }
  return eventType
}

/** Maps a Life Walk review task to a `tasks` insert row (without `user_id`). */
export function mapLifeWalkTaskToInsert(
  task: LifeWalkExtractedTask,
): Omit<TaskInsert, "user_id"> {
  return {
    title: task.title.trim(),
    category: task.category,
    priority: urgencyToPriority(task.urgency),
    energy: normalizeEnergy(task.energy),
    estimated_minutes: task.estimatedMinutes,
    recurrence_text: task.recurrence,
    recurrence_rule: task.recurrence_rule ?? null,
    notify_days_before: task.notify_days_before ?? 0,
    notify_time_of_day: normalizeNotifyTimeOfDay(task.notify_time_of_day),
    notify_escalate: task.notify_escalate ?? false,
    source: "life_walk",
    status: "active",
  }
}
