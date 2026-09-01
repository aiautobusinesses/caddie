import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import {
  parseIntervals,
  intervalForMonth,
  computeNextDueAt,
  computeInitialNextDueAt,
  isGenuinelyOverdue,
  daysUntilDue,
  buildCareReason,
} from "@/lib/care"
import { buildCareGroup } from "@/lib/care-grouping"
import {
  TASKS_UPDATED_EVENT,
  notifyTasksUpdated,
  saveCapturedThings,
} from "@/lib/capture"
import { getSupabasePublishableKey, getSupabaseUrl, getEncryptionKey, hasSupabaseEnv } from "@/lib/env"
import { parseLifeWalkResultFromModelText, expandIntervals } from "@/lib/lifewalk-parse"
import { createClient as createServiceClient } from "@/lib/supabase/server-service"
import { isTaskUrgency, isStepEventInput } from "@/lib/tasks"

describe("care helpers", () => {
  it("parses valid monthly intervals and rejects invalid input", () => {
    const valid = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1]))
    expect(parseIntervals(valid)).toEqual(valid)
    expect(parseIntervals(null)).toBeNull()
    expect(parseIntervals([])).toBeNull()
    expect(parseIntervals({ ...valid, 4: 0 })).toBeNull()
  })

  it("computes care timing helpers", () => {
    const intervals = Object.fromEntries(Array.from({ length: 12 }, () => ["1", 7])) as Record<string, number>
    intervals["2"] = 5
    expect(intervalForMonth(intervals, "2024-02-10")).toBe(5)
    expect(computeNextDueAt("2024-02-10T12:00:00.000Z", intervals)).toBe("2024-02-15")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"))
    expect(computeInitialNextDueAt(intervals)).toBe("2024-02-06")
    expect(isGenuinelyOverdue("2024-02-01", 2, "2024-02-04")).toBe(true)
    expect(daysUntilDue("2024-02-04", "2024-02-01")).toBe(3)
    expect(buildCareReason("2024-02-01", "2024-01-25", 0, "2024-02-04")).toBe("hasn't been done in 10 days")
    expect(buildCareReason("2024-02-01", null, 0, "2024-02-04")).toBe("hasn't been done in a while")
    expect(buildCareReason("2024-02-01", null, 4, "2024-02-01")).toBeNull()
    expect(buildCareReason("2024-02-10", null, 4, "2024-02-01")).toBeNull()
    expect(buildCareReason(null, null, 0, "2024-02-01")).toBeNull()
  })

  it("intervalForMonth falls back to 7 when month key is missing", () => {
    // lib/care.ts:26 — intervals[String(month)] ?? 7 fallback
    const sparse: Record<string, number> = { "1": 10 } // only January
    expect(intervalForMonth(sparse, "2024-06-15")).toBe(7) // June missing → fallback 7
  })

  it("buildCareReason uses singular 'day' when days === 1", () => {
    // lib/care.ts:80 — days === 1 branch
    // Exactly 1 day since lastDoneAt, and is genuinely overdue
    expect(buildCareReason("2024-02-01", "2024-01-31", 0, "2024-02-04")).toBe("hasn't been done in 4 days")
    // Trigger days===1: lastDoneAt is 1 day before today, genuinely overdue
    expect(buildCareReason("2024-02-02", "2024-02-01", 0, "2024-02-03")).toBe("hasn't been done in 2 days")
    expect(buildCareReason("2024-02-01", "2024-01-31", 0, "2024-02-02")).toBe("hasn't been done in 2 days")
    // exactly 1 day
    expect(buildCareReason("2024-01-31", "2024-01-30", 0, "2024-02-01")).toBe("hasn't been done in 2 days")
    expect(buildCareReason("2024-01-30", "2024-01-29", 0, "2024-01-31")).toBe("hasn't been done in 2 days")
    // Force 1 day: today is 2024-02-02, lastDoneAt is 2024-02-01, next_due past, overdue
    expect(buildCareReason("2024-01-30", "2024-02-01", 0, "2024-02-02")).toBe("hasn't been done in 1 day")
  })
})

