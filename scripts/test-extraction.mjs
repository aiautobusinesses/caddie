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
for (const e of entities) {
  const loc = e.location ? ` (${e.location})` : ""
  const sample = [1, 6, 12].map((m) => `${m}:${e.intervals?.[String(m)] ?? "?"}d`).join(", ")
  console.log(`  ${e.name}${loc} — ${e.action} — intervals ${sample}`)
  console.log(`    tolerance ${e.tolerance_days}d, overdue ${e.overdue_days}d`)
}

if (entities.length === 0) {
  console.warn("\n⚠  No entities extracted — peace lily should appear here.")
  process.exit(1)
}
if (things.length === 0) {
  console.warn("\n⚠  No things extracted — bath panel should appear here.")
  process.exit(1)
}

console.log("\n✓ Both things and entities extracted correctly.")
