/**
 * Smoke-test for the Life Walk extraction shape.
 *
 * Runs a peace lily narration through the live Anthropic API and prints the
 * parsed result. Verifies the new two-array shape (things + entities) so that
 * recurring items are no longer silently dropped.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/test-extraction.mjs
 *
 * Optional override:
 *   ANTHROPIC_MODEL=claude-haiku-4-5-20251001 node scripts/test-extraction.mjs
 */

import Anthropic from "@anthropic-ai/sdk"

// Inline the parseIntervals logic from lib/care.ts so the script has no build dep.
function parseIntervals(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const result = {}
  for (let m = 1; m <= 12; m++) {
    const v = raw[String(m)]
    if (typeof v !== "number" || v < 1) return null
    result[String(m)] = v
  }
  return result
}

// Inline the expandIntervals logic from lib/lifewalk-parse.ts so the script
// handles the compact care shape the model now produces.
function expandIntervals(item) {
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
  return (item.intervals && typeof item.intervals === "object" && !Array.isArray(item.intervals))
    ? item.intervals : {}
}

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5"
const PROMPT_PATH = new URL("../lib/lifewalk-prompt.ts", import.meta.url).pathname

// Read the prompt directly from source to stay in sync without a build step.
// Strip the TypeScript export boilerplate — we just need the template string value.
import { readFileSync } from "fs"
const promptSrc = readFileSync(PROMPT_PATH.replace(/^\/([A-Z]:)/, "$1"), "utf8")
const promptMatch = promptSrc.match(/LIFEWALK_EXTRACTION_PROMPT\s*=\s*`([\s\S]*?)`\s*$/)
if (!promptMatch) {
  console.error("Could not extract LIFEWALK_EXTRACTION_PROMPT from lib/lifewalk-prompt.ts")
  process.exit(1)
}
const SYSTEM_PROMPT = promptMatch[1]

// ── Test narration ─────────────────────────────────────────────────────────────
// Contains both a thing (one-off project) and an entity (recurring care), so
// we can verify both arrays come back populated.

const NARRATION = `
I noticed the peace lily in the bedroom is looking a bit droopy — it needs watering
more regularly, especially now it's summer. Also the bath panel has come loose and
there's a bit of mould behind it that needs sorting.
`.trim()

// ── Run ────────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

console.log(`Model:     ${MODEL}`)
console.log(`Narration: ${NARRATION}\n`)

let raw
try {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Narration:\n${NARRATION}` }],
  })
  const block = message.content.find((b) => b.type === "text")
  raw = block?.text ?? ""
} catch (err) {
  console.error("API error:", err.message)
  process.exit(1)
}

// ── Parse ──────────────────────────────────────────────────────────────────────

let parsed
try {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  parsed = JSON.parse(cleaned)
} catch {
  console.error("Parse failed. Raw model output:\n", raw)
  process.exit(1)
}

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  console.error("Expected a JSON object, got:", typeof parsed)
  console.error("Raw output:\n", raw)
  process.exit(1)
}

const things = Array.isArray(parsed.things) ? parsed.things : []
const entities = Array.isArray(parsed.entities) ? parsed.entities : []

console.log(`── things (${things.length}) ──────────────────────────────────`)
for (const t of things) {
  console.log(`  ${t.name} [${t.class}] — ${t.steps?.length ?? 0} step(s)`)
  for (const s of t.steps ?? []) console.log(`    · ${s.name} (${s.band}, ${s.mode})`)
}

console.log(`\n── entities (${entities.length}) ────────────────────────────────`)
let entityFailures = 0
for (const e of entities) {
  const loc = e.location ? ` (${e.location})` : ""
  const careSource = (e.care && typeof e.care === "object" && !Array.isArray(e.care)) ? e.care : e
  const expanded = expandIntervals(careSource)
  const intervals = parseIntervals(expanded)
  if (!intervals) {
    const keys = Object.keys(expanded).sort()
    console.error(`  ✗ ${e.name}${loc} — INVALID intervals (keys present: [${keys.join(", ")}], need 1–12 all positive integers)`)
    entityFailures++
  } else {
    const allMonths = [1,2,3,4,5,6,7,8,9,10,11,12].map((m) => `${m}:${intervals[String(m)]}d`).join(", ")
    console.log(`  ✓ ${e.name}${loc} — ${e.action} — ${allMonths}`)
    console.log(`    tolerance ${e.tolerance_days}d, overdue ${e.overdue_days}d`)
  }
}

if (entities.length === 0) {
  console.error("\n✗ No entities extracted — peace lily should appear here.")
  process.exit(1)
}
if (things.length === 0) {
  console.error("\n✗ No things extracted — bath panel should appear here.")
  process.exit(1)
}
if (entityFailures > 0) {
  console.error(`\n✗ ${entityFailures} entity/entities have invalid intervals — would be silently dropped at save time.`)
  process.exit(1)
}

console.log("\n✓ Both things and entities extracted correctly.")
