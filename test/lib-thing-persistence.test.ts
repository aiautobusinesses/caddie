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
      { name: "Order panel", band: "short", mode: "thinking", shape: "clean", recurrence_rule: null, next_due: null },
    ],
    ...overrides,
  }
}

function makeSupabase({
  thingId = "t1",
  thingError = null,
  stepRows = [{ id: "s1", step_order: 0 }],
  stepError = null,
  liveStepError = null,
}: {
  thingId?: string
  thingError?: { message: string } | null
  stepRows?: { id: string; step_order: number }[]
  stepError?: { message: string } | null
  liveStepError?: { message: string } | null
} = {}) {
  const insertChain = (result: unknown) => {
    const chain: Record<string, unknown> = {}
    chain.insert = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.single = vi.fn(() => Promise.resolve(result))
    chain.eq = vi.fn(() => chain)
    chain.update = vi.fn(() => chain)
    chain.delete = vi.fn(() => chain)
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return chain
  }

  const thingsChain = insertChain(
    thingError ? { data: null, error: thingError } : { data: { id: thingId }, error: null },
  )
  thingsChain.update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: liveStepError })),
  }))
  thingsChain.delete = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }))

  const stepsResult = stepError
    ? { data: null, error: stepError }
    : { data: stepRows, error: null }
  const stepsChain = insertChain(stepsResult)

  let call = 0
  return {
    from: vi.fn((table: string) => {
      if (table === "things") {
        call++
        if (call <= 1) return thingsChain
        return thingsChain
      }
      return stepsChain
    }),
  } as unknown as Parameters<typeof persistThings>[0]
}

describe("persistThings", () => {
  it("skips things with empty name", async () => {
    const supabase = makeSupabase()
    const result = await persistThings(supabase, [makeThing({ name: "  " })], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(0)
  })

  it("skips things with no steps", async () => {
    const supabase = makeSupabase()
    const result = await persistThings(supabase, [makeThing({ steps: [] })], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(0)
  })

  it("saves a valid thing and returns it", async () => {
    const things = (() => {
      let thingCall = 0
      let stepsCall = 0

      const thingsInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
        })),
      }))
      const thingsUpdate = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }))

      const stepsInsert = vi.fn(() => ({
        select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })),
      }))

      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            return { insert: thingCall === 1 ? thingsInsert : vi.fn(), update: thingsUpdate }
          }
          stepsCall++
          return { insert: stepsInsert }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()

    const result = await persistThings(things, [makeThing()], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
    expect(result.saved[0].name).toBe("Bath panel")
  })

  it("throws when thing insert fails", async () => {
    const supabase = (() => {
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
                })),
              })),
            }
          }
          return {}
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    await expect(persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })).rejects.toThrow("insert failed")
  })

  it("throws when step insert fails and cleans up thing", async () => {
    const deleteEq = vi.fn(async () => ({ error: null }))
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) {
              return {
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
                  })),
                })),
              }
            }
            return { delete: vi.fn(() => ({ eq: deleteEq })) }
          }
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: null, error: { message: "step insert failed" } })),
            })),
          }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    await expect(persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })).rejects.toThrow("step insert failed")
    expect(deleteEq).toHaveBeenCalled()
  })

  it("throws when live_step_id update fails", async () => {
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) {
              return {
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
                  })),
                })),
              }
            }
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: { message: "update failed" } })),
              })),
            }
          }
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })),
            })),
          }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    await expect(persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })).rejects.toThrow("update failed")
  })

  it("handles step with recurrence_rule", async () => {
    const saved: { thing_id: string; name: string }[] = []
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) {
              return {
                insert: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
                  })),
                })),
              }
            }
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null })),
              })),
            }
          }
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })),
            })),
          }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    const thing = makeThing({
      steps: [{ name: "Water", band: "short", mode: "doing", shape: "clean", recurrence_rule: { type: "fixed", days: 7, anchor: "completion" }, next_due: "2024-03-01" }],
    })
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })
  it("uses fallback class 'project' when thing.class is undefined (lib/thing-persistence.ts:32)", async () => {
    // thing.class ?? "project" true branch
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })) })) }
            return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
          }
          return { insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })) })) }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    const thing = { ...makeThing(), class: undefined as unknown as "project" }
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })

  it("uses fallback notify_escalate false when undefined (lib/thing-persistence.ts:35)", async () => {
    // notify_escalate ?? false true branch
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })) })) }
            return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
          }
          return { insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })) })) }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    const thing = { ...makeThing(), notify_escalate: undefined as unknown as boolean }
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })

  it("uses fallback band/mode/shape when step fields are undefined (lib/thing-persistence.ts:51-53)", async () => {
    // step.band ?? "sitting", step.mode ?? "doing", step.shape ?? "clean"
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })) })) }
            return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
          }
          return { insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: "s1", step_order: 0 }], error: null })) })) }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    const thing = makeThing({
      steps: [{ name: "Step", band: undefined as unknown as "short", mode: undefined as unknown as "doing", shape: undefined as unknown as "clean", recurrence_rule: null, next_due: undefined as unknown as null }],
    })
    const result = await persistThings(supabase, [thing], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })

  it("throws 'Failed to insert thing' when thingRow is null and thingError is null (lib/thing-persistence.ts:42)", async () => {
    // thingError is null but thingRow is also null → ?? "Failed to insert thing"
    const supabase = (() => {
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })) }
          }
          return {}
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    await expect(persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })).rejects.toThrow("Failed to insert thing")
  })

  it("throws 'Failed to insert steps' when stepRows is empty and stepsError is null (lib/thing-persistence.ts:68)", async () => {
    // stepsError is null but stepRows is empty → ?? "Failed to insert steps"
    const deleteEq = vi.fn(async () => ({ error: null }))
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) {
              return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })) })) }
            }
            return { delete: vi.fn(() => ({ eq: deleteEq })) }
          }
          return { insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: [], error: null })) })) }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    await expect(persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })).rejects.toThrow("Failed to insert steps")
    expect(deleteEq).toHaveBeenCalled()
  })

  it("uses stepRows[0] fallback when no step has step_order 0 (lib/thing-persistence.ts:71)", async () => {
    // stepRows.find(step => step.step_order === 0) returns undefined → ?? stepRows[0]
    const supabase = (() => {
      let thingCall = 0
      return {
        from: vi.fn((table: string) => {
          if (table === "things") {
            thingCall++
            if (thingCall === 1) return { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })) })) }
            return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
          }
          // step_order starts at 99 (not 0) → find fails → uses stepRows[0]
          return { insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{ id: "s99", step_order: 99 }], error: null })) })) }
        }),
      } as unknown as Parameters<typeof persistThings>[0]
    })()
    const result = await persistThings(supabase, [makeThing()], { source: "life_walk", userId: "u1" })
    expect(result.saved).toHaveLength(1)
  })
})