describe("care grouping", () => {
  it("builds grouped and single care offers", () => {
    const base = {
      entity_id: "e1",
      intervals: {},
      tolerance_days: 2,
      overdue_days: 1,
      last_done_at: "2024-01-01",
      archived_at: null,
    }

    const group = buildCareGroup(
      [
        {
          ...base,
          id: "a",
          action: "Water",
          next_due_at: "2024-02-01",
          entities: { id: "e1", name: "Fern", kind: "plant", location: "front room", archived_at: null },
        },
        {
          ...base,
          id: "b",
          entity_id: "e2",
          action: "Water",
          next_due_at: "2024-02-03",
          entities: { id: "e2", name: "Palm", kind: "plant", location: "front room", archived_at: null },
        },
      ],
      "2024-02-02",
    )

    expect(group).toMatchObject({
      anchor_plan_id: "a",
      title: "Water the front room plants",
      entity_names: ["Fern", "Palm"],
      plan_ids: ["a", "b"],
      has_overdue: false,
    })

    const single = buildCareGroup(
      [
        {
          ...base,
          id: "c",
          action: "Feed",
          next_due_at: "2024-02-01",
          entities: { id: "e3", name: "Orchid", kind: "plant", location: null, archived_at: null },
        },
      ],
      "2024-02-01",
    )

    expect(single).toMatchObject({ title: "Feed Orchid", has_overdue: false })
    expect(buildCareGroup([], "2024-02-01")).toBeNull()
  })

  it("sorts plans by next_due_at ascending (covers the :1 branch of ternary in sort)", () => {
    // Plans passed in reverse order so the sort comparator returns 1 for (b, a) pair
    const base = {
      entity_id: "e1",
      intervals: {},
      tolerance_days: 2,
      overdue_days: 1,
      last_done_at: "2024-01-01",
      archived_at: null,
    }
    const group = buildCareGroup(
      [
        { ...base, id: "b", action: "Water", next_due_at: "2024-02-03", entities: { id: "e2", name: "Palm", kind: "plant", location: null, archived_at: null } },
        { ...base, id: "a", entity_id: "e1", action: "Water", next_due_at: "2024-02-01", entities: { id: "e1", name: "Fern", kind: "plant", location: null, archived_at: null } },
      ],
      "2024-02-05",
    )
    // "a" (2024-02-01) should be the anchor — most overdue
    expect(group?.anchor_plan_id).toBe("a")
  })

  it("returns overdue wording when needed", () => {
    const result = buildCareGroup(
      [
        {
          id: "a",
          entity_id: "e1",
          action: "Water",
          intervals: {},
          tolerance_days: 0,
          overdue_days: 0,
          last_done_at: "2024-01-01",
          next_due_at: "2024-01-10",
          archived_at: null,
          entities: { id: "e1", name: "Fern", kind: "plant", location: null, archived_at: null },
        },
      ],
      "2024-01-20",
    )

    expect(result?.reason).toBe("hasn't been done in 19 days")
  })

  it("uses 'hasn't been done in a while' when last_done_at is null in overdue group", () => {
    // buildOverdueReason: !anchor.last_done_at → true branch
    const result = buildCareGroup(
      [{
        id: "a", entity_id: "e1", action: "Feed", intervals: {}, tolerance_days: 0,
        overdue_days: 0, last_done_at: null, next_due_at: "2024-01-10", archived_at: null,
        entities: { id: "e1", name: "Fern", kind: "plant", location: null, archived_at: null },
      }],
      "2024-01-20",
    )
    expect(result?.reason).toBe("hasn't been done in a while")
  })

  it("uses singular 'day' in overdue reason when exactly 1 day since last done", () => {
    // buildOverdueReason: days === 1 → singular "day"
    const result = buildCareGroup(
      [{
        id: "a", entity_id: "e1", action: "Water", intervals: {}, tolerance_days: 0,
        overdue_days: 0, last_done_at: "2024-01-19", next_due_at: "2024-01-10", archived_at: null,
        entities: { id: "e1", name: "Fern", kind: "plant", location: null, archived_at: null },
      }],
      "2024-01-20",
    )
    expect(result?.reason).toBe("hasn't been done in 1 day")
  })

  it("builds title using entity kind for multi-entity group", () => {
    // Title should use the entity kind, not a hardcoded noun.
    const base = { entity_id: "e1", intervals: {}, tolerance_days: 5, overdue_days: 1, last_done_at: null, archived_at: null }
    const result = buildCareGroup(
      [
        { ...base, id: "a", action: "Put out", next_due_at: "2024-02-01", entities: { id: "e1", name: "Recycling", kind: "bin", location: "kitchen", archived_at: null } },
        { ...base, id: "b", entity_id: "e2", action: "Put out", next_due_at: "2024-02-02", entities: { id: "e2", name: "General", kind: "bin", location: "kitchen", archived_at: null } },
      ],
      "2024-02-05",
    )
    expect(result?.title).toBe("Put out the kitchen bins")
  })

  it("does not double-pluralise kind that already ends in 's' (care-grouping.ts:137 true branch)", () => {
    // When anchor.entities.kind already ends with 's' (e.g. "bins"), the title must not
    // append another 's'. Covers the `kindPlural = anchor.entities.kind` branch (line 137-138).
    const base = { entity_id: "e1", intervals: {}, tolerance_days: 5, overdue_days: 1, last_done_at: null, archived_at: null }
    const result = buildCareGroup(
      [
        { ...base, id: "a", action: "Put out", next_due_at: "2024-02-01", entities: { id: "e1", name: "Recycling", kind: "bins", location: "kitchen", archived_at: null } },
        { ...base, id: "b", entity_id: "e2", action: "Put out", next_due_at: "2024-02-02", entities: { id: "e2", name: "General", kind: "bins", location: "kitchen", archived_at: null } },
      ],
      "2024-02-05",
    )
    // "bins" already ends with 's' — should stay "bins", not become "binss"
    expect(result?.title).toBe("Put out the kitchen bins")
  })

  it("deduplicates plans with same id in group (care-grouping.ts:108 false branch)", () => {
    // If a plan appears twice in the plans array with the same id, it's deduplicated
    const plan = {
      id: "a", entity_id: "e1", action: "Water", intervals: {}, tolerance_days: 5,
      overdue_days: 0, last_done_at: null, next_due_at: "2024-02-01", archived_at: null,
      entities: { id: "e1", name: "Fern", kind: "plant", location: null, archived_at: null },
    }
    const result = buildCareGroup([plan, plan], "2024-02-05")
    // Despite duplicate, only one member
    expect(result?.plan_ids).toHaveLength(1)
  })

  // INV: "Same action in a different room stays a separate offer — it's a different trip."
  // DESIGN.md §Grouping, line 180
  it("INV: same action + different room produces separate offers, not one merged group", () => {
    const base = {
      entity_id: "e1", intervals: {}, tolerance_days: 5, overdue_days: 0,
      last_done_at: null, archived_at: null,
    }
    const frontRoom = {
      ...base,
      id: "a", action: "Water", next_due_at: "2024-02-01",
      entities: { id: "e1", name: "Fern", kind: "plant", location: "front room", archived_at: null },
    }
    const bedroom = {
      ...base,
      id: "b", entity_id: "e2", action: "Water", next_due_at: "2024-02-01",
      entities: { id: "e2", name: "Pothos", kind: "plant", location: "bedroom", archived_at: null },
    }

    // buildCareGroup operates on a single anchor at a time — the grouping filter
    // must never pull in plans from a different location.
    // Call separately (as offer assembly would) to verify each produces its own group.
    const groupA = buildCareGroup([frontRoom, bedroom], "2024-02-05")
    const groupB = buildCareGroup([bedroom, frontRoom], "2024-02-05")

    // Each group contains only its own plan — the other-room plan must not bleed in
    expect(groupA?.plan_ids).not.toContain("b")
    expect(groupB?.plan_ids).not.toContain("a")
  })
})

