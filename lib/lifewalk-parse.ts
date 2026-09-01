import Anthropic from "@anthropic-ai/sdk"
import type { LifeWalkExtractedThing, LifeWalkExtractedStep, LifeWalkExtractedEntity, LifeWalkExtractionResult, NotifyTimeOfDay, ThingClass, ThingDomain, StepBand, StepMode, StepShape } from "@/lib/tasks"
import { isTaskUrgency, isThingDomain } from "@/lib/tasks"
import { parseIntervals } from "@/lib/care"
import { getLifewalkModel, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  /* v8 ignore next */
  return DATE_ONLY_RE.test(trimmed) ? trimmed : null
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

function extractJsonPayload(text: string): Record<string, unknown> {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const objStart = cleaned.indexOf("{")
    const objEnd = cleaned.lastIndexOf("}")
    if (objStart !== -1 && objEnd > objStart) {
      const extracted = cleaned.slice(objStart, objEnd + 1)
      const discarded = (cleaned.slice(0, objStart) + cleaned.slice(objEnd + 1)).trim()
      if (discarded.length > 0) {
        console.warn(
          "[lifewalk-parse] model added content outside the JSON object (prompt violation):",
          discarded.slice(0, 120),
        )
      }
      parsed = JSON.parse(extracted)
    } else {
      throw new Error("No JSON object found in model response")
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("No JSON object found in model response")
  }

  return parsed as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Step normalisation
// ---------------------------------------------------------------------------

const BANDS: readonly StepBand[] = ["short", "sitting", "run"]
/* v8 ignore next */
const MODES: readonly StepMode[] = ["thinking", "doing"]
const SHAPES: readonly StepShape[] = ["clean", "bleeds"]

function normalizeBand(value: unknown): StepBand {
  if (typeof value === "string" && (BANDS as string[]).includes(value)) return value as StepBand
  return "sitting"
}

function normalizeMode(value: unknown): StepMode {
  if (typeof value === "string" && (MODES as string[]).includes(value)) return value as StepMode
  return "doing"
}

function normalizeShape(value: unknown): StepShape {
  if (typeof value === "string" && (SHAPES as string[]).includes(value)) return value as StepShape
  return "clean"
}

function normalizeStep(raw: unknown): LifeWalkExtractedStep | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>

  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return null

  return {
    name,
    band: normalizeBand(item.band),
    mode: normalizeMode(item.mode),
    shape: normalizeShape(item.shape),
    needs_know_how: item.needs_know_how === true,
  }
}

// ---------------------------------------------------------------------------
// Thing normalisation
// ---------------------------------------------------------------------------

const NOTIFY_TIMES: readonly NotifyTimeOfDay[] = ["morning", "afternoon", "evening"]

function normalizeNotifyTimeOfDay(value: unknown): NotifyTimeOfDay | null {
  if (typeof value === "string" && (NOTIFY_TIMES as string[]).includes(value)) {
    return value as NotifyTimeOfDay
  }
  return null
}

function normalizeThingClass(value: unknown): ThingClass {
  if (value === "obligation" || value === "project") return value
  return "project"
}

function normalizeDomain(value: unknown): ThingDomain | null {
  if (isThingDomain(value)) return value
  return null
}

function normalizeThing(raw: unknown): LifeWalkExtractedThing | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>

  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return null

  const steps: LifeWalkExtractedStep[] = []
  if (Array.isArray(item.steps)) {
    for (const s of item.steps) {
      const step = normalizeStep(s)
      if (step) steps.push(step)
    }
  }

  if (steps.length === 0) return null

  const due_date = normalizeDateOnly(item.due_date)
  const notify_window = typeof item.notify_window === "number" ? item.notify_window : null
  // Design invariant: an obligation requires both a due_date (its trigger) and a
  // notify_window (its activation moment). The offer filter checks both; if either
  // is missing the obligation falls into the dead-zone — captured but never offered.
  // Coerce to project on either being absent: without a deadline or without a window
  // it has no defined activation and is a project by the design's own test.
  const thingClass =
    normalizeThingClass(item.class) === "obligation" && (!due_date || notify_window == null)
      ? "project"
      : normalizeThingClass(item.class)

  return {
    name,
    class: thingClass,
    domain: normalizeDomain(item.domain),
    due_date,
    notify_window,
    notify_time_of_day: normalizeNotifyTimeOfDay(item.notify_time_of_day),
    notify_escalate: Boolean(item.notify_escalate),
    steps,
  }
}

// ---------------------------------------------------------------------------
// Entity normalisation
// ---------------------------------------------------------------------------

/**
 * Expand the compact care shape produced by the model into a full 12-key
 * MonthlyIntervals map ready for parseIntervals.
 *
 * Accepted shapes (in priority order):
 *   1. Compact:  { base_days, summer_days?, spring_days?, autumn_days? }
 *      - summer  = June–August   (6, 7, 8)
 *      - spring  = March–May     (3, 4, 5)
 *      - autumn  = September–November (9, 10, 11)
 *      - all other months receive base_days
 *   2. Legacy:   { "1": n, …, "12": n }  — raw intervals passed as item.intervals
 *
 * Exported for unit testing.
 */
