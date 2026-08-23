import type { Database } from "@/lib/database.types"
import type { RecurrenceRule } from "@/lib/recurrence"

export type ThingClass = Database["public"]["Enums"]["thing_class"]
export type TaskSource = Database["public"]["Enums"]["task_source"]
export type EventType = Database["public"]["Enums"]["event_type"]
export type NotifyTimeOfDay = Database["public"]["Enums"]["notify_time_of_day"]
export type StepBand = Database["public"]["Enums"]["step_band"]
export type StepMode = Database["public"]["Enums"]["step_mode"]
export type StepShape = Database["public"]["Enums"]["step_shape"]

export type ThingRow = Database["public"]["Tables"]["things"]["Row"]
export type ThingInsert = Database["public"]["Tables"]["things"]["Insert"]
export type StepRow = Database["public"]["Tables"]["steps"]["Row"]
export type StepInsert = Database["public"]["Tables"]["steps"]["Insert"]
export type StepEventRow = Database["public"]["Tables"]["step_events"]["Row"]

/** Event inputs accepted by the API; `why` is stored as `edited` with metadata. */
export type StepEventInput = EventType | "why"

const STEP_EVENT_INPUTS: readonly StepEventInput[] = [
  "done", "edited", "notified", "offered", "accepted",
  "skipped", "nudged_back", "nudged_forward", "why",
]

export function isStepEventInput(value: string): value is StepEventInput {
  return (STEP_EVENT_INPUTS as readonly string[]).includes(value)
}

export function resolveEventTypeForDb(eventType: StepEventInput): EventType {
  if (eventType === "why") return "edited"
  return eventType
}

/** Urgency labels used in Life Walk UI and Claude extraction. */
export type TaskUrgency = "now" | "soon" | "someday"

export function isTaskUrgency(value: string): value is TaskUrgency {
  return value === "now" || value === "soon" || value === "someday"
}

/** Shape Claude returns for a single extracted step. */
export type LifeWalkExtractedStep = {
  name: string
  band: StepBand
  mode: StepMode
  shape: StepShape
  recurrence_rule: RecurrenceRule | null
  next_due: string | null
}

/** Shape Claude returns for a single extracted thing (with its steps). */
export type LifeWalkExtractedThing = {
  name: string
  class: ThingClass
  notify_window: number | null
  notify_time_of_day?: NotifyTimeOfDay | null
  notify_escalate?: boolean
  steps: LifeWalkExtractedStep[]
}