describe("capture helpers", () => {
  it("dispatches the tasks updated event", () => {
    const handler = vi.fn()
    window.addEventListener(TASKS_UPDATED_EVENT, handler)
    notifyTasksUpdated()
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener(TASKS_UPDATED_EVENT, handler)
  })

  it("saves captured things and surfaces server errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 201 }))
    await expect(saveCapturedThings([{ name: "Thing", class: "project", domain: null, due_date: null, notify_window: null, steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean", needs_know_how: false }] }])).resolves.toBeUndefined()

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad save" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    )
    await expect(saveCapturedThings([])).rejects.toThrow("Bad save")
  })

  it("falls back to 'Failed to save' when error response has no string error field", async () => {
    // lib/capture.ts:19 — typeof data.error === "string" false branch
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 42 }), { status: 500, headers: { "Content-Type": "application/json" } }),
    )
    await expect(saveCapturedThings([])).rejects.toThrow("Failed to save")
  })

  it("falls back to 'Failed to save' when response body is not valid JSON (lib/capture.ts:17 catch)", async () => {
    // .json().catch(() => ({})) — the catch arrow fn fires when body is not JSON
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not json", { status: 500 }),
    )
    await expect(saveCapturedThings([])).rejects.toThrow("Failed to save")
  })

  it("throws when supabase update returns an error in completeOnboarding", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "update failed" } })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } })

    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({ auth: { getUser }, from }),
    }))

    const { completeOnboarding: importedCompleteOnboarding } = await import("@/lib/capture")
    await expect(importedCompleteOnboarding()).rejects.toThrow("update failed")
  })

  it("completes onboarding when a user exists", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } })

    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({ auth: { getUser }, from }),
    }))

    const { completeOnboarding: importedCompleteOnboarding } = await import("@/lib/capture")
    await importedCompleteOnboarding()
    expect(update).toHaveBeenCalledWith({ onboarding_done: true })

    getUser.mockResolvedValueOnce({ data: { user: null } })
    await importedCompleteOnboarding()
    expect(eq).toHaveBeenCalledTimes(1)
  })
})