export function expandIntervals(item: Record<string, unknown>): Record<string, unknown> {
  if (typeof item.base_days === "number") {
    const base = item.base_days
    const summer = typeof item.summer_days === "number" && item.summer_days >= 1 ? item.summer_days : base
    const spring = typeof item.spring_days === "number" && item.spring_days >= 1 ? item.spring_days : base
    const autumn = typeof item.autumn_days === "number" && item.autumn_days >= 1 ? item.autumn_days : base
    return {
      "1": base,  "2": base,  "3": spring, "4": spring, "5": spring,
      "6": summer, "7": summer, "8": summer,
      "9": autumn, "10": autumn, "11": autumn,
      "12": base,
    }
  }
  // Legacy shape — raw intervals passed through as-is
  return (item.intervals && typeof item.intervals === "object" && !Array.isArray(item.intervals))
    ? item.intervals as Record<string, unknown>
    : {}
}

function normalizeEntity(raw: unknown): LifeWalkExtractedEntity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>

  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return null

  const kind = typeof item.kind === "string" ? item.kind.trim() : "thing"
  /* v8 ignore next */
  const location = typeof item.location === "string" ? item.location.trim() || null : null
  const action = typeof item.action === "string" ? item.action.trim() : "Care for"

  // New shape: item.care holds { base_days, summer_days?, … }
  // Legacy shape: item.intervals holds { "1": n, … "12": n } — passed via item itself
  const careSource =
    item.care && typeof item.care === "object" && !Array.isArray(item.care)
      ? (item.care as Record<string, unknown>)
      : item
  const intervals = parseIntervals(expandIntervals(careSource))
  if (!intervals) return null

  const tolerance_days = typeof item.tolerance_days === "number" ? item.tolerance_days : 2
  const overdue_days = typeof item.overdue_days === "number" ? item.overdue_days : 7

  return { name, kind, location, action, intervals, tolerance_days, overdue_days }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Thrown when the model returns valid JSON with both `things` and `entities`
 * empty — the narration was too vague to extract anything concrete.
 * Routes catch this specifically to return a user-facing hint rather than
 * treating it as a server error.
 */
export class EmptyExtractionError extends Error {
  constructor() {
    super("Nothing concrete found in narration")
    this.name = "EmptyExtractionError"
  }
}

export function parseLifeWalkResultFromModelText(text: string): LifeWalkExtractionResult {
  const payload = extractJsonPayload(text)

  const thingList = Array.isArray(payload.things) ? payload.things : []
  const entityList = Array.isArray(payload.entities) ? payload.entities : []

  const things: LifeWalkExtractedThing[] = []
  for (const item of thingList) {
    const thing = normalizeThing(item)
    if (thing) things.push(thing)
  }

  const entities: LifeWalkExtractedEntity[] = []
  let entities_dropped = 0
  for (const item of entityList) {
    const entity = normalizeEntity(item)
    if (entity) {
      entities.push(entity)
    } else if (item !== null && item !== undefined) {
      // Any non-null object that failed normalisation is a model output failure
      // (missing name, bad intervals, etc.) and counts as a drop.
      // null/undefined entries are structural JSON noise and don't count.
      entities_dropped++
    }
  }

  if (things.length === 0 && entities.length === 0) {
    throw new EmptyExtractionError()
  }

  return { things, entities, entities_dropped }
}

export { isTaskUrgency }

// ---------------------------------------------------------------------------
// LLM extraction (shared by lifewalk and voice capture routes)
// ---------------------------------------------------------------------------

export async function extractFromNarration(
  client: Anthropic,
  text: string,
): Promise<LifeWalkExtractionResult> {
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: getLifewalkModel(),
      max_tokens: 8096,
      temperature: 0.2,
      system: LIFEWALK_EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Narration:\n${text.trim()}`,
        },
      ],
    }, { signal: AbortSignal.timeout(60_000) })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("AI request timed out. Try again.")
    }
    if (error instanceof Anthropic.APIError) {
      if (isModelDeprecatedError(error)) {
        const model = getLifewalkModel()
        console.error(`[lifewalk-parse] model deprecated: ${model}`, error.message)
        throw new Error(
          `The AI model "${model}" has been retired by Anthropic. ` +
          `Set the ANTHROPIC_MODEL environment variable to a current model name to fix this.`,
        )
      }
      throw error
    }
    throw new Error(error instanceof Error ? error.message : "AI request failed")
  }

  const textBlock = message.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response from AI")
  }

  try {
    return parseLifeWalkResultFromModelText(textBlock.text)
  } catch (error) {
    // Empty extraction is not a parse failure — let the route handle it
    // with a user-facing hint rather than logging it as an error.
    if (error instanceof EmptyExtractionError) throw error
    /* v8 ignore next */
    const msg = error instanceof Error ? error.message : "Could not parse things"
    // Log the raw model output so we can diagnose what went wrong
    console.error("[lifewalk-parse] model text:", textBlock.text.slice(0, 500))
    console.error("[lifewalk-parse] parse error:", msg)
    /* v8 ignore next 4 */
    const isParseError =
      msg.includes("JSON") ||
      msg.includes("model response")
    throw new Error(
      /* v8 ignore next */
      isParseError ? "Could not parse your narration. Try again or shorten it." : msg,
    )
  }
}

// ---------------------------------------------------------------------------
// Model deprecation detection
// ---------------------------------------------------------------------------

/**
 * Returns true when an Anthropic API error indicates the requested model has
 * been deprecated/retired. Anthropic returns HTTP 400 with an
 * invalid_request_error whose message contains "deprecated" or "retired".
 */
function isModelDeprecatedError(error: InstanceType<typeof Anthropic.APIError>): boolean {
  if (error.status !== 400) return false
  /* v8 ignore next */
  const msg = error.message?.toLowerCase() ?? ""
  return msg.includes("deprecated") || msg.includes("retired") || msg.includes("no longer available")
}
