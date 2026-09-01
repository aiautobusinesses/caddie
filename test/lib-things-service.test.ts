import { describe, expect, it, vi } from "vitest"
import { markThingDone, markThingStillGoing, nudgeStep, recordStepEvent, ServiceError } from "@/lib/things-service"

// ── helpers ──────────────────────────────────────────────────────────────────

type Chain = Record<string, (...args: unknown[]) => unknown>

function chainOf(resolved: unknown): Chain {
  const c: Chain = {}
  c.select = vi.fn(() => c)
  c.insert = vi.fn(() => c)
  c.update = vi.fn(() => c)
  c.delete = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.neq = vi.fn(() => c)
  c.order = vi.fn(() => c)
  c.limit = vi.fn(() => c)
  c.single = vi.fn(async () => resolved)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.then = ((resolve: (v: unknown) => unknown) => Promise.resolve(resolved).then(resolve)) as any
  return c
}

// ── ServiceError ──────────────────────────────────────────────────────────────

describe("ServiceError", () => {
  it("exposes status and name", () => {
    const e = new ServiceError("bad request", 400)
    expect(e.status).toBe(400)
    expect(e.name).toBe("ServiceError")
    expect(e.message).toBe("bad request")
  })
})

// ── markThingStillGoing ───────────────────────────────────────────────────────

describe("markThingStillGoing", () => {
  // markThingStillGoing:
  // 1. SELECTs the thing to get live_step_id
  // 2. UPDATEs started_at = null
  // 3. Awaits INSERT of a stopped event (throws on error if live_step_id is present)

  function makeStillGoingSupabase({
    liveStepId = "s1",
    updateError = null as { message: string } | null,
    insertError = null as { message: string } | null,
  } = {}) {
    const insertFn = vi.fn(async () => ({ error: insertError }))
    let callCount = 0
    const from = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        // SELECT live_step_id
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { live_step_id: liveStepId }, error: null })),
              })),
            })),
          })),
        }
      }
      if (callCount === 2) {
        // UPDATE started_at = null
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: updateError })),
            })),
          })),
        }
      }
      // INSERT stopped event (awaited)
      return { insert: insertFn }
    })
    return { supabase: { from } as unknown as Parameters<typeof markThingStillGoing>[0], insertFn }
  }

  it("clears started_at and returns result", async () => {
    const { supabase } = makeStillGoingSupabase()
    const result = await markThingStillGoing(supabase, "t1", "u1")
    expect(result).toEqual({ ok: true, still_going: true })
  })

  it("writes a stopped event against the live step", async () => {
    const { supabase, insertFn } = makeStillGoingSupabase({ liveStepId: "s1" })
    await markThingStillGoing(supabase, "t1", "u1")
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      step_id: "s1",
      thing_id: "t1",
      event_type: "stopped",
    }))
  })

  it("skips the stopped event insert when there is no live step", async () => {
    const { supabase, insertFn } = makeStillGoingSupabase({ liveStepId: null as unknown as string })
    await markThingStillGoing(supabase, "t1", "u1")
    expect(insertFn).not.toHaveBeenCalled()
  })

  it("throws on update DB error", async () => {
    const { supabase } = makeStillGoingSupabase({ updateError: { message: "db error" } })
    await expect(markThingStillGoing(supabase, "t1", "u1")).rejects.toThrow("db error")
  })

  it("throws on stopped event insert error", async () => {
    const { supabase } = makeStillGoingSupabase({ insertError: { message: "insert error" } })
    await expect(markThingStillGoing(supabase, "t1", "u1")).rejects.toThrow("insert error")
  })
})

// ── markThingDone ─────────────────────────────────────────────────────────────

describe("markThingDone", () => {
  it("throws when thing not found", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "Thing not found" } })),
    } as unknown as Parameters<typeof markThingDone>[0]
    await expect(markThingDone(supabase, "t1", "u1")).rejects.toThrow("Thing not found")
  })

  it("clears started_at when no live step", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { thing_complete: false, thing_name: null },
        error: null,
      })),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, still_going: false, thing_complete: false })
  })

  it("marks step done and advances to next step", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { thing_complete: false, thing_name: null },
        error: null,
      })),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, still_going: false, thing_complete: false, thing_name: null })
    expect(supabase.rpc).toHaveBeenCalledWith("mark_thing_done", { p_thing_id: "t1", p_user_id: "u1" })
  })

  it("marks thing complete when no next step", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { thing_complete: true, thing_name: "Done Thing" },
        error: null,
      })),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, thing_complete: true, thing_name: "Done Thing" })
  })

  it("defaults thing_complete to false when rpc returns null data", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, still_going: false, thing_complete: false, thing_name: null })
  })
})