describe("env helpers", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("reads required env vars", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk"
    expect(getSupabaseUrl()).toBe("https://example.supabase.co")
    expect(getSupabasePublishableKey()).toBe("pk")
    expect(hasSupabaseEnv).toBe(false)
  })

  it("throws when required env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    expect(() => getSupabaseUrl()).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL")
    expect(() => getSupabasePublishableKey()).toThrow("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  })

  it("getEncryptionKey throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY
    expect(() => getEncryptionKey()).toThrow("Missing ENCRYPTION_KEY")
  })

  it("getEncryptionKey throws when ENCRYPTION_KEY is not a 64-char hex string", () => {
    process.env.ENCRYPTION_KEY = "tooshort"
    expect(() => getEncryptionKey()).toThrow("64-character hex string")
  })
})

describe("lifewalk parser", () => {
  // Helper: wrap a things array in the envelope the parser now expects
  function envelope(things: unknown[], entities: unknown[] = []) {
    return JSON.stringify({ things, entities })
  }

  const validThing = { name: "Thing", class: "project", steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean" }] }

  it("parses fenced json and wrapped object payloads", () => {
    const fenced = parseLifeWalkResultFromModelText(
      '```json\n' + envelope([{ name: "Test", class: "project", domain: "home", due_date: null, notify_window: null, notify_time_of_day: "morning", notify_escalate: true, steps: [{ name: "Do it", band: "run", mode: "thinking", shape: "bleeds", needs_know_how: false }] }]) + '\n```',
    )
    expect(fenced.things[0].steps[0]).toMatchObject({ band: "run", mode: "thinking", shape: "bleeds" })
    expect(fenced.things[0].domain).toBe("home")
    expect(fenced.things[0].due_date).toBeNull()

    const wrapped = parseLifeWalkResultFromModelText(
      'prefix ' + envelope([{ name: " Another ", class: "other", notify_window: 2, steps: [{ name: " Step ", band: "bad", mode: "bad", shape: "bad" }] }]) + ' suffix',
    )
    expect(wrapped.things[0]).toMatchObject({ name: "Another", class: "project", notify_window: 2 })
    expect(wrapped.things[0].steps[0]).toMatchObject({ name: "Step", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false })
    expect(wrapped.things[0].steps[0]).not.toHaveProperty("recurrence_rule")
    expect(wrapped.things[0].steps[0]).not.toHaveProperty("next_due")
  })

  it("throws on invalid payloads", () => {
    expect(() => parseLifeWalkResultFromModelText("hello")).toThrow("No JSON object found")
    expect(() => parseLifeWalkResultFromModelText(envelope([]))).toThrow("Nothing concrete found in narration")
  })

  it("filters null/non-object items in array (lib/lifewalk-parse.ts:100,138)", () => {
    const result = parseLifeWalkResultFromModelText(envelope([null, validThing]))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].name).toBe("Thing")
  })

  it("filters items where name is not a string (lib/lifewalk-parse.ts:103)", () => {
    const noName = { class: "project", steps: [{ name: "Step" }] }
    const result = parseLifeWalkResultFromModelText(envelope([noName, validThing]))
    expect(result.things).toHaveLength(1)
  })

  it("filters items where all steps are invalid — normalizeThing returns null (lib/lifewalk-parse.ts:110,114)", () => {
    const badSteps = { name: "BadThing", class: "project", steps: [{ band: "short" }] }
    const result = parseLifeWalkResultFromModelText(envelope([badSteps, validThing]))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].name).toBe("Thing")
  })

  it("normalizeStep returns null for null/non-object step (lib/lifewalk-parse.ts:58)", () => {
    const thingWithNullStep = { name: "Thing", class: "project", steps: [null, { name: "Step", band: "short" }] }
    const result = parseLifeWalkResultFromModelText(envelope([thingWithNullStep]))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].steps).toHaveLength(1)
  })

  it("handles non-array steps property (lib/lifewalk-parse.ts:107 false branch)", () => {
    const nonArraySteps = { name: "BadThing", class: "project", steps: "not-array" }
    const result = parseLifeWalkResultFromModelText(envelope([nonArraySteps, validThing]))
    expect(result.things).toHaveLength(1)
    expect(result.things[0].name).toBe("Thing")
  })

  it("handles missing things/entities keys — both default to empty, throws EmptyExtractionError", () => {
    // An object with no things/entities keys → both lists empty → EmptyExtractionError
    expect(() => parseLifeWalkResultFromModelText("{}")).toThrow("Nothing concrete found in narration")
  })

  it("uses default tolerance_days=2 and overdue_days=7 when non-numeric (lib/lifewalk-parse.ts:153-154 false branch)", () => {
    // normalizeEntity: tolerance_days/overdue_days default to 2/7 when not a number.
    const entity = {
      name: "Fern", kind: "plant", location: null, action: "Water",
      intervals: { "1": 7, "2": 7, "3": 7, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 7, "10": 7, "11": 7, "12": 7 },
      tolerance_days: "not-a-number",   // non-numeric → default 2
      overdue_days: "also-not-a-number", // non-numeric → default 7
    }
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({ things: [validThing], entities: [entity] })
    )
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].tolerance_days).toBe(2)
    expect(result.entities[0].overdue_days).toBe(7)
  })

  it("does not count null/undefined entity items as drops (lib/lifewalk-parse.ts:181 false branch)", () => {
    // The `else if (item !== null && item !== undefined)` false branch:
    // when normalizeEntity returns null because item itself is null/undefined.
    // Those are structural JSON noise and must NOT increment entities_dropped.
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({ things: [validThing], entities: [null, undefined] })
    )
    // null and undefined items are silently skipped, not counted as drops
    expect(result.entities_dropped).toBe(0)
    expect(result.entities).toHaveLength(0)
  })
})


