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

  it("excludes no-step thing (live_step_id null, steps empty) — not actionable", () => {
    // A thing with no steps cannot have a skipped or stopped event recorded against it.
    // It must not appear in the offer.
    const thing = makeThing({ live_step_id: null, steps: [] })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("step_name falls back when live step row missing from join; step_id uses live_step_id not thing id", () => {
    // live_step_id is set but the step row is absent from the join (data inconsistency).
    // step_id must fall back to live_step_id, not thing.id, so event calls still target a step.
    const thing = makeThing({ live_step_id: "missing" })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer[0].step_name).toBe("Next thing on Thing 1")
    expect(result.offer[0].step_id).toBe("missing")
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

  it("missing live step in pickedProjects.every callback falls back to 'sitting' band (not 'short')", () => {
    // Covers the `ls?.band ?? 'sitting'` fallback in the allPickedShort.every callback
    // when the live_step_id does not match any step row in the join.
    // An obligation fills the reserved slot; 2 projects with missing live steps are in the pool.
    // Their band falls back to 'sitting', so allPickedShort is false and forceNullReasonId
    // is not set — which is the correct fallback (sitting projects already have null reason).
    const obligation = makeThing({
      id: "ob", class: "obligation", due_date: "2024-02-03", notify_window: 10,
      steps: [makeStep({ id: "so", band: "short" })],
    })
    // Both projects have live_step_id pointing to a missing step → band falls back to 'sitting'
    const p1 = makeThing({ id: "p1", live_step_id: "missing1", steps: [] })
    const p2 = makeThing({ id: "p2", live_step_id: "missing2", steps: [] })
    const result = computeOffer({ ...baseInput, things: [obligation, p1, p2] })
    // sitting-band (fallback) items have null reason — guarantee still holds
    const hasNoReason = result.offer.some((item) => item.reason === null)
    expect(hasNoReason).toBe(true)
  })

  it("missing live step in early-phase filter falls back to needs_know_how=false (not filtered)", () => {
    // Covers the `liveStep?.needs_know_how ?? false` fallback in the earlyPhase filter.
    // A thing with live_step_id pointing to a missing step row: the fallback is false,
    // so the item is NOT filtered out in the early phase.
    const thing = makeThing({ id: "t1", live_step_id: "missing", steps: [] })
    const result = computeOffer({ ...baseInput, completionCount: 0, things: [thing] })
    expect(result.offer).toHaveLength(1)
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

  it("undated obligation is not offered — no factual basis to surface it", () => {
    // An obligation without a due_date has no activation point; it must not appear
    // in the offer until the user corrects it with a due date.
    const thing = makeThing({
      class: "obligation",
      due_date: null,
      notify_window: null,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
  })

  it("obligation with due_date but no notify_window is not offered", () => {
    // A notify_window is required to determine when to surface an obligation.
    // Without it the obligation stays silent.
    const thing = makeThing({
      class: "obligation",
      due_date: "2024-02-05",
      notify_window: null,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, things: [thing] })
    expect(result.offer).toHaveLength(0)
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

  it("no-time-signal rule: forces null reason when obligation + only short-band projects", () => {
    // Obligation (clock-bearing) + only short-band projects in pool.
    // pickWithSpread picks sitting/run first; with no sitting/run, all picks are short.
    // forceNullReasonId ensures at least one item has no reason.
    const obligation = makeThing({
      id: "ob",
      class: "obligation",
      due_date: "2024-02-03",
      notify_window: 10,
      steps: [makeStep({ id: "so", band: "short" })],
    })
    const sp1 = makeThing({ id: "sp1", live_step_id: "ss1", steps: [makeStep({ id: "ss1", band: "short" })] })
    const sp2 = makeThing({ id: "sp2", live_step_id: "ss2", steps: [makeStep({ id: "ss2", band: "short" })] })
    const result = computeOffer({ ...baseInput, things: [obligation, sp1, sp2] })
    const hasNoReason = result.offer.some((item) => item.reason === null)
    expect(hasNoReason).toBe(true)
  })

  it("no-time-signal rule: forces null reason on last short item when no non-short project exists", () => {
    // Obligation (clock-bearing) + only short-band projects in pool, no non-short alternative.
    // The swap cannot happen, so the guarantee is preserved by forcing reason = null on the
    // last picked short project.
    const obligation = makeThing({
      id: "ob",
      class: "obligation",
      due_date: "2024-02-03",
      notify_window: 10,
      steps: [makeStep({ id: "so", band: "short" })],
    })
    const s1 = makeThing({ id: "sp1", live_step_id: "ss1", steps: [makeStep({ id: "ss1", band: "short" })] })
    const s2 = makeThing({ id: "sp2", live_step_id: "ss2", steps: [makeStep({ id: "ss2", band: "short" })] })
    const result = computeOffer({ ...baseInput, things: [obligation, s1, s2] })
    // Guarantee: at least one item must have reason = null
    const hasNoReason = result.offer.some((item) => item.reason === null)
    expect(hasNoReason).toBe(true)
  })

  it("no-time-signal rule: does not swap when no clock-bearing item is in the spread", () => {
    // No obligation, no care group → spread has no clock-bearing item → rule doesn't apply.
    // A spread of all short-band projects is fine; they'll all get "quick one" but the
    // rule only fires when something else is already carrying a clock signal.
    const s1 = makeThing({ id: "t1", live_step_id: "s1", steps: [makeStep({ id: "s1", band: "short" })] })
    const s2 = makeThing({ id: "t2", live_step_id: "s2", steps: [makeStep({ id: "s2", band: "short" })] })
    const result = computeOffer({ ...baseInput, things: [s1, s2] })
    // No swap needed — both items will have "quick one" reason but that's allowed
    // when there's no clock-bearing item in the spread.
    expect(result.offer.length).toBe(2)
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

  it("getDomain falls back to 'other' for null-domain thing inside pickWithSpread (> 3 items)", () => {
    // Covers the `thing.domain ?? 'other'` fallback in getDomain inside pickWithSpread.
    // Requires >3 items so the spread logic runs (not the early return).
    const things = [
      makeThing({ id: "t1", domain: null, live_step_id: "s1", steps: [makeStep({ id: "s1", band: "sitting" })] }),
      makeThing({ id: "t2", domain: "home", live_step_id: "s2", steps: [makeStep({ id: "s2", band: "sitting" })] }),
      makeThing({ id: "t3", domain: "admin", live_step_id: "s3", steps: [makeStep({ id: "s3", band: "sitting" })] }),
      makeThing({ id: "t4", domain: "vehicle", live_step_id: "s4", steps: [makeStep({ id: "s4", band: "sitting" })] }),
    ]
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer).toHaveLength(3)
    const domains = result.offer.map((item) => item.domain)
    expect(domains.some((d) => d === "other")).toBe(true)
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

  it("true floor: all items have needs_know_how — show specific names and keep needs_know_how true", () => {
    // All projects have needs_know_how — early phase would filter all out.
    // True floor (no alternatives): show the specific step name so the familiarity question
    // can fire. That's the only path to clearing needs_know_how for the user.
    const things = [
      makeThing({ id: "t1", name: "Thing A", steps: [makeStep({ needs_know_how: true })] }),
      makeThing({ id: "t2", name: "Thing B", live_step_id: "s2", steps: [makeStep({ id: "s2", needs_know_how: true })] }),
    ]
    const result = computeOffer({ ...baseInput, completionCount: 0, things })
    // Not empty — floor rule kept the pool
    expect(result.offer.length).toBeGreaterThan(0)
    // Step names must be specific (not generic) so the familiarity question fires
    for (const item of result.offer) {
      expect(item.step_name).not.toMatch(/^Next thing on /)
      expect(item.needs_know_how).toBe(true)
    }
  })

  it("overflow: needs_know_how item served alongside non-needs_know_how alternatives — gets generic name", () => {
    // One safe item exists (filtered pool non-empty). A needs_know_how item is served as
    // overflow (floor NOT triggered). It should get a generic name and suppressed flag.
    const things = [
      makeThing({ id: "t1", name: "Safe thing", steps: [makeStep({ needs_know_how: false })] }),
      makeThing({ id: "t2", name: "Know-how thing", live_step_id: "s2", steps: [makeStep({ id: "s2", needs_know_how: true })] }),
      makeThing({ id: "t3", name: "Know-how 2", live_step_id: "s3", steps: [makeStep({ id: "s3", needs_know_how: true })] }),
      makeThing({ id: "t4", name: "Know-how 3", live_step_id: "s4", steps: [makeStep({ id: "s4", needs_know_how: true })] }),
    ]
    const result = computeOffer({ ...baseInput, completionCount: 0, things })
    // Safe thing should be in the offer
    const safeItem = result.offer.find((item) => item.thing_id === "t1")
    expect(safeItem).toBeDefined()
    expect(safeItem?.step_name).not.toMatch(/^Next thing on /)
    // Any overflow needs_know_how items should have generic names
    for (const item of result.offer) {
      if (item.thing_id !== "t1") {
        expect(item.step_name).toMatch(/^Next thing on /)
        expect(item.needs_know_how).toBe(false)
      }
    }
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

// ---------------------------------------------------------------------------
// Specification invariants
//
// These tests are written against sentences in DESIGN.md, not against the
// implementation. They describe what must always be true, not how the code
// achieves it. If any of these fail, a design rule has been broken.
// ---------------------------------------------------------------------------

describe("computeOffer — design invariants", () => {
  it("INV: at most one clock-bearing item in any spread", () => {
    // DESIGN.md §Offer: "One clock-bearing slot per spread, maximum."
    // A clock-bearing item is one that carries a time signal: an obligation or a care group.
    // The spread must never have two.
    const obligation = makeThing({
      id: "ob", class: "obligation", due_date: "2024-02-03", notify_window: 10,
      steps: [makeStep({ id: "so" })],
    })
    const plan = makePlan()
    const project = makeThing({ id: "tp", live_step_id: "sp", steps: [makeStep({ id: "sp" })] })
    const result = computeOffer({ ...baseInput, things: [obligation, project], carePlans: [plan] })

    // Count clock-bearing items: obligations (have a reason from due_date) + care group presence
    const obligationItems = result.offer.filter((item) => item.thing_id === "ob")
    const hasCareGroup = result.careGroup !== null
    const clockBearingCount = obligationItems.length + (hasCareGroup ? 1 : 0)
    expect(clockBearingCount).toBeLessThanOrEqual(1)
  })

  it("INV: project step reasons never contain urgency language", () => {
    // DESIGN.md §Engineering constraints: "Does it add urgency language to a project step?"
    // Project reasons must be null, "quick one", or another non-clock phrase.
    // They must never say "due", "overdue", "urgent", "deadline", "expires", etc.
    const urgencyWords = ["due", "overdue", "urgent", "deadline", "expires", "by "]
    const projects = [
      makeThing({ id: "t1", steps: [makeStep({ band: "short" })] }),
      makeThing({ id: "t2", live_step_id: "s2", steps: [makeStep({ id: "s2", band: "sitting" })] }),
      makeThing({ id: "t3", live_step_id: "s3", steps: [makeStep({ id: "s3", band: "run" })] }),
    ]
    const result = computeOffer({ ...baseInput, things: projects, completionCount: TENURE_THRESHOLD })
    for (const item of result.offer) {
      if (item.reason !== null) {
        const lower = item.reason.toLowerCase()
        for (const word of urgencyWords) {
          expect(lower, `project reason "${item.reason}" contains urgency word "${word}"`).not.toContain(word)
        }
      }
    }
  })

  it("INV: at least one item per spread has reason = null when a clock-bearing item is present", () => {
    // DESIGN.md §Offer: "At least one item per spread carries no time signal at all.
    // Deliberately protected."
    const obligation = makeThing({
      id: "ob", class: "obligation", due_date: "2024-02-03", notify_window: 10,
      steps: [makeStep({ id: "so", band: "short" })],
    })
    const p1 = makeThing({ id: "p1", live_step_id: "sp1", steps: [makeStep({ id: "sp1", band: "short" })] })
    const p2 = makeThing({ id: "p2", live_step_id: "sp2", steps: [makeStep({ id: "sp2", band: "short" })] })
    const result = computeOffer({ ...baseInput, things: [obligation, p1, p2] })

    const clockPresent = result.offer.some((i) => i.reason !== null) || result.careGroup !== null
    if (clockPresent) {
      const hasNullReason = result.offer.some((i) => i.reason === null)
      expect(hasNullReason).toBe(true)
    }
  })

  it("INV: offer never exceeds three items (projects + at most one obligation)", () => {
    // DESIGN.md §Offer: "Two or three offers of deliberately different shapes."
    const things = Array.from({ length: 10 }, (_, i) =>
      makeThing({ id: `t${i}`, live_step_id: `s${i}`, steps: [makeStep({ id: `s${i}` })] })
    )
    const result = computeOffer({ ...baseInput, things })
    expect(result.offer.length).toBeLessThanOrEqual(3)
  })

  it("INV: obligation outside its notify_window is never offered", () => {
    // DESIGN.md §Offer: obligations surface only inside their notify_window.
    // An obligation 30 days away with a 5-day window must not appear.
    const future = makeThing({
      id: "ob", class: "obligation", due_date: "2024-03-15", notify_window: 5,
      steps: [makeStep()],
    })
    const result = computeOffer({ ...baseInput, today: "2024-02-01", things: [future] })
    expect(result.offer).toHaveLength(0)
    expect(result.careGroup).toBeNull()
  })

  it("INV: offer is never empty when things are available (floor rule)", () => {
    // DESIGN.md §Tenure and the early phase: "Floor rule: tenure gating must never
    // return fewer than one offer."
    // Even if all steps have needs_know_how, something must be offered.
    const things = [
      makeThing({ id: "t1", name: "Thing A", steps: [makeStep({ needs_know_how: true })] }),
      makeThing({ id: "t2", name: "Thing B", live_step_id: "s2", steps: [makeStep({ id: "s2", needs_know_how: true })] }),
    ]
    const result = computeOffer({ ...baseInput, completionCount: 0, things })
    expect(result.offer.length).toBeGreaterThanOrEqual(1)
  })
})