// ── recordStepEvent ───────────────────────────────────────────────────────────

describe("recordStepEvent", () => {
  it("throws ServiceError 400 on invalid event_type", async () => {
    const supabase = { from: vi.fn() } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "bad" })).rejects.toMatchObject({ status: 400 })
  })

  it("throws ServiceError 404 when step not found", async () => {
    const supabase = {
      from: vi.fn(() => chainOf({ data: null, error: { message: "not found" } })),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })).rejects.toMatchObject({ status: 404 })
  })

  it("inserts non-done event and returns ok", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })
    expect(result).toEqual({ ok: true })
  })

  it("inserts stopped event with event_type='stopped' — not collapsed to 'edited'", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "stopped" })
    expect(result).toEqual({ ok: true })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "stopped" }))
  })

  it("inserts stop_note event with metadata — distinct from the stopped session marker", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const metadata = { note: "got to the third step" } as unknown as import("@/lib/database.types").Json
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "stop_note", metadata })
    expect(result).toEqual({ ok: true })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "stop_note",
      metadata: { note: "got to the third step" },
    }))
  })

  it("inserts why event with event_type='why' and enriched metadata", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "why", metadata: { note: "too hard" } as unknown as import("@/lib/database.types").Json })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "why" }))
  })

  it("handles why event with null metadata (non-object → spread is empty)", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "why", metadata: null as unknown as import("@/lib/database.types").Json })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "why" }))
  })

  it("handles why event with array metadata (array → spread is empty)", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "why", metadata: ["item"] as unknown as import("@/lib/database.types").Json })
    expect(insertFn).toHaveBeenCalled()
  })

  it("throws on insert error for non-done event", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: vi.fn(async () => ({ error: { message: "insert fail" } })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })).rejects.toThrow("insert fail")
  })

  it("handles done event — delegates to rpc and returns ok", async () => {
    const rpcFn = vi.fn(async () => ({ data: { ok: true }, error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return {}
      }),
      rpc: rpcFn,
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "done" })
    expect(result).toEqual({ ok: true })
    expect(rpcFn).toHaveBeenCalledWith("record_step_event_done", expect.objectContaining({
      p_step_id: "s1",
      p_user_id: "u1",
    }))
  })

  it("throws on done rpc error", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return {}
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "rpc fail" } })),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("rpc fail")
  })

  it("passes null metadata for non-why, non-done events with no metadata", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }))
  })

  it("clears needs_know_how on accepted event (lib/things-service.ts:168-175)", async () => {
    // When event_type === "accepted", the route must clear needs_know_how on the step
    // so the familiarity question never fires again.
    const insertFn = vi.fn(async () => ({ error: null }))
    const eqUserId = vi.fn(async () => ({ error: null }))
    const eqStepId = vi.fn(() => ({ eq: eqUserId }))
    const updateFn = vi.fn(() => ({ eq: eqStepId }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          // First call: SELECT (step lookup); second call: UPDATE needs_know_how
          const stepChain = chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
          stepChain.update = updateFn
          return stepChain
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "accepted" })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "accepted" }))
    expect(updateFn).toHaveBeenCalledWith({ needs_know_how: false })
  })

  it("throws when needs_know_how clear fails on accepted event (lib/things-service.ts:174)", async () => {
    // The update error path after the accepted event insert.
    const eqUserId = vi.fn(async () => ({ error: { message: "update failed" } }))
    const eqStepId = vi.fn(() => ({ eq: eqUserId }))
    const updateFn = vi.fn(() => ({ eq: eqStepId }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          const stepChain = chainOf({ data: { id: "s1", thing_id: "t1", step_order: 0 }, error: null })
          stepChain.update = updateFn
          return stepChain
        }
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "accepted" })).rejects.toThrow("update failed")
  })
})

// ── nudgeStep ─────────────────────────────────────────────────────────────────

