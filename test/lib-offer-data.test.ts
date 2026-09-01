import { describe, expect, it, vi, beforeEach } from "vitest"
import { loadOfferData } from "@/lib/offer-data"

function makeSupabase(overrides: {
  things?: { data: unknown; error: unknown }
  carePlans?: { data: unknown; error: null }
  profile?: { data: unknown; error: null }
  doneEvents?: { data: unknown; error: null }
  nudgedBackEvents?: { data: unknown; error: null }
} = {}) {
  const things = overrides.things ?? { data: [], error: null }
  const carePlans = overrides.carePlans ?? { data: [], error: null }
  const profile = overrides.profile ?? { data: null, error: null }
  const doneEvents = overrides.doneEvents ?? { data: [], error: null }
  const nudgedBackEvents = overrides.nudgedBackEvents ?? { data: [], error: null }

  const buildChain = (result: unknown) => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.is = vi.fn(() => chain)
    chain.single = vi.fn(() => Promise.resolve(result))
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return chain
  }

  let callCount = 0
  const fromImpl = vi.fn(() => {
    callCount++
    if (callCount === 1) return buildChain(things)
    if (callCount === 2) return buildChain(carePlans)
    if (callCount === 3) return buildChain(profile)
    if (callCount === 4) return buildChain(doneEvents)
    return buildChain(nudgedBackEvents)
  })

  return { from: fromImpl } as unknown as Parameters<typeof loadOfferData>[0]
}

describe("loadOfferData", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"))
  })

  it("returns empty offer result when no data", async () => {
    const supabase = makeSupabase()
    const { result, error } = await loadOfferData(supabase, "u1")
    expect(error).toBeNull()
    expect(result.inProgress).toBeNull()
    expect(result.offer).toEqual([])
    expect(result.careGroup).toBeNull()
  })

  it("returns error string when things fetch fails", async () => {
    const supabase = makeSupabase({ things: { data: null, error: { message: "DB error" } } })
    const { result, error } = await loadOfferData(supabase, "u1")
    expect(error).toBe("DB error")
    expect(result.inProgress).toBeNull()
  })

  it("handles null things and null carePlans from DB (fallback to [])", async () => {
    const supabase = makeSupabase({
      things: { data: null, error: null },
      carePlans: { data: null, error: null },
    })
    const { result, error } = await loadOfferData(supabase, "u1")
    expect(error).toBeNull()
    expect(result.offer).toEqual([])
    expect(result.careGroup).toBeNull()
  })

  it("passes things to computeOffer and returns result", async () => {
    const thing = {
      id: "t1", name: "Test", class: "project", domain: "home", due_date: null,
      notify_window: null, live_step_id: "s1", started_at: null,
      steps: [{ id: "s1", name: "Step", band: "short", mode: "doing", shape: "clean", needs_know_how: false, step_order: 0, done: false }],
    }
    const supabase = makeSupabase({ things: { data: [thing], error: null } })
    const { result, error } = await loadOfferData(supabase, "u1")
    expect(error).toBeNull()
    expect(result.offer).toHaveLength(1)
    expect(result.offer[0].thing_name).toBe("Test")
  })

  it("respects lastCareOfferDate from profile", async () => {
    const plan = {
      id: "p1", entity_id: "e1", action: "Water", intervals: {}, tolerance_days: 2, overdue_days: 3,
      last_done_at: "2024-01-01", next_due_at: "2024-02-01", archived_at: null,
      entities: { id: "e1", name: "Fern", location: null, archived_at: null },
    }
    // Care already offered today → no care group
    const supabase = makeSupabase({
      carePlans: { data: [plan], error: null },
      profile: { data: { last_care_offer_date: "2024-02-01" }, error: null },
    })
    const { result } = await loadOfferData(supabase, "u1")
    expect(result.careGroup).toBeNull()
  })

  it("derives completionCount from done step_events", async () => {
    const thing = {
      id: "t1", name: "Test", class: "project", domain: "home", due_date: null,
      notify_window: null, live_step_id: "s1", started_at: null,
      steps: [{ id: "s1", name: "Step", band: "short", mode: "doing", shape: "clean", needs_know_how: false, step_order: 0, done: false }],
    }
    const supabase = makeSupabase({
      things: { data: [thing], error: null },
      // Two done events — still under tenure threshold
      doneEvents: { data: [{ id: "e1" }, { id: "e2" }], error: null },
    })
    const { result } = await loadOfferData(supabase, "u1")
    // completionCount = 2 — still under tenure threshold, offer is present
    expect(result.offer).toHaveLength(1)
  })

  it("handles null doneEvents and null nudgedBackEvents from DB (fallback to [])", async () => {
    // Covers lines 73-76: `(doneEvents ?? [])` and `(nudgedBackEvents ?? [])` null branches.
    const supabase = makeSupabase({
      doneEvents: { data: null, error: null },
      nudgedBackEvents: { data: null, error: null },
    })
    const { result, error } = await loadOfferData(supabase, "u1")
    expect(error).toBeNull()
    // null events → completionCount=0, nudgeBackCounts={} — offer computation still works
    expect(result.offer).toEqual([])
  })

  it("nudgeBackCounts counts only nudged_back events — not stopped, edited, or why", async () => {
    // The old code counted every 'edited' event as a nudge-back, which meant three normal
    // stops would trip the degradation threshold. Now only nudged_back counts.
    const thing = {
      id: "t1", name: "Test", class: "project", domain: "home", due_date: null,
      notify_window: null, live_step_id: "s1", started_at: null,
      steps: [{ id: "s1", name: "Step", band: "short", mode: "doing", shape: "clean", needs_know_how: false, step_order: 0, done: false }],
    }
    const supabase = makeSupabase({
      things: { data: [thing], error: null },
      // One genuine nudge-back — below the degradation threshold of 3
      nudgedBackEvents: { data: [{ thing_id: "t1" }], error: null },
    })
    const { result } = await loadOfferData(supabase, "u1")
    // nudgeBackCounts["t1"] = 1, which is below NUDGE_BACK_THRESHOLD (3)
    // so the step name should be specific, not generic
    expect(result.offer[0].step_name).toBe("Step")
  })
})
