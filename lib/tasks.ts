import type { Database } from "@/lib/database.types"

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

/**
 * All event types accepted by the API and written to the DB.
 * Every value here is a real DB enum value — no more collapsing to "edited".
 */
export type StepEventInput = EventType

const STEP_EVENT_INPUTS: readonly StepEventInput[] = [
  "done", "edited", "notified", "offered", "accepted",
  "skipped", "nudged_back", "nudged_forward", "stopped", "why", "stop_note",
]

export function isStepEventInput(value: string): value is StepEventInput {
  return (STEP_EVENT_INPUTS as readonly string[]).includes(value)
}

/** Urgency labels used in Life Walk UI and Claude extraction. */
export type TaskUrgency = "now" | "soon" | "someday"

export function isTaskUrgency(value: string): value is TaskUrgency {
  return value === "now" || value === "soon" || value === "someday"
}

/**
 * Coarse domain categories assigned by the LLM at extraction.
 * Used only for spread variety — never displayed or made browsable.
 */
export type ThingDomain = "home" | "admin" | "vehicle" | "garden" | "finance" | "other"

const THING_DOMAINS: readonly ThingDomain[] = [
  "home", "admin", "vehicle", "garden", "finance", "other",
]

export function isThingDomain(value: unknown): value is ThingDomain {
  return typeof value === "string" && (THING_DOMAINS as string[]).includes(value)
}

/** Shape Claude returns for a single extracted step. */
export type LifeWalkExtractedStep = {
  name: string
  band: StepBand
  mode: StepMode
  shape: StepShape
  needs_know_how: boolean
}

/** Shape Claude returns for a single extracted thing (with its steps). */
export type LifeWalkExtractedThing = {
  name: string
  class: ThingClass
  domain: ThingDomain | null
  due_date: string | null
  notify_window: number | null
  notify_time_of_day?: NotifyTimeOfDay | null
  notify_escalate?: boolean
  steps: LifeWalkExtractedStep[]
}

/**
 * Shape Claude returns for a single recurring care entity.
 * Matches the fields accepted by the insert_entity_with_care_plan RPC
 * (via /api/entities). The LLM supplies seasonal intervals directly so
 * no second model call is needed.
 */
export type LifeWalkExtractedEntity = {
  name: string
  kind: string
  location: string | null
  action: string
  /** Monthly intervals: keys "1"–"12", values are integer days. */
  intervals: Record<string, number>
  tolerance_days: number
  overdue_days: number
}

/** Combined result returned by a single Life Walk extraction pass. */
export type LifeWalkExtractionResult = {
  things: LifeWalkExtractedThing[]
  entities: LifeWalkExtractedEntity[]
  /**
   * Number of entity items the model returned that were dropped during
   * normalisation (e.g. malformed or incomplete intervals). Routes add their
   * own RPC-failure drops to this before returning it to the client.
   */
  entities_dropped: number
}