describe("expandIntervals", () => {
  it("produces all 12 keys from base_days alone", () => {
    const result = expandIntervals({ base_days: 14 })
    expect(Object.keys(result)).toHaveLength(12)
    for (let m = 1; m <= 12; m++) {
      expect(result[String(m)]).toBe(14)
    }
  })

  it("applies summer_days to June, July, August; base_days to all other months", () => {
    const result = expandIntervals({ base_days: 14, summer_days: 5 })
    expect(result["6"]).toBe(5)
    expect(result["7"]).toBe(5)
    expect(result["8"]).toBe(5)
    const winterMonths = [1, 2, 3, 4, 5, 9, 10, 11, 12]
    for (const m of winterMonths) expect(result[String(m)]).toBe(14)
  })

  it("applies spring_days to March, April, May", () => {
    const result = expandIntervals({ base_days: 14, spring_days: 10 })
    expect(result["3"]).toBe(10)
    expect(result["4"]).toBe(10)
    expect(result["5"]).toBe(10)
    expect(result["6"]).toBe(14) // summer unaffected
  })

  it("applies autumn_days to September, October, November", () => {
    const result = expandIntervals({ base_days: 14, autumn_days: 10 })
    expect(result["9"]).toBe(10)
    expect(result["10"]).toBe(10)
    expect(result["11"]).toBe(10)
    expect(result["8"]).toBe(14) // summer unaffected
  })

  it("all three seasonal overrides together with base produces valid parseIntervals output", () => {
    const expanded = expandIntervals({ base_days: 14, summer_days: 5, spring_days: 10, autumn_days: 10 })
    expect(Object.keys(expanded)).toHaveLength(12)
    const parsed = parseIntervals(expanded)
    expect(parsed).not.toBeNull()
    expect(parsed!["1"]).toBe(14)
    expect(parsed!["6"]).toBe(5)
    expect(parsed!["3"]).toBe(10)
    expect(parsed!["9"]).toBe(10)
    expect(parsed!["12"]).toBe(14)
  })

  it("ignores invalid summer_days (<1) and falls back to base", () => {
    const result = expandIntervals({ base_days: 14, summer_days: 0 })
    expect(result["7"]).toBe(14)
  })

  it("falls back to legacy intervals shape when base_days is absent", () => {
    const legacy = { "1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7,"8":7,"9":7,"10":7,"11":7,"12":7 }
    const result = expandIntervals({ intervals: legacy })
    expect(result).toBe(legacy)
  })

  it("returns empty object when neither compact nor legacy shape is present", () => {
    const result = expandIntervals({ name: "Fern" })
    expect(result).toEqual({})
  })
})


describe("normalizeDateOnly — branch coverage", () => {
  it("returns null when value is not a string (lib/lifewalk-parse.ts:10 false branch)", () => {
    // normalizeDateOnly is called for due_date which may be null, number, etc.
    // The non-string branch is line 10: `if (typeof value !== "string") return null`
    // Exercise it through normalizeThing by passing a numeric due_date.
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({
        things: [{ name: "T", class: "project", due_date: 12345, steps: [{ name: "S", band: "short", mode: "doing", shape: "clean" }] }],
        entities: [],
      })
    )
    // numeric due_date → normalizeDateOnly returns null
    expect(result.things[0].due_date).toBeNull()
  })

  it("returns null when due_date string does not match YYYY-MM-DD (lib/lifewalk-parse.ts:12 false branch)", () => {
    // The regex false branch: value is a string but doesn't match /^\d{4}-\d{2}-\d{2}$/.
    // Exercise through normalizeThing with a non-date string.
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({
        things: [{ name: "T", class: "project", due_date: "not-a-date", steps: [{ name: "S", band: "short", mode: "doing", shape: "clean" }] }],
        entities: [],
      })
    )
    // string but fails regex → returns null
    expect(result.things[0].due_date).toBeNull()
  })

  it("uses defaults for non-string kind/location/action in normalizeEntity (lib/lifewalk-parse.ts:147-149)", () => {
    // Covers the ternary false branches for kind/location/action when they are not strings.
    const anchorThing = { name: "T", class: "project", steps: [{ name: "S", band: "short", mode: "doing", shape: "clean" }] }
    const entity = {
      name: "Fern",
      kind: 42,           // non-string → "thing"
      location: 99,       // non-string → null
      action: undefined,  // non-string → "Care for"
      intervals: { "1": 7, "2": 7, "3": 7, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 7, "10": 7, "11": 7, "12": 7 },
      tolerance_days: 2, overdue_days: 5,
    }
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({ things: [anchorThing], entities: [entity] })
    )
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0].kind).toBe("thing")
    expect(result.entities[0].location).toBeNull()
    expect(result.entities[0].action).toBe("Care for")
  })

  it("uses empty string for non-string entity name, causing entity to be dropped (lib/lifewalk-parse.ts:144 false branch)", () => {
    // Covers the ternary false branch on line 144: `typeof item.name === "string" ? ... : ""`
    // then `if (!name) return null`. Non-string name → empty string → null returned → dropped.
    const anchorThing = { name: "T", class: "project", steps: [{ name: "S", band: "short", mode: "doing", shape: "clean" }] }
    const entity = {
      name: 999, // non-string → normalizeEntity returns null (dropped)
      kind: "plant", location: null, action: "Water",
      intervals: { "1": 7, "2": 7, "3": 7, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 7, "10": 7, "11": 7, "12": 7 },
      tolerance_days: 2, overdue_days: 5,
    }
    const result = parseLifeWalkResultFromModelText(
      JSON.stringify({ things: [anchorThing], entities: [entity] })
    )
    expect(result.entities).toHaveLength(0)
    expect(result.entities_dropped).toBe(1)
  })
})

describe("task and service helpers", () => {
  it("validates task enums", () => {
    expect(isStepEventInput("why")).toBe(true)
    expect(isStepEventInput("stopped")).toBe(true)
    expect(isStepEventInput("nudged_back")).toBe(true)
    expect(isStepEventInput("bad")).toBe(false)
    expect(isTaskUrgency("now")).toBe(true)
    expect(isTaskUrgency("later")).toBe(false)
  })

  it("builds a service-role supabase client", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role"
    const client = createServiceClient()
    expect(client).toBeTruthy()
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => createServiceClient()).toThrow("Missing SUPABASE_SERVICE_ROLE_KEY")
  })
})
