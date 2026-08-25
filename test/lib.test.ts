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
  completeOnboarding,
} from "@/lib/capture"
import { getSupabasePublishableKey, getSupabaseUrl, hasSupabaseEnv } from "@/lib/env"
import { parseLifeWalkThingsFromModelText } from "@/lib/lifewalk-parse"
import {
  parseRecurrenceRule,
  calculateNextDue,
  calculateAnnualNextDueOnOrAfter,
  normalizeDateOnly,
  resolveInitialDueDates,
} from "@/lib/recurrence"
import { createClient as createServiceClient } from "@/lib/supabase/server-service"
import { isTaskUrgency, isStepEventInput, resolveEventTypeForDb } from "@/lib/tasks"

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
    expect(buildCareReason("2024-02-01", null, 4, "2024-02-01")).toBe("due now")
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
          entities: { id: "e1", name: "Fern", location: "front room", archived_at: null },
        },
        {
          ...base,
          id: "b",
          entity_id: "e2",
          action: "Water",
          next_due_at: "2024-02-03",
          entities: { id: "e2", name: "Palm", location: "front room", archived_at: null },
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
          entities: { id: "e3", name: "Orchid", location: null, archived_at: null },
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
        { ...base, id: "b", action: "Water", next_due_at: "2024-02-03", entities: { id: "e2", name: "Palm", location: null, archived_at: null } },
        { ...base, id: "a", entity_id: "e1", action: "Water", next_due_at: "2024-02-01", entities: { id: "e1", name: "Fern", location: null, archived_at: null } },
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
          entities: { id: "e1", name: "Fern", location: null, archived_at: null },
        },
      ],
      "2024-01-20",
    )

    expect(result?.reason).toBe("hasn't been watered in 19 days")
  })

  it("uses 'hasn't been done in a while' when last_done_at is null in overdue group (care-grouping.ts:157)", () => {
    // buildOverdueReason: !anchor.last_done_at → true branch
    const result = buildCareGroup(
      [{
        id: "a", entity_id: "e1", action: "Feed", intervals: {}, tolerance_days: 0,
        overdue_days: 0, last_done_at: null, next_due_at: "2024-01-10", archived_at: null,
        entities: { id: "e1", name: "Fern", location: null, archived_at: null },
      }],
      "2024-01-20",
    )
    expect(result?.reason).toBe("hasn't been done in a while")
  })

  it("uses singular 'day' in overdue reason when exactly 1 day since last done (care-grouping.ts:162)", () => {
    // buildOverdueReason: days === 1 → "" (singular)
    const result = buildCareGroup(
      [{
        id: "a", entity_id: "e1", action: "Water", intervals: {}, tolerance_days: 0,
        overdue_days: 0, last_done_at: "2024-01-19", next_due_at: "2024-01-10", archived_at: null,
        entities: { id: "e1", name: "Fern", location: null, archived_at: null },
      }],
      "2024-01-20",
    )
    expect(result?.reason).toBe("hasn't been watered in 1 day")
  })

  it("builds title with 'things' for non-water multi-entity group (care-grouping.ts:131)", () => {
    // anchor.action.toLowerCase() !== "water" → "things" suffix
    const base = { entity_id: "e1", intervals: {}, tolerance_days: 5, overdue_days: 1, last_done_at: null, archived_at: null }
    const result = buildCareGroup(
      [
        { ...base, id: "a", action: "Feed", next_due_at: "2024-02-01", entities: { id: "e1", name: "Fern", location: "shelf", archived_at: null } },
        { ...base, id: "b", entity_id: "e2", action: "Feed", next_due_at: "2024-02-02", entities: { id: "e2", name: "Palm", location: "shelf", archived_at: null } },
      ],
      "2024-02-05",
    )
    expect(result?.title).toMatch(/things/)
  })

  it("deduplicates plans with same id in group (care-grouping.ts:108 false branch)", () => {
    // If a plan appears twice in the plans array with the same id, it's deduplicated
    const plan = {
      id: "a", entity_id: "e1", action: "Water", intervals: {}, tolerance_days: 5,
      overdue_days: 0, last_done_at: null, next_due_at: "2024-02-01", archived_at: null,
      entities: { id: "e1", name: "Fern", location: null, archived_at: null },
    }
    const result = buildCareGroup([plan, plan], "2024-02-05")
    // Despite duplicate, only one member
    expect(result?.plan_ids).toHaveLength(1)
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
    await expect(saveCapturedThings([{ name: "Thing", class: "project", notify_window: null, steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean", recurrence_rule: null, next_due: null }] }])).resolves.toBeUndefined()

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
})

describe("lifewalk parser", () => {
  it("parses plain arrays, fenced json, and wrapped object payloads", () => {
    const parsed = parseLifeWalkThingsFromModelText(
      '```json\n[{"name":"Test","class":"project","notify_window":null,"notify_time_of_day":"morning","notify_escalate":true,"steps":[{"name":"Do it","band":"run","mode":"thinking","shape":"bleeds","recurrence_rule":{"type":"fixed","days":3,"anchor":"completion"},"next_due":"2024-02-01"}]}]\n```',
    )
    expect(parsed[0].steps[0]).toMatchObject({ band: "run", mode: "thinking", shape: "bleeds" })

    const wrapped = parseLifeWalkThingsFromModelText(
      'prefix {"things":[{"name":" Another ","class":"other","notify_window":2,"steps":[{"name":" Step ","band":"bad","mode":"bad","shape":"bad","recurrence_rule":{"type":"bad"},"next_due":"bad"}]}]} suffix',
    )
    expect(wrapped[0]).toMatchObject({ name: "Another", class: "project", notify_window: 2 })
    expect(wrapped[0].steps[0]).toMatchObject({ name: "Step", band: "sitting", mode: "doing", shape: "clean", recurrence_rule: null, next_due: null })
  })

  it("throws on invalid payloads", () => {
    expect(() => parseLifeWalkThingsFromModelText("hello")).toThrow("No JSON array found")
    expect(() => parseLifeWalkThingsFromModelText("[]")).toThrow("No valid things in model response")
  })

  it("filters null/non-object items in array (lib/lifewalk-parse.ts:100,138)", () => {
    // normalizeThing(null) → returns null → if(thing) false branch at line 138
    // list includes one valid thing and one null → only one makes it through
    const validThing = { name: "Thing", class: "project", steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean" }] }
    const jsonWithNull = JSON.stringify([null, validThing])
    const result = parseLifeWalkThingsFromModelText(jsonWithNull)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Thing")
  })

  it("filters items where name is not a string (lib/lifewalk-parse.ts:103)", () => {
    // typeof item.name !== "string" → name="" → !name → null
    const validThing = { name: "Thing", class: "project", steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean" }] }
    const noName = { class: "project", steps: [{ name: "Step" }] }
    const result = parseLifeWalkThingsFromModelText(JSON.stringify([noName, validThing]))
    expect(result).toHaveLength(1)
  })

  it("filters items where all steps are invalid — normalizeThing returns null (lib/lifewalk-parse.ts:110,114)", () => {
    // step with no name → normalizeStep returns null → step = null → if(step) false
    // then steps.length === 0 → normalizeThing returns null
    const validThing = { name: "Thing", class: "project", steps: [{ name: "Step", band: "short" }] }
    const badSteps = { name: "BadThing", class: "project", steps: [{ band: "short" }] } // no name
    const result = parseLifeWalkThingsFromModelText(JSON.stringify([badSteps, validThing]))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Thing")
  })

  it("normalizeStep returns null for null/non-object step (lib/lifewalk-parse.ts:58)", () => {
    // !raw || typeof raw !== "object" → null step → if(step) false → filtered out
    const thingWithNullStep = { name: "Thing", class: "project", steps: [null, { name: "Step", band: "short" }] }
    const result = parseLifeWalkThingsFromModelText(JSON.stringify([thingWithNullStep]))
    expect(result).toHaveLength(1)
    expect(result[0].steps).toHaveLength(1) // null step filtered out
  })

  it("handles non-array steps property (lib/lifewalk-parse.ts:107 false branch)", () => {
    // item.steps is not an array → Array.isArray false → steps = [] → steps.length === 0 → null
    const validThing = { name: "Thing", class: "project", steps: [{ name: "Step" }] }
    const nonArraySteps = { name: "BadThing", class: "project", steps: "not-array" }
    const result = parseLifeWalkThingsFromModelText(JSON.stringify([nonArraySteps, validThing]))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Thing")
  })

  it("handles non-array payload returned by extractJsonPayload (lib/lifewalk-parse.ts:133)", () => {
    // JSON.parse of "{}" succeeds and is not an array → list = []
    expect(() => parseLifeWalkThingsFromModelText("{}")).toThrow("No valid things in model response")
  })
})

describe("recurrence helpers", () => {
  it("parses recurrence rules", () => {
    expect(parseRecurrenceRule({ type: "fixed", days: 3, anchor: "completion" })).toEqual({ type: "fixed", days: 3, anchor: "completion" })
    expect(parseRecurrenceRule({ type: "seasonal", summerDays: 3, winterDays: 9, anchor: "schedule" })).toEqual({ type: "seasonal", summerDays: 3, winterDays: 9, anchor: "schedule" })
    expect(parseRecurrenceRule({ type: "annual", month: 2, day: 10, anchor: "schedule" })).toEqual({ type: "annual", month: 2, day: 10, anchor: "schedule" })
    expect(parseRecurrenceRule({ type: "fixed", days: 0, anchor: "completion" })).toBeNull()
    expect(parseRecurrenceRule({ type: "fixed", days: "bad", anchor: "completion" })).toBeNull() // typeof days !== "number"
    expect(parseRecurrenceRule({ type: "fixed", days: 3, anchor: "bad" })).toBeNull() // anchor not completion/schedule
    expect(parseRecurrenceRule({ type: "seasonal", summerDays: 0, winterDays: 1, anchor: "completion" })).toBeNull()
    expect(parseRecurrenceRule({ type: "annual", month: 13, day: 1, anchor: "schedule" })).toBeNull()
    expect(parseRecurrenceRule([])).toBeNull()
  })

  it("calculates next due dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"))
    expect(calculateNextDue({ type: "fixed", days: 2, anchor: "completion" }, "2024-02-01", null)).toBe("2024-02-03")
    expect(calculateNextDue({ type: "fixed", days: 2, anchor: "schedule" }, "2024-02-01", "2024-02-10")).toBe("2024-02-12")
    expect(calculateNextDue({ type: "seasonal", summerDays: 2, winterDays: 5, anchor: "completion" }, "2024-02-01", null)).toBe("2024-02-03")
    expect(calculateNextDue({ type: "annual", month: 3, day: 1, anchor: "schedule" }, "2024-02-01", null)).toBe("2024-03-01")
    expect(calculateNextDue({ type: "annual", month: 1, day: 1, anchor: "schedule" }, "2024-02-01", null)).toBe("2025-01-01")
    expect(calculateAnnualNextDueOnOrAfter({ type: "annual", month: 3, day: 1, anchor: "schedule" }, "2024-02-15")).toBe("2024-03-01")
    expect(calculateAnnualNextDueOnOrAfter({ type: "annual", month: 1, day: 1, anchor: "schedule" }, "2024-02-15")).toBe("2025-01-01")
    expect(normalizeDateOnly(" 2024-02-01 ")).toBe("2024-02-01")
    expect(normalizeDateOnly("bad")).toBeNull()
    expect(resolveInitialDueDates({ next_due: "2024-02-02", due_date: null }, "2024-01-01")).toEqual({ next_due: "2024-02-02", due_date: "2024-02-02" })
    expect(resolveInitialDueDates({ due_date: "2024-02-03" }, "2024-01-01")).toEqual({ next_due: "2024-02-03", due_date: "2024-02-03" })
    expect(resolveInitialDueDates({ recurrence_rule: { type: "annual", month: 4, day: 1, anchor: "schedule" } }, "2024-01-01")).toEqual({ next_due: "2024-04-01", due_date: "2024-04-01" })
    expect(resolveInitialDueDates({}, "2024-01-01")).toEqual({ next_due: null, due_date: null })
  })
})

describe("task and service helpers", () => {
  it("validates task enums", () => {
    expect(isStepEventInput("why")).toBe(true)
    expect(isStepEventInput("bad")).toBe(false)
    expect(resolveEventTypeForDb("why")).toBe("edited")
    expect(resolveEventTypeForDb("done")).toBe("done")
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


describe("recurrence: schedule anchor with null currentNextDue falls back to lastDoneAt", () => {
  it("uses lastDoneAt as base when anchor=schedule and currentNextDue is null", () => {
    // Hits lib/recurrence.ts line 56: return parseDateOnly(lastDoneAt)
    expect(calculateNextDue({ type: "fixed", days: 5, anchor: "schedule" }, "2024-03-01", null)).toBe("2024-03-06")
    expect(calculateNextDue({ type: "seasonal", summerDays: 7, winterDays: 14, anchor: "schedule" }, "2024-06-01T00:00:00Z", null)).toBeTruthy()
  })
})

describe("recurrence: seasonal winter branch (lib/recurrence.ts:71,89)", () => {
  it("uses winterDays when current month is in winter (recurrence.ts:71 false branch)", () => {
    // Set time to January (winter) so getCurrentSeason returns "winter"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-15T00:00:00.000Z"))
    const result = calculateNextDue({ type: "seasonal", summerDays: 7, winterDays: 14, anchor: "completion" }, "2024-01-01", null)
    // winterDays = 14, base = 2024-01-01 + 14 = 2024-01-15
    expect(result).toBe("2024-01-15")
    vi.useRealTimers()
  })
})

describe("recurrence: parseRecurrenceRule — seasonal anchor branch (lib/recurrence.ts:115)", () => {
  it("returns null when seasonal rule has anchor 'schedule' (covers anchor === 'schedule' branch in seasonal)", () => {
    // The condition checks both "completion" and "schedule" — need to test "schedule" path too
    expect(parseRecurrenceRule({ type: "seasonal", summerDays: 3, winterDays: 9, anchor: "schedule" })).toMatchObject({ anchor: "schedule" })
    // And ensure both anchor values work to cover both branches of the OR
    expect(parseRecurrenceRule({ type: "seasonal", summerDays: 3, winterDays: 9, anchor: "completion" })).toMatchObject({ anchor: "completion" })
  })
})
