/**
 * LLM seeding for care plans.
 *
 * Given a sentence like "fiddle-leaf fig in the front room", returns a
 * suggested entity + care plan. Never asserts certainty about a specific
 * plant's exact needs — always presents as an adjustable starting plan.
 */

import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-4-5"

const SYSTEM_PROMPT = `You help people set up care schedules for their plants, appliances, and household items.

Given a sentence describing something that needs regular care, extract the entity and generate a sensible starting care plan.

Return a JSON object with these fields:

- name: short plain English name (e.g. "Fiddle-leaf fig", "Green bin", "Boiler")
- kind: category in one or two words (e.g. "plant", "bin", "appliance", "vehicle")
- location: where it lives if mentioned (e.g. "front room", "kitchen"); null if not mentioned
- action: the primary recurring action in one or two words, imperative (e.g. "Water", "Feed", "Put out", "Service")
- intervals: object with keys "1" through "12" (month numbers) mapping to integer days between care actions.
  Use your knowledge of the entity to vary by season where it makes sense.
  For plants: water more in summer (e.g. 7 days) and less in winter (e.g. 14–21 days).
  For bins/appliances with fixed schedules: use the same value for all months.
  Be conservative — it's better to suggest slightly too often than too rarely.
- tolerance_days: integer — how many days early the action can be done without harm.
  Plants: 2–3. Bins on collection day: 0. Appliances: 3–7.
- overdue_days: integer — how many days past next_due before it genuinely matters.
  Plants: 5–14 depending on sensitivity. Bins: 0. Appliances: 30+.
- note: if the species/item is unrecognised or ambiguous, say so briefly (e.g. "Unrecognised species — generic plan applied"). Otherwise null.

Rules:
- Never claim certainty about a specific plant's exact needs.
- If unrecognised, generate a conservative generic plan and set note accordingly.
- Return ONLY valid JSON, no markdown, no code fences, no commentary.

Example for "fiddle-leaf fig in the front room":
{"name":"Fiddle-leaf fig","kind":"plant","location":"front room","action":"Water","intervals":{"1":21,"2":21,"3":14,"4":10,"5":7,"6":7,"7":7,"8":7,"9":10,"10":14,"11":21,"12":21},"tolerance_days":2,"overdue_days":7,"note":null}`

export type SeededCarePlan = {
  name: string
  kind: string
  location: string | null
  action: string
  intervals: Record<string, number>
  tolerance_days: number
  overdue_days: number
  note: string | null
}

export type SeedError = { error: string }

export async function seedCarePlan(sentence: string): Promise<SeededCarePlan | SeedError> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { error: "Entity capture is not configured (missing ANTHROPIC_API_KEY)." }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let text: string
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: sentence }],
    })

    const block = message.content.find((b) => b.type === "text")
    if (!block || block.type !== "text") {
      return { error: "Unexpected response from AI" }
    }
    text = block.text
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return { error: e.message || "AI request failed" }
    }
    return { error: e instanceof Error ? e.message : "AI request failed" }
  }

  return parseSeededCarePlan(text)
}

function parseSeededCarePlan(text: string): SeededCarePlan | SeedError {
  let raw: Record<string, unknown>
  try {
    let cleaned = text.trim()
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const parsed = JSON.parse(cleaned) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Not an object")
    }
    raw = parsed as Record<string, unknown>
  } catch {
    return { error: "Could not parse the care plan suggestion. Try again." }
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (!name) return { error: "Could not extract entity name" }

  const kind = typeof raw.kind === "string" ? raw.kind.trim() : "thing"
  const location = typeof raw.location === "string" ? raw.location.trim() || null : null
  const action = typeof raw.action === "string" ? raw.action.trim() : "Care for"
  const tolerance_days = typeof raw.tolerance_days === "number" ? raw.tolerance_days : 2
  const overdue_days = typeof raw.overdue_days === "number" ? raw.overdue_days : 7
  const note = typeof raw.note === "string" ? raw.note.trim() || null : null

  // Validate intervals
  if (!raw.intervals || typeof raw.intervals !== "object" || Array.isArray(raw.intervals)) {
    return { error: "Generated intervals were invalid" }
  }
  const rawIntervals = raw.intervals as Record<string, unknown>
  const intervals: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) {
    const v = rawIntervals[String(m)]
    if (typeof v === "number" && v >= 1) {
      intervals[String(m)] = Math.round(v)
    } else {
      // Fill missing months with a safe default
      intervals[String(m)] = 7
    }
  }

  return { name, kind, location, action, intervals, tolerance_days, overdue_days, note }
}
