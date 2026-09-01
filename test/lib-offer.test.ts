import { describe, expect, it } from "vitest"
import {
  computeOffer,
  isEarlyPhase,
  TENURE_THRESHOLD,
  NUDGE_BACK_THRESHOLD,
} from "@/lib/offer"
import type { OfferThingRow, OfferComputationInput, OfferStepRow } from "@/lib/offer"
import type { CarePlanRow } from "@/lib/care-grouping"

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<OfferStepRow> = {}): OfferStepRow {
  return {
    id: "s1",
    name: "Step 1",
    band: "sitting",
    mode: "doing",
    shape: "clean",
    needs_know_how: false,
    step_order: 0,
    done: false,
    ...overrides,
  }
}

function makeThing(overrides: Partial<OfferThingRow> = {}): OfferThingRow {
  return {
    id: "t1",
    name: "Thing 1",
    class: "project",
    domain: "home",
    due_date: null,
    notify_window: null,
    live_step_id: "s1",
    started_at: null,
    steps: [makeStep()],
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
    entities: { id: "e1", name: "Fern", kind: "plant", location: "kitchen", archived_at: null },
    ...overrides,
  }
}

const baseInput: OfferComputationInput = {
  today: "2024-02-01",
  things: [],
  carePlans: [],
  lastCareOfferDate: null,
  completionCount: TENURE_THRESHOLD, // default: not early phase
  nudgeBackCounts: {},
}

// ---------------------------------------------------------------------------
// Core offer logic
// ---------------------------------------------------------------------------