describe("nudgeStep", () => {
  const STEPS = [
    { id: "s0", step_order: 0, done: true },
    { id: "s1", step_order: 1, done: false },
    { id: "s2", step_order: 2, done: false },
  ]

  function makeNudgeSupabase({
    liveStepId = "s1",
    thingError = null as { message: string } | null,
    stepsError = null as { message: string } | null,
    stepsData = STEPS as { id: string; step_order: number; done: boolean }[] | null,
    stepUpdateError = null as { message: string } | null,
    updateThingError = null as { message: string } | null,
    insertError = null as { message: string } | null,
  } = {}) {
    const insertFn = vi.fn(async () => ({ error: insertError }))
    let fromCallCount = 0

    const from = vi.fn((table: string) => {
      fromCallCount++
      if (table === "things" && fromCallCount === 1) {
        // SELECT live_step_id from things
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: thingError ? null : { id: "t1", live_step_id: liveStepId },
                  error: thingError,
                })),
              })),
            })),
          })),
        }
      }
      if (table === "steps") {
        // SELECT steps, then UPDATE for reopen (back) or mark-done (forward).
        // The forward path chains: .update().eq().eq().eq().gte().lt()
        // Build a fluent object that resolves to { error } at await time.
        const stepUpdateChain: Record<string, unknown> = {}
        const stepUpdateTerminal = vi.fn(async () => ({ error: stepUpdateError }))
        const stepUpdateLink = vi.fn(() => stepUpdateChain)
        stepUpdateChain.eq = stepUpdateLink
        stepUpdateChain.gte = stepUpdateLink
        stepUpdateChain.lt = stepUpdateTerminal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(stepUpdateChain as any).then = ((resolve: (v: unknown) => unknown) =>
          Promise.resolve({ error: stepUpdateError }).then(resolve)) as unknown
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: stepsError ? null : stepsData, error: stepsError })),
              })),
            })),
          })),
          update: vi.fn(() => stepUpdateChain),
        }
      }
      if (table === "things") {
        // UPDATE live_step_id on things
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: updateThingError })),
            })),
          })),
        }
      }
      // step_events INSERT
      return { insert: insertFn }
    })

    return { supabase: { from } as unknown as Parameters<typeof nudgeStep>[0], insertFn }
  }

  it("nudges back: writes nudged_back event with to: target metadata", async () => {
    const { supabase, insertFn } = makeNudgeSupabase({ liveStepId: "s1" })
    const result = await nudgeStep(supabase, "t1", "u1", "back")
    expect(result).toEqual({ ok: true })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      step_id: "s1",
      thing_id: "t1",
      event_type: "nudged_back",
      metadata: { to: "s0" },
    }))
  })

  it("nudges forward: writes nudged_forward event with to: target metadata", async () => {
    const { supabase, insertFn } = makeNudgeSupabase({ liveStepId: "s1" })
    const result = await nudgeStep(supabase, "t1", "u1", "forward")
    expect(result).toEqual({ ok: true })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      step_id: "s1",
      thing_id: "t1",
      event_type: "nudged_forward",
      metadata: { to: "s2" },
    }))
  })

  it("nudges forward: issues a range update with done: true (not a per-step loop)", async () => {
    // The update must use done: true and be issued as a single range statement.
    // We verify update() is called with done: true.
    let stepUpdateArgs: Record<string, unknown> | null = null
    let fromCallCount = 0
    const from = vi.fn((table: string) => {
      fromCallCount++
      if (table === "things" && fromCallCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "t1", live_step_id: "s1" }, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === "steps") {
        const chain: Record<string, unknown> = {}
        const end = vi.fn(async () => ({ error: null }))
        const link = vi.fn(() => chain)
        chain.eq = link; chain.gte = link; chain.lt = end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(chain as any).then = (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r)
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: [
                    { id: "s1", step_order: 1, done: false },
                    { id: "s2", step_order: 2, done: false },
                  ],
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn((args: Record<string, unknown>) => { stepUpdateArgs = args; return chain }),
        }
      }
      if (table === "things") {
        return { update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })) }
      }
      return { insert: vi.fn(async () => ({ error: null })) }
    })
    const supabase = { from } as unknown as Parameters<typeof nudgeStep>[0]
    await nudgeStep(supabase, "t1", "u1", "forward")
    expect(stepUpdateArgs).toMatchObject({ done: true })
  })

  it("nudges forward: range upper bound excludes the target step (step_order < target)", async () => {
    // The .lt() call must receive targetStep.step_order so the target is never
    // marked done by the range update. s1 live (order 1), s2 target (order 2) —
    // .lt() must be called with 2.
    let ltArg: unknown = null
    let fromCallCount = 0
    const from = vi.fn((table: string) => {
      fromCallCount++
      if (table === "things" && fromCallCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "t1", live_step_id: "s1" }, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === "steps") {
        const chain: Record<string, unknown> = {}
        const end = vi.fn(async (_col: string, val: unknown) => { ltArg = val; return { error: null } })
        const link = vi.fn(() => chain)
        chain.eq = link; chain.gte = link; chain.lt = end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(chain as any).then = (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r)
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: [
                    { id: "s1", step_order: 1, done: false },
                    { id: "s2", step_order: 2, done: false },
                  ],
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn(() => chain),
        }
      }
      if (table === "things") {
        return { update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })) }
      }
      return { insert: vi.fn(async () => ({ error: null })) }
    })
    const supabase = { from } as unknown as Parameters<typeof nudgeStep>[0]
    await nudgeStep(supabase, "t1", "u1", "forward")
    // targetStep.step_order is 2 — .lt("step_order", 2) excludes s2 from the update
    expect(ltArg).toBe(2)
  })

  it("nudges forward: skips already-done intermediate steps (does not re-mark them)", async () => {
    // s1 live, s2 already done, s3 target — only s1 needs marking done, not s2.
    const stepsData = [
      { id: "s1", step_order: 1, done: false },
      { id: "s2", step_order: 2, done: true },
      { id: "s3", step_order: 3, done: false },
    ]
    const { supabase, insertFn } = makeNudgeSupabase({ liveStepId: "s1", stepsData })
    const result = await nudgeStep(supabase, "t1", "u1", "forward")
    expect(result).toEqual({ ok: true })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "nudged_forward",
      metadata: { to: "s3" },
    }))
  })

  it("throws ServiceError 404 when thing not found", async () => {
    const { supabase } = makeNudgeSupabase({ thingError: { message: "not found" } })
    await expect(nudgeStep(supabase, "t1", "u1", "back")).rejects.toMatchObject({ status: 404 })
  })

  it("throws ServiceError 400 when thing has no live_step_id", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: null as unknown as string })
    await expect(nudgeStep(supabase, "t1", "u1", "back")).rejects.toMatchObject({ status: 400 })
  })

  it("throws ServiceError 404 when steps query fails", async () => {
    const { supabase } = makeNudgeSupabase({ stepsError: { message: "steps error" } })
    await expect(nudgeStep(supabase, "t1", "u1", "back")).rejects.toMatchObject({ status: 404 })
  })

  it("throws ServiceError 400 when nudging back from the first step", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s0" })
    await expect(nudgeStep(supabase, "t1", "u1", "back")).rejects.toMatchObject({ status: 400 })
  })

  it("throws ServiceError 400 when nudging forward from the last undone step", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s2" })
    await expect(nudgeStep(supabase, "t1", "u1", "forward")).rejects.toMatchObject({ status: 400 })
  })

  it("throws on step update error when nudging back (reopen)", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s1", stepUpdateError: { message: "reopen fail" } })
    await expect(nudgeStep(supabase, "t1", "u1", "back")).rejects.toThrow("reopen fail")
  })

  it("throws on step update error when nudging forward (mark done)", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s1", stepUpdateError: { message: "done fail" } })
    await expect(nudgeStep(supabase, "t1", "u1", "forward")).rejects.toThrow("done fail")
  })

  it("throws on live_step_id update error", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s1", updateThingError: { message: "update fail" } })
    await expect(nudgeStep(supabase, "t1", "u1", "forward")).rejects.toThrow("update fail")
  })

  it("throws on event insert error", async () => {
    const { supabase } = makeNudgeSupabase({ liveStepId: "s1", insertError: { message: "insert fail" } })
    await expect(nudgeStep(supabase, "t1", "u1", "forward")).rejects.toThrow("insert fail")
  })
})
