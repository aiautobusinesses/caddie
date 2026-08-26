import { describe, expect, it, vi } from "vitest"
import { computeOffer } from "@/lib/offer"
import type { OfferThingRow, OfferComputationInput } from "@/lib/offer"
import type { CarePlanRow } from "@/lib/care-grouping"

function makeThing(overrides: Partial<OfferThingRow> = {}): OfferThingRow {
  return {
    id: "t1",
    name: "Thing 1",
    class: "project",
    notify_window: null,
    live_step_id: "s1",
    started_at: null,
    steps: [
      {
        id: "s1",
        name: "Step 1",
        band: "sitting",
        mode: "doing",
        shape: "clean",
        needs_know_how: false,
        recurrence_rule: null,
        next_due: null,
        last_done_at: null,
        step_order: 0,
        done: false,
      },
    ],
    ...overrides,
  }
}

function makePlan(overrides: Partial<CarePlanRow> = {}): CarePlanRow {
  return {
    id: "p1",
    entity_id: "e1",
    action: "Water",
    intervals: {},
    tolerance_days: 2,
    overdue_days: 3,
    last_done_at: "2024-01-01",
    next_due_at: "2024-02-01",
    archived_at: null,
    entities: { id: "e1", name: "Fern", location: "kitchen", archived_at: null },
    ...overrides,
  }
}

const baseInput: OfferComputationInput = {
  today: "2024-02-01",
  things: [],
  carePlans: [],
  lastCareOfferDate: null,
}