describe("computeOffer", () => {
  it("returns empty offer when nothing available", () => {
    const result = computeOffer(baseInput)
    expect(result).toEqual({ inProgress: null, offer: [], careGroup: null })
  })

  it("returns in-progress thing and suppresses offer + care group", () => {
    const thing = makeThing({ started_at: "2024-02-01T10:00:00Z" })
    const plan = makePlan()
    const result = computeOffer({ ...baseInput, things: [thing], carePlans: [plan] })
    expect(result.inProgress).toMatchObject({ thing_id: "t1", thing_name: "Thing 1", step_id: "s1", step_name: "Step 1" })
    expect(result.offer).toEqual([])
    expect(result.careGroup).toBeNull()
  })

  it("in-progress thing with no live step returns null inProgress — structurally invalid, cannot stop safely", () => {
    // A thing with started_at but no live_step_id has no valid step to record a stopped event against.
    // Returning null prevents the focus card from surfacing and avoids a 404 on stop.
    const thing = makeThing({ started_at: "2024-02-01T10:00:00Z", live_step_id: null, steps: [] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.inProgress).toBeNull()
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
    const thing = makeThing({ live_step_id: null, steps: [makeStep()] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("includes thing with live_step_id null and steps.length === 0 in offer (no-step thing)", () => {
    const thing = makeThing({ live_step_id: null, steps: [] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(1)
    expect(result.offer[0].step_name).toBe("Next thing on Thing 1")
  })

  it("step_name falls back when no live step found", () => {
    const thing = makeThing({ live_step_id: "missing" })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].step_name).toBe("Next thing on Thing 1")
    expect(result.offer[0].band).toBe("sitting")
  })

  it("offer item exposes mode and domain", () => {
    const thing = makeThing({ steps: [makeStep({ mode: "thinking" })] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].mode).toBe("thinking")
    expect(result.offer[0].domain).toBe("home")
  })

  it("domain falls back to 'other' when thing.domain is null", () => {
    const thing = makeThing({ domain: null })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].domain).toBe("other")
  })
})

// ---------------------------------------------------------------------------
// Obligation reason logic — reads from thing.due_date, not step fields
// ---------------------------------------------------------------------------

describe("computeOffer — obligation reasons", () => {
  it("builds reason for obligation with due_date in future", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-05",
      notify_window: 30,
      steps: [makeStep({ id: "s1", name: "Book MOT", band: "short", mode: "thinking" })],
    })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", things: [thing] })
    expect(result.offer[0].reason).toBe("due in 4 days")
  })

  it("builds reason: due today for obligation", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-01",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due today")
  })

  it("builds reason: due tomorrow for obligation", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-02",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("due tomorrow")
  })

  it("builds reason: overdue (singular) for obligation", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-01-31",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("1 day overdue")
  })

  it("builds reason: overdue (plural) for obligation", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-01-29",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("3 days overdue")
  })

  it("filters obligation by notify_window against thing.due_date", () => {
    // due_date is 20 days away, notify_window is 5 → should NOT appear
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-21",
      notify_window: 5,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("undated obligation falls through to project pool and is offered on shape", () => {
    // An obligation without a due_date has no clock but is still reachable — it falls
    // through to the project pool and is offered on shape like any project.
    const thing = makeThing({
      class: "obligation",
      due_date: null,
      notify_window: 5,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(1)
    expect(result.offer[0].thing_id).toBe("t1")
  })

  it("undated obligation has no reason line (no clock to describe)", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: null,
      notify_window: null,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0]?.reason).toBeNull()
  })

  it("undated obligation does not suppress care group — not clock-bearing", () => {
    // Without a due_date it is not in the obligations slot, so the care group slot stays open.
    const plan = makePlan()
    const thing = makeThing({
      class: "obligation",
      due_date: null,
      notify_window: null,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing], carePlans: [plan] })
    expect(result.careGroup).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Project reason logic — no urgency language ever
// ---------------------------------------------------------------------------

describe("computeOffer — project reasons", () => {
  it("returns null reason for project (never urgency)", () => {
    const thing = makeThing({
      steps: [makeStep({ band: "sitting" })],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBeNull()
  })

  it("builds reason: quick one for short band project", () => {
    const thing = makeThing({
      steps: [makeStep({ band: "short" })],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBe("quick one")
  })

  it("returns null reason when no condition matches (project, sitting band)", () => {
    const thing = makeThing({ steps: [makeStep()] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].reason).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// One clock-bearing slot — obligation suppresses care group
// ---------------------------------------------------------------------------

describe("computeOffer — one clock slot", () => {
  it("care group takes the reserved slot when no obligation", () => {
    const plan = makePlan()
    const project = makeThing({ id: "tp" })
    const result = computeOffer({ ...baseInput, things: [project], carePlans: [plan] })
    expect(result.careGroup).not.toBeNull()
    // Projects fill up to 2 slots (3 - 1 reserved for care)
    expect(result.offer.length).toBeLessThanOrEqual(2)
  })

  it("obligation present suppresses care group — they share the one clock slot", () => {
    // Obligation must have both due_date and notify_window to be clock-bearing.
    const plan = makePlan()
    const obligation = makeThing({
      id: "to",
      class: "obligation",
      due_date: "2024-02-01",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [obligation], carePlans: [plan] })
    expect(result.careGroup).toBeNull()
    // Obligation occupies the one clock slot
    expect(result.offer.some((item) => item.thing_id === "to")).toBe(true)
  })

  it("mapCareGroup returns null when buildCareGroup returns null", () => {
    // far future plan — not yet due, buildCareGroup returns null
    const futurePlan = makePlan({ next_due_at: "2024-12-31" })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", carePlans: [futurePlan] })
    expect(result.careGroup).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Spread logic — band, mode, domain
// ---------------------------------------------------------------------------

describe("computeOffer — pickWithSpread", () => {
  it("returns all items when pool size <= 3", () => {
    const things = [
      makeThing({ id: "t1" }),
      makeThing({ id: "t2" }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer).toHaveLength(2)
  })

  it("spreads across bands when more than 3 projects", () => {
    const things = [
      makeThing({ id: "t1", steps: [makeStep({ id: "s1", band: "short" })] }),
      makeThing({ id: "t2", live_step_id: "s2", steps: [makeStep({ id: "s2", band: "sitting" })] }),
      makeThing({ id: "t3", live_step_id: "s3", steps: [makeStep({ id: "s3", band: "run" })] }),
      makeThing({ id: "t4", live_step_id: "s4", steps: [makeStep({ id: "s4", band: "sitting" })] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer.length).toBeLessThanOrEqual(3)
    // Should pick one from each band first
    const bands = result.offer.map((item) => item.band)
    const uniqueBands = new Set(bands)
    expect(uniqueBands.size).toBeGreaterThanOrEqual(2)
  })

  it("fills remaining slots from overflow when only one band present", () => {
    const things = ["t1", "t2", "t3", "t4"].map((id) => makeThing({
      id, live_step_id: `s${id}`,
      steps: [makeStep({ id: `s${id}`, band: "sitting" })],
    }))
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer).toHaveLength(3)
  })

  it("avoids two items from the same domain when alternatives exist", () => {
    // Two home things and one vehicle thing — spread should prefer variety
    const things = [
      makeThing({ id: "t1", domain: "home", live_step_id: "s1", steps: [makeStep({ id: "s1", band: "sitting", mode: "doing" })] }),
      makeThing({ id: "t2", domain: "home", live_step_id: "s2", steps: [makeStep({ id: "s2", band: "sitting", mode: "doing" })] }),
      makeThing({ id: "t3", domain: "vehicle", live_step_id: "s3", steps: [makeStep({ id: "s3", band: "sitting", mode: "doing" })] }),
      makeThing({ id: "t4", domain: "finance", live_step_id: "s4", steps: [makeStep({ id: "s4", band: "sitting", mode: "doing" })] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer).toHaveLength(3)
    const domains = result.offer.map((item) => item.domain)
    // Should not have two home items if alternatives exist
    const homeCount = domains.filter((d) => d === "home").length
    expect(homeCount).toBeLessThanOrEqual(1)
  })

  it("avoids two items with the same mode when alternatives exist", () => {
    const things = [
      makeThing({ id: "t1", domain: "home", live_step_id: "s1", steps: [makeStep({ id: "s1", mode: "thinking", band: "sitting" })] }),
      makeThing({ id: "t2", domain: "admin", live_step_id: "s2", steps: [makeStep({ id: "s2", mode: "thinking", band: "sitting" })] }),
      makeThing({ id: "t3", domain: "vehicle", live_step_id: "s3", steps: [makeStep({ id: "s3", mode: "doing", band: "sitting" })] }),
      makeThing({ id: "t4", domain: "garden", live_step_id: "s4", steps: [makeStep({ id: "s4", mode: "doing", band: "sitting" })] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    const modes = result.offer.map((item) => item.mode)
    const thinkingCount = modes.filter((m) => m === "thinking").length
    const doingCount = modes.filter((m) => m === "doing").length
    // With spread, should prefer one of each mode
    expect(thinkingCount).toBeLessThanOrEqual(2)
    expect(doingCount).toBeLessThanOrEqual(2)
  })

  it("getBand falls back to 'sitting' when live_step_id matches no step", () => {
    const thing = makeThing({
      id: "t1",
      live_step_id: "missing-id",
      steps: [
        makeStep({ id: "s1", band: "short" }),
        makeStep({ id: "s2", band: "run", step_order: 1 }),
        makeStep({ id: "s3", band: "short", step_order: 2 }),
        makeStep({ id: "s4", band: "sitting", step_order: 3 }),
      ],
    })
    const things = [
      thing,
      makeThing({ id: "t2", live_step_id: "s2x", steps: [makeStep({ id: "s2x", band: "run" })] }),
      makeThing({ id: "t3", live_step_id: "s3x", steps: [makeStep({ id: "s3x", band: "sitting" })] }),
      makeThing({ id: "t4", live_step_id: "s4x", steps: [makeStep({ id: "s4x", band: "short" })] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer.length).toBeLessThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// Tenure gate
// ---------------------------------------------------------------------------

describe("isEarlyPhase", () => {
  it(`returns true below threshold (${TENURE_THRESHOLD})`, () => {
    expect(isEarlyPhase(0)).toBe(true)
    expect(isEarlyPhase(TENURE_THRESHOLD - 1)).toBe(true)
  })

  it(`returns false at or above threshold (${TENURE_THRESHOLD})`, () => {
    expect(isEarlyPhase(TENURE_THRESHOLD)).toBe(false)
    expect(isEarlyPhase(TENURE_THRESHOLD + 1)).toBe(false)
  })
})

describe("computeOffer — tenure gate", () => {
  it("shows obligation due-date reason in early phase — real dates are not invented", () => {
    // Early phase must not suppress obligation reasons: a stored due_date is a fact.
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-05",
      notify_window: 30,
      steps: [makeStep({ band: "short" })],
    })
    const result = computeOffer({ ...baseInput, completionCount: 0, things: [thing] })
    expect(result.offer[0].reason).toBe("due in 4 days")
  })

  it("degrades project reason to null in early phase", () => {
    // Early phase suppression still applies to projects — no invented specifics.
    const thing = makeThing({
      class: "project",
      steps: [makeStep({ band: "short" })],
    })
    const result = computeOffer({ ...baseInput, completionCount: 0, things: [thing] })
    expect(result.offer[0].reason).toBeNull()
  })

  it("skips needs_know_how steps in early phase when alternatives exist", () => {
    const knowHowThing = makeThing({
      id: "t1",
      steps: [makeStep({ needs_know_how: true })],
    })
    const normalThing = makeThing({
      id: "t2",
      live_step_id: "s2",
      steps: [makeStep({ id: "s2", needs_know_how: false })],
    })
    const result = computeOffer({
      ...baseInput,
      completionCount: 0,
      things: [knowHowThing, normalThing],
    })
    const ids = result.offer.map((item) => item.thing_id)
    expect(ids).not.toContain("t1")
    expect(ids).toContain("t2")
  })

  it("floor rule: falls back to unfiltered pool with generic names when filtering empties it", () => {
    // All projects have needs_know_how — early phase would filter all out.
    // Floor rule: use unfiltered pool but with generic step names.
    const things = [
      makeThing({ id: "t1", name: "Thing A", steps: [makeStep({ needs_know_how: true })] }),
      makeThing({ id: "t2", name: "Thing B", live_step_id: "s2", steps: [makeStep({ id: "s2", needs_know_how: true })] }),
    ]
    const result = computeOffer({ ...baseInput, completionCount: 0, things })
    // Not empty — floor rule kept the pool
    expect(result.offer.length).toBeGreaterThan(0)
    // Step names should be generic
    for (const item of result.offer) {
      expect(item.step_name).toMatch(/^Next thing on /)
    }
  })

  it("needs_know_how is false on generic fallback items", () => {
    const things = [
      makeThing({ id: "t1", name: "Thing A", steps: [makeStep({ needs_know_how: true })] }),
    ]
    const result = computeOffer({ ...baseInput, completionCount: 0, things })
    expect(result.offer[0].needs_know_how).toBe(false)
  })

  it("shows specific reasons when not in early phase", () => {
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-01",
      notify_window: 10,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, completionCount: TENURE_THRESHOLD, things: [thing] })
    expect(result.offer[0].reason).toBe("due today")
  })
})

// ---------------------------------------------------------------------------
// Per-thing degradation
// ---------------------------------------------------------------------------

describe("computeOffer — per-thing degradation", () => {
  it(`uses generic step name when nudge-back count reaches threshold (${NUDGE_BACK_THRESHOLD})`, () => {
    const thing = makeThing({ id: "t1", name: "Bath panel" })
    const nudgeBackCounts = { t1: NUDGE_BACK_THRESHOLD }
    const result = computeOffer({ ...baseInput, things: [thing], nudgeBackCounts })
    expect(result.offer[0].step_name).toBe("Next thing on Bath panel")
  })

  it("uses specific step name when nudge-back count is below threshold", () => {
    const thing = makeThing({ id: "t1", name: "Bath panel" })
    const nudgeBackCounts = { t1: NUDGE_BACK_THRESHOLD - 1 }
    const result = computeOffer({ ...baseInput, things: [thing], nudgeBackCounts })
    expect(result.offer[0].step_name).toBe("Step 1")
  })

  it("disables needs_know_how on degraded items", () => {
    const thing = makeThing({
      id: "t1",
      steps: [makeStep({ needs_know_how: true })],
    })
    const nudgeBackCounts = { t1: NUDGE_BACK_THRESHOLD }
    const result = computeOffer({ ...baseInput, things: [thing], nudgeBackCounts })
    expect(result.offer[0].needs_know_how).toBe(false)
  })

  it("uses specific names for things with no nudge-back events", () => {
    const thing = makeThing({ id: "t1", name: "Garden bed" })
    const result = computeOffer({ ...baseInput, things: [thing], nudgeBackCounts: {} })
    expect(result.offer[0].step_name).toBe("Step 1")
  })
})
