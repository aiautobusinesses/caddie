/**
 * Reliability runner for the Life Walk extraction pipeline.
 *
 * Runs each of the five canonical test cases N times and reports a
 * pass rate per case. A run is a PASS only when:
 *   - The expected arrays (things / entities) are present and non-empty
 *   - Every entity has a valid 12-key intervals map after expansion
 *   - Every thing has at least one step
 *   - For the `vague` case: both arrays are empty and no parse error
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/test-extraction-repeat.mjs
 *
 * Optional overrides:
 *   RUNS=5   node scripts/test-extraction-repeat.mjs   (runs per case, default 3)
 *   ANTHROPIC_MODEL=claude-haiku-4-5-20251001  node scripts/test-extraction-repeat.mjs
 */

import Anthropic from "@anthropic-ai/sdk"
import { readFileSync } from "fs"

const RUNS  = parseInt(process.env.RUNS || "3", 10)
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5"

// ── Helpers (mirrored from lib/) ───────────────────────────────────────────────

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

function expandIntervals(item) {
  if (typeof item.base_days === "number") {
    const base   = item.base_days
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
  // Legacy full-map shape
  return (item.intervals && typeof item.intervals === "object" && !Array.isArray(item.intervals))
    ? item.intervals : {}
}

// ── Load prompt ────────────────────────────────────────────────────────────────

const PROMPT_PATH = new URL("../lib/lifewalk-prompt.ts", import.meta.url).pathname
const promptSrc   = readFileSync(PROMPT_PATH.replace(/^\/([A-Z]:)/, "$1"), "utf8")
const promptMatch = promptSrc.match(/LIFEWALK_EXTRACTION_PROMPT\s*=\s*`([\s\S]*?)`\s*$/)
if (!promptMatch) { console.error("Could not extract LIFEWALK_EXTRACTION_PROMPT"); process.exit(1) }
const SYSTEM_PROMPT = promptMatch[1]

// ── Test cases ─────────────────────────────────────────────────────────────────
// Five canonical cases — four from DESIGN.md §Life Walk extraction plus the
// vague case that tests graceful empty-extraction behaviour.

const CASES = [
  {
    name: "multi-step project",
    narration: `The bath panel in the en-suite has cracked right across the middle. I need to measure up, order a replacement, rip the old one out, treat the mould that's almost certainly behind it, and fit the new one. It's been on the list for months.`,
    expect: { things: true, entities: false },
  },
  {
    name: "single-step obligation",
    narration: `The MOT on the Touran is due on the fourteenth of March. I haven't booked it yet.`,
    expect: { things: true, entities: false },
  },
  {
    name: "recurring care",
    narration: `The peace lily in the bedroom is drooping again — it needs watering more regularly, especially now it's summer. In winter I barely touch it but from May through September it needs a drink every week or so.`,
    expect: { things: false, entities: true },
  },
  {
    name: "ambiguous",
    // Vague enough that the model must use judgement, specific enough that
    // something is clearly there. DESIGN.md notes the one-pass model produced
    // 3 restrained steps without inventing spurious obligations.
    narration: `The garage is a complete state — there's stuff everywhere, I can't get the car in, and I'm pretty sure there's a box of my dad's old tools in there somewhere that I keep meaning to sort through.`,
    expect: { things: true, entities: false },
  },
  {
    name: "vague",
    // The original garage narration, kept as its own case. Tests what happens
    // when the user speaks too vaguely to extract anything concrete.
    // Correct behaviour is: both arrays empty, no parse error, no crash.
    narration: `The garage is a complete state. Never quite know where to start.`,
    expect: { things: false, entities: false, allowEmpty: true },
  },
]

// ── Assertion ──────────────────────────────────────────────────────────────────

/**
 * Validate a single parsed model response against what the case expects.
 * Returns an array of failure strings (empty = pass).
 */
function assess(parsed, expect) {
  const failures = []

  const things   = Array.isArray(parsed?.things)   ? parsed.things   : []
  const entities = Array.isArray(parsed?.entities) ? parsed.entities : []

  if (expect.allowEmpty) {
    // Correct behaviour: model returned empty arrays, not an error or invented content
    if (things.length > 0) failures.push(`expected empty things but got ${things.length}`)
    if (entities.length > 0) failures.push(`expected empty entities but got ${entities.length}`)
    return failures
  }

  if (expect.things && things.length === 0) {
    failures.push("no things returned")
  }
  if (expect.entities && entities.length === 0) {
    failures.push("no entities returned")
  }

  for (const t of things) {
    const steps = Array.isArray(t.steps) ? t.steps : []
    if (steps.length === 0) failures.push(`thing "${t.name}" has no steps`)
  }

  for (const e of entities) {
    const careSource = (e.care && typeof e.care === "object" && !Array.isArray(e.care)) ? e.care : e
    const expanded   = expandIntervals(careSource)
    const intervals  = parseIntervals(expanded)
    if (!intervals) {
      const careStr = e.care ? JSON.stringify(e.care) : "(no care field)"
      failures.push(`entity "${e.name}" has invalid intervals — care=${careStr}`)
    }
  }

  return failures
}

// ── Run ────────────────────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

console.log(`Model: ${MODEL}   Runs per case: ${RUNS}\n`)

const summary = []

for (const tc of CASES) {
  console.log(`── ${tc.name} ${"─".repeat(Math.max(0, 52 - tc.name.length))}`)

  let passed = 0

  for (let i = 1; i <= RUNS; i++) {
    // ── call API ──
    let raw = ""
    try {
      const msg = await client.messages.create({
        model: MODEL, max_tokens: 4096, temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Narration:\n${tc.narration}` }],
      })
      raw = msg.content.find((b) => b.type === "text")?.text ?? ""
    } catch (err) {
      console.log(`  run ${i}: ✗ API error — ${err.message}`)
      continue
    }

    // ── parse JSON ──
    // Strip fences, then extract the first {...} in case the model appends
    // commentary after the JSON object (which the vague case can trigger).
    let parsed
    try {
      let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      const objStart = cleaned.indexOf("{")
      const objEnd   = cleaned.lastIndexOf("}")
      if (objStart !== -1 && objEnd > objStart) {
        const extracted = cleaned.slice(objStart, objEnd + 1)
        const discarded = (cleaned.slice(0, objStart) + cleaned.slice(objEnd + 1)).trim()
        if (discarded.length > 0) {
          console.warn(`  run ${i}: WARN model added content outside JSON (prompt violation): "${discarded.slice(0, 80)}"`)
        }
        cleaned = extracted
      }
      parsed = JSON.parse(cleaned)
    } catch {
      console.log(`  run ${i}: ✗ JSON parse failed — raw: ${raw.slice(0, 120).replace(/\n/g, " ")}`)
      continue
    }

    // ── assess ──
    const failures = assess(parsed, tc.expect)

    if (failures.length === 0) {
      // Summarise what came back
      const things   = parsed.things   ?? []
      const entities = parsed.entities ?? []
      const tSummary = things.map(t => `${t.name}(${t.steps?.length ?? 0}s)`).join(", ")
      const eSummary = entities.map(e => {
        const careSource = (e.care && typeof e.care === "object") ? e.care : e
        return `${e.name} care=${JSON.stringify(careSource)}`
      }).join(", ")
      const detail = [tSummary, eSummary].filter(Boolean).join(" | ")
      console.log(`  run ${i}: ✓  ${detail}`)
      passed++
    } else {
      console.log(`  run ${i}: ✗  ${failures.join("; ")}`)
    }
  }

  console.log(`  → ${passed}/${RUNS} passed\n`)
  summary.push({ name: tc.name, passed, total: RUNS })
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log("── summary " + "─".repeat(52))
let allPassed = true
for (const s of summary) {
  const ok = s.passed === s.total
  if (!ok) allPassed = false
  console.log(`  ${ok ? "✓" : "✗"} ${s.name.padEnd(28)} ${s.passed}/${s.total}`)
}
console.log("")

process.exit(allPassed ? 0 : 1)
