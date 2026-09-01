import Anthropic from "@anthropic-ai/sdk"
import { normalizeDateOnly } from "@/lib/recurrence"
import type { LifeWalkExtractedThing, LifeWalkExtractedStep, LifeWalkExtractedEntity, LifeWalkExtractionResult, NotifyTimeOfDay, ThingClass, ThingDomain, StepBand, StepMode, StepShape } from "@/lib/tasks"
import { isTaskUrgency, isThingDomain } from "@/lib/tasks"
import { parseIntervals } from "@/lib/care"
import { getLifewalkModel, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

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
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1))
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

  return {
    name,
    class: normalizeThingClass(item.class),
    domain: normalizeDomain(item.domain),
    due_date: normalizeDateOnly(item.due_date),
    notify_window:
      typeof item.notify_window === "number" ? item.notify_window : null,
    notify_time_of_day: normalizeNotifyTimeOfDay(item.notify_time_of_day),
    notify_escalate: Boolean(item.notify_escalate),
    steps,
  }
}

// ---------------------------------------------------------------------------
// Entity normalisation
// ---------------------------------------------------------------------------

function normalizeEntity(raw: unknown): LifeWalkExtractedEntity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>

  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return null

  const kind = typeof item.kind === "string" ? item.kind.trim() : "thing"
  const location = typeof item.location === "string" ? item.location.trim() || null : null
  const action = typeof item.action === "string" ? item.action.trim() : "Care for"

  const intervals = parseIntervals(item.intervals)
  if (!intervals) return null

  const tolerance_days = typeof item.tolerance_days === "number" ? item.tolerance_days : 2
  const overdue_days = typeof item.overdue_days === "number" ? item.overdue_days : 7

  return { name, kind, location, action, intervals, tolerance_days, overdue_days }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

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
  for (const item of entityList) {
    const entity = normalizeEntity(item)
    if (entity) entities.push(entity)
  }

  if (things.length === 0 && entities.length === 0) {
    throw new Error("No valid things in model response")
  }

  return { things, entities }
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
    /* v8 ignore next */
    const msg = error instanceof Error ? error.message : "Could not parse things"
    // Log the raw model output so we can diagnose what went wrong
    console.error("[lifewalk-parse] model text:", textBlock.text.slice(0, 500))
    console.error("[lifewalk-parse] parse error:", msg)
    /* v8 ignore next 4 */
    const isParseError =
      msg.includes("JSON") ||
      msg.includes("No valid things") ||
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
