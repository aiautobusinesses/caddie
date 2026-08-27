import Anthropic from "@anthropic-ai/sdk"
import { parseRecurrenceRule, normalizeDateOnly } from "@/lib/recurrence"
import type { LifeWalkExtractedThing, LifeWalkExtractedStep, NotifyTimeOfDay, ThingClass, StepBand, StepMode, StepShape } from "@/lib/tasks"
import { isTaskUrgency } from "@/lib/tasks"
import { LIFEWALK_MODEL, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

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
    /* v8 ignore next 3 */
    if (objStart !== -1 && objEnd > objStart) {
      const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>
      if (Array.isArray(obj.things)) return obj.things
    }

    throw new Error("No JSON array found in model response")
  }
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

  const recurrence_rule =
    item.recurrence_rule && typeof item.recurrence_rule === "object"
      ? parseRecurrenceRule(item.recurrence_rule)
      : null

  const next_due = normalizeDateOnly(item.next_due)

  return {
    name,
    band: normalizeBand(item.band),
    mode: normalizeMode(item.mode),
    shape: normalizeShape(item.shape),
    needs_know_how: item.needs_know_how === true,
    recurrence_rule,
    next_due,
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
    notify_window:
      typeof item.notify_window === "number" ? item.notify_window : null,
    notify_time_of_day: normalizeNotifyTimeOfDay(item.notify_time_of_day),
    notify_escalate: Boolean(item.notify_escalate),
    steps,
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseLifeWalkThingsFromModelText(text: string): LifeWalkExtractedThing[] {
  const payload = extractJsonPayload(text)
  const list = Array.isArray(payload) ? payload : []

  const things: LifeWalkExtractedThing[] = []
  for (const item of list) {
    const thing = normalizeThing(item)
    if (thing) things.push(thing)
  }

  if (things.length === 0) {
    throw new Error("No valid things in model response")
  }

  return things
}

// Keep old export name as alias so the lifewalk route still compiles until rewritten
export { isTaskUrgency }

// ---------------------------------------------------------------------------
// LLM extraction (shared by lifewalk and voice capture routes)
// ---------------------------------------------------------------------------

export async function extractThingsFromNarration(
  client: Anthropic,
  text: string,
): Promise<LifeWalkExtractedThing[]> {
  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: LIFEWALK_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      system: LIFEWALK_EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Narration:\n${text.trim()}`,
        },
      ],
    }, { signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("AI request timed out. Try again.")
    }
    if (error instanceof Anthropic.APIError) {
      throw error
    }
    throw new Error(error instanceof Error ? error.message : "AI request failed")
  }

  const textBlock = message.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response from AI")
  }

  try {
    return parseLifeWalkThingsFromModelText(textBlock.text)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Could not parse things"
    const isParseError =
      msg.includes("JSON") ||
      msg.includes("No valid things") ||
      msg.includes("model response")
    throw new Error(
      isParseError ? "Could not parse your narration. Try again or shorten it." : msg,
    )
  }
}
