import { describe, expect, it, vi, beforeEach } from "vitest"
import { loadOfferData } from "@/lib/offer-data"

function makeSupabase(overrides: {
  things?: { data: unknown; error: unknown }
  carePlans?: { data: unknown; error: null }
  profile?: { data: unknown; error: null }
} = {}) {
  const things = overrides.things ?? { data: [], error: null }
  const carePlans = overrides.carePlans ?? { data: [], error: null }
  const profile = overrides.profile ?? { data: null, error: null }

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
    return buildChain(profile)
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

  it("handles null things and null carePlans from DB (lib/offer-data.ts:57-58)", async () => {
    // When DB returns null for things/carePlans, ?? [] fallback is used
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
      id: "t1", name: "Test", class: "project", notify_window: null,
      live_step_id: "s1", started_at: null,
      steps: [{ id: "s1", name: "Step", band: "short", mode: "doing", shape: "clean", recurrence_rule: null, next_due: null, last_done_at: null, step_order: 0, done: false }],
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
})