describe("computeOffer", () => {
  it("returns empty offer when nothing available", () => {
    const result = computeOffer(baseInput)
    expect(result).toEqual({ inProgress: null, offer: [], careGroup: null })
  })

  it("returns in-progress thing and suppresses offer + care group", () => {
    const thing = makeThing({ started_at: "2024-02-01T10:00:00Z" })
    const plan = makePlan()
    const result = computeOffer({ ...baseInput, things: [thing], carePlans: [plan] })
    expect(result.inProgress).toMatchObject({ thing_id: "t1", thing_name: "Thing 1", step_name: "Step 1" })
    expect(result.offer).toEqual([])
    expect(result.careGroup).toBeNull()
  })

  it("in-progress thing with no live step falls back to thing name", () => {
    const thing = makeThing({ started_at: "2024-02-01T10:00:00Z", live_step_id: null, steps: [] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.inProgress?.step_name).toBe("Thing 1")
  })

  it("includes care group when not already offered today", () => {
    const plan = makePlan()
    const result = computeOffer({ ...baseInput, carePlans: [plan] })
    expect(result.careGroup).not.toBeNull()
  })

  it("suppresses care group when already offered today", () => {
    const plan = makePlan()
    const result = computeOffer({ ...baseInput, carePlans: [plan], lastCareOfferDate: "2024-02-01" })
    expect(result.careGroup).toBeNull()
  })

  it("excludes things with live_step_id null AND steps present (no live step)", () => {
    // live_step_id null and steps.length > 0 → not available
    const thing = makeThing({
      live_step_id: null,
      steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("includes thing with live_step_id null and steps.length === 0 in offer (no-step thing)", () => {
    // live_step_id null but steps.length === 0 → available (|| steps.length === 0)
    const thing = makeThing({ live_step_id: null, steps: [] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    // It is available and maps to a fallback step_name
    expect(result.offer).toHaveLength(1)
    expect(result.offer[0].step_name).toBe("Next thing on Thing 1")
  })

  it("builds reason for obligation with next_due in future", () => {
    const thing = makeThing({
      class: "obligation",
      notify_window: 30,
      steps: [{
        id: "s1", name: "Book MOT", band: "short", mode: "thinking", shape: "clean",
        needs_know_how: false, recurrence_rule: null, next_due: "2024-02-05", last_done_at: null, step_order: 0, done: false,
      }],
    })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", things: [thing] })
    expect(result.offer[0].reason).toBe("due in 4 days")
  })

  it("builds reason: due today for obligation", () => {
    const thing = makeThing({ class: "obligation", notify_window: 10, steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-01", last_done_at: null, step_order: 0, done: false }] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due today")
  })

  it("builds reason: due tomorrow for obligation", () => {
    const thing = makeThing({ class: "obligation", notify_window: 10, steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-02", last_done_at: null, step_order: 0, done: false }] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due tomorrow")
  })

  it("builds reason: overdue for obligation", () => {
    const thing = makeThing({ class: "obligation", notify_window: 10, steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-01-31", last_done_at: null, step_order: 0, done: false }] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("1 day overdue")
  })

  it("builds reason: overdue plural for obligation (lib/offer.ts:81 — Math.abs(days)===1 false)", () => {
    // Math.abs(days) !== 1 → "s" suffix. 3 days overdue.
    const thing = makeThing({ class: "obligation", notify_window: 10, steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-01-29", last_done_at: null, step_order: 0, done: false }] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("3 days overdue")
  })

  it("skips recurrence reason when parseRecurrenceRule returns null (lib/offer.ts:89)", () => {
    // recurrence_rule is set but invalid → parseRecurrenceRule → null → if(rule) false
    const thing = makeThing({
      steps: [{
        id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean",
        needs_know_how: false, recurrence_rule: { type: "invalid" }, // invalid → parseRecurrenceRule returns null
        next_due: null, last_done_at: "2024-01-28", step_order: 0, done: false,
      }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    // rule is null → reason is null (no next_due, not short band)
    expect(result.offer[0].reason).toBeNull()
  })

  it("builds reason: last done N days ago for recurring step with last_done_at", () => {
    const thing = makeThing({
      steps: [{
        id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean",
        needs_know_how: false, recurrence_rule: { type: "fixed", days: 7, anchor: "completion" },
        next_due: null, last_done_at: "2024-01-29", step_order: 0, done: false,
      }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("last done 3 days ago")
  })

  it("builds reason: last done 1 day ago (singular)", () => {
    const thing = makeThing({
      steps: [{
        id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean",
        needs_know_how: false, recurrence_rule: { type: "fixed", days: 7, anchor: "completion" },
        next_due: null, last_done_at: "2024-01-31", step_order: 0, done: false,
      }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("last done 1 day ago")
  })

  it("builds reason: due now for next_due today (project with next_due)", () => {
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-01", last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due now")
  })

  it("builds reason: due tomorrow for project", () => {
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-02", last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due tomorrow")
  })

  it("builds reason: due in N days for project", () => {
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-05", last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due in 4 days")
  })

  it("builds reason: quick one for short band, no due", () => {
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("quick one")
  })

  it("returns null reason when no condition matches", () => {
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBeNull()
  })

  it("recurrence_rule present but daysSince === 0 — skips that reason branch (lib/offer.ts:91)", () => {
    // daysSince > 0 false branch: last_done_at is TODAY
    const thing = makeThing({
      steps: [{
        id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean",
        needs_know_how: false, recurrence_rule: { type: "fixed", days: 7, anchor: "completion" },
        next_due: null, last_done_at: "2024-02-01", step_order: 0, done: false,
      }],
    })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", things: [thing] })
    // daysSince = 0 → skips the "last done N days ago" branch; no next_due or short band → null
    expect(result.offer[0].reason).toBeNull()
  })

  it("project with next_due > 7 days away returns null reason (lib/offer.ts:101)", () => {
    // days <= 7 false branch: next_due is 10 days away
    const thing = makeThing({
      steps: [{ id: "s1", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-11", last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", things: [thing] })
    // 10 days away: days > 7, not short band → null
    expect(result.offer[0].reason).toBeNull()
  })

  it("getBand falls back to 'sitting' when live_step_id matches no step (lib/offer.ts:113)", () => {
    // ?? "sitting" fallback: live_step_id points to a step not in the steps array
    const thing = makeThing({
      id: "t1",
      live_step_id: "missing-id",
      steps: [
        { id: "s1", name: "S1", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false },
        { id: "s2", name: "S2", band: "run", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 1, done: false },
        { id: "s3", name: "S3", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 2, done: false },
        { id: "s4", name: "S4", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 3, done: false },
      ],
    })
    // More than 3 items so pickWithSpread runs, and getBand is called for this thing
    const things = [thing, makeThing({ id: "t2", live_step_id: "s2x", steps: [{ id: "s2x", name: "S", band: "run", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }), makeThing({ id: "t3", live_step_id: "s3x", steps: [{ id: "s3x", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }), makeThing({ id: "t4", live_step_id: "s4x", steps: [{ id: "s4x", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] })]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer.length).toBeLessThanOrEqual(3)
  })

  it("mapCareGroup returns null when buildCareGroup returns null (lib/offer.ts:146)", () => {
    // carePlans.length > 0 but no plan is due today → buildCareGroup returns null → mapCareGroup(null) → null
    const futurePlan = makePlan({ next_due_at: "2024-12-31" }) // far future — not due
    const result = computeOffer({ ...baseInput, today: "2024-02-01", carePlans: [futurePlan] })
    expect(result.careGroup).toBeNull()
  })

  it("filters obligation by notify_window", () => {
    // next_due is 20 days away, notify_window is 5 → should NOT appear
    const thing = makeThing({
      class: "obligation",
      notify_window: 5,
      steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-21", last_done_at: null, step_order: 0, done: false }],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("fills remaining slots from overflow when only one band is present", () => {
    // 4 projects all "sitting" → pickWithSpread picks sitting[0] from bucket,
    // then the loop at lines 124-127 fills the remaining 2 slots from the overflow
    const things = ["t1","t2","t3","t4"].map((id) => makeThing({
      id, live_step_id: `s${id}`,
      steps: [{ id: `s${id}`, name: "S", band: "sitting" as const, mode: "doing" as const,
        shape: "clean" as const, needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }],
    }))
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer).toHaveLength(3)
  })

  it("spreads across bands when more than 3 projects", () => {
    const things = [
      makeThing({ id: "t1", steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }),
      makeThing({ id: "t2", live_step_id: "s2", steps: [{ id: "s2", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }),
      makeThing({ id: "t3", live_step_id: "s3", steps: [{ id: "s3", name: "S", band: "run", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }),
      makeThing({ id: "t4", live_step_id: "s4", steps: [{ id: "s4", name: "S", band: "sitting", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer.length).toBeLessThanOrEqual(3)
  })

  it("care group takes the reserved slot when no obligation", () => {
    const plan = makePlan()
    const project = makeThing({ id: "tp" })
    const result = computeOffer({ ...baseInput, things: [project], carePlans: [plan] })
    expect(result.careGroup).not.toBeNull()
    // Projects fill up to 2 slots (3 - 1 reserved for care)
    expect(result.offer.length).toBeLessThanOrEqual(2)
  })

  it("care group not shown when obligation present (obligation takes reserved slot)", () => {
    const plan = makePlan()
    const obligation = makeThing({ id: "to", class: "obligation", notify_window: null, steps: [{ id: "s1", name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: "2024-02-01", last_done_at: null, step_order: 0, done: false }] })
    const result = computeOffer({ ...baseInput, things: [obligation], carePlans: [plan] })
    expect(result.careGroup).toBeNull()
  })

  it("step_name falls back when no live step found", () => {
    const thing = makeThing({ live_step_id: "missing" })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].step_name).toBe("Next thing on Thing 1")
    expect(result.offer[0].band).toBe("sitting")
  })
})
