import { describe, expect, it, vi } from "vitest"
import { persistThings } from "@/lib/thing-persistence"
import type { LifeWalkExtractedThing } from "@/lib/tasks"

function makeThing(overrides: Partial<LifeWalkExtractedThing> = {}): LifeWalkExtractedThing {
  return {
    name: "Bath panel",
    class: "project",
    notify_window: null,
    notify_time_of_day: null,
    notify_escalate: false,
    steps: [
      { name: "Order panel", band: "short", mode: "thinking", shape: "clean", needs_know_how: false, recurrence_rule: null, next_due: null },
    ],
    ...overrides,
  }
}

function makeSupabase({
  thingId = "t1",
  rpcError = null,
}: {
  thingId?: string
  rpcError?: { message: string } | null
} = {}) {
  return {
    rpc: vi.fn(async () => {
      if (rpcError) return { data: null, error: rpcError }
      return { data: thingId, error: null }
    }),
  } as unknown as Parameters<typeof persistThings>[0]
}

describe("persistThings", () => {
  it("skips things with empty name", async () => {
    const supabase = makeSupabase()
    const result = await persistThings(supabase, [makeThing({ name: "  " })], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("skips things with no steps", async () => {
    const supabase = makeSupabase()
    const result = await persistThings(supabase, [makeThing({ steps: [] })], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("saves a valid thing and returns it", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const result = await persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    expect(result.saved[0].name).toBe("Bath panel")
    expect(result.saved[0].thing_id).toBe("t1")
    expect(supabase.rpc).toHaveBeenCalledWith("insert_thing_with_steps", expect.objectContaining({
      p_user_id: "u1",
      p_name: "Bath panel",
      p_source: "life_walk",
    }))
  })

  it("throws when rpc returns an error", async () => {
    const supabase = makeSupabase({ rpcError: { message: "insert failed" } })
    await expect(
      persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })
    ).rejects.toThrow("insert failed")
  })

  it("throws 'Failed to insert thing' when rpc returns null data and no error", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as Parameters<typeof persistThings>[0]
    await expect(
      persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })
    ).rejects.toThrow("Failed to insert thing")
  })

  it("handles step with recurrence_rule", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const thing = makeThing({
      steps: [{ name: "Water", band: "short", mode: "doing", shape: "clean", needs_know_how: false, recurrence_rule: { type: "fixed", days: 7, anchor: "completion" }, next_due: "2024-03-01" }],
    })
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })

  it("uses fallback class 'project' when thing.class is undefined", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const thing = { ...makeThing(), class: undefined as unknown as "project" }
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledWith("insert_thing_with_steps", expect.objectContaining({
      p_class: "project",
    }))
  })

  it("uses fallback notify_escalate false when undefined", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const thing = { ...makeThing(), notify_escalate: undefined as unknown as boolean }
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledWith("insert_thing_with_steps", expect.objectContaining({
      p_notify_escalate: false,
    }))
  })

  it("uses fallback band/mode/shape when step fields are undefined", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const thing = makeThing({
      steps: [{ name: "Step", band: undefined as unknown as "short", mode: undefined as unknown as "doing", shape: undefined as unknown as "clean", needs_know_how: false, recurrence_rule: null, next_due: undefined as unknown as null }],
    })
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    const stepsArg = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1].p_steps
    expect(stepsArg[0].band).toBe("sitting")
    expect(stepsArg[0].mode).toBe("doing")
    expect(stepsArg[0].shape).toBe("clean")
  })

  it("uses false fallback when needs_know_how is undefined", async () => {
    const supabase = makeSupabase({ thingId: "t1" })
    const thing = makeThing({
      steps: [{ name: "Step", band: "short", mode: "doing", shape: "clean", needs_know_how: undefined as unknown as boolean, recurrence_rule: null, next_due: null }],
    })
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    const stepsArg = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1].p_steps
    expect(stepsArg[0].needs_know_how).toBe(false)
  })

  it("saves multiple valid things in order", async () => {
    let call = 0
    const supabase = {
      rpc: vi.fn(async () => {
        call++
        return { data: `t${call}`, error: null }
      }),
    } as unknown as Parameters<typeof persistThings>[0]
    const result = await persistThings(
      supabase,
      [makeThing({ name: "Thing A" }), makeThing({ name: "Thing B" })],
      { source: "life_walk", userId: "u1" }
    )
    expect(result.saved).toHaveLength(2)
    expect(result.saved[0].name).toBe("Thing A")
    expect(result.saved[1].name).toBe("Thing B")
  })
})
