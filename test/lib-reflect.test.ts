import { describe, expect, it, vi, beforeEach } from "vitest"
import { loadReflections } from "@/lib/reflect"

function makeSupabaseMock(overrides: {
  doneEvents?: unknown
  difficultyEvents?: unknown
  error?: { message: string } | null
} = {}) {
  const doneEvents = overrides.doneEvents ?? []
  const difficultyEvents = overrides.difficultyEvents ?? []
  const error = overrides.error ?? null

  const buildChain = (result: unknown) => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => Promise.resolve({ data: result, error }))
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result, error }).then(resolve)
    return chain
  }

  let callCount = 0
  const from = vi.fn(() => {
    callCount++
    if (callCount === 1) return buildChain(doneEvents)
    return buildChain(difficultyEvents)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any
}

describe("loadReflections", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"))
  })

  it("returns empty groups when user has no completed items", async () => {
    const supabase = makeSupabaseMock({ doneEvents: [] })
    const result = await loadReflections(supabase, "u1")
    expect(result.totalCount).toBe(0)
    expect(result.groups).toEqual([])
  })

  it("returns reflections grouped by relative date", async () => {
    const doneEvents = [
      {
        id: "e1",
        step_id: "s1",
        thing_id: "t1",
        created_at: "2026-11-02T10:00:00.000Z", // Today
        steps: { id: "s1", name: "Fit bath panel", band: "sitting" },
        things: { id: "t1", name: "Bathroom repair", domain: "home" },
      },
      {
        id: "e2",
        step_id: "s2",
        thing_id: "t2",
        created_at: "2026-11-01T15:00:00.000Z", // Yesterday
        steps: { id: "s2", name: "Order radiator valves", band: "short" },
        things: { id: "t2", name: "Heating fix", domain: "home" },
      },
    ]

    const supabase = makeSupabaseMock({ doneEvents })
    const result = await loadReflections(supabase, "u1")

    expect(result.totalCount).toBe(2)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].label).toBe("Today")
    expect(result.groups[0].items[0].step_name).toBe("Fit bath panel")
    expect(result.groups[1].label).toBe("Yesterday")
  })

  it("derives multi-sitting and revisited highlights from step_events", async () => {
    const doneEvents = [
      {
        id: "e1",
        step_id: "s1",
        thing_id: "t1",
        created_at: "2026-11-02T10:00:00.000Z",
        steps: { id: "s1", name: "Sand hallway floors", band: "run" },
        things: { id: "t1", name: "Decorate hall", domain: "home" },
      },
    ]

    // 2 previous stopped events on this step → 3 sittings total
    const difficultyEvents = [
      { step_id: "s1", event_type: "stopped" },
      { step_id: "s1", event_type: "stopped" },
    ]

    const supabase = makeSupabaseMock({ doneEvents, difficultyEvents })
    const result = await loadReflections(supabase, "u1")

    expect(result.groups[0].items[0].sittings_count).toBe(3)
    expect(result.groups[0].items[0].highlight).toBe("3 sittings")
  })
})
