import { describe, expect, it, vi } from "vitest"
import { markThingDone, markThingStillGoing, recordStepEvent, ServiceError } from "@/lib/things-service"

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
  it("clears started_at and returns result", async () => {
    const eqFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: eqFn })) })),
      })),
    } as unknown as Parameters<typeof markThingStillGoing>[0]

    const result = await markThingStillGoing(supabase, "t1", "u1")
    expect(result).toEqual({ ok: true, still_going: true })
    expect(eqFn).toHaveBeenCalled()
  })

  it("throws on DB error", async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: { message: "db error" } })),
          })),
        })),
      })),
    } as unknown as Parameters<typeof markThingStillGoing>[0]
    await expect(markThingStillGoing(supabase, "t1", "u1")).rejects.toThrow("db error")
  })
})

// ── markThingDone ─────────────────────────────────────────────────────────────

describe("markThingDone", () => {
  it("throws when thing not found", async () => {
    const supabase = {
      from: vi.fn(() => chainOf({ data: null, error: { message: "not found" } })),
    } as unknown as Parameters<typeof markThingDone>[0]
    await expect(markThingDone(supabase, "t1", "u1")).rejects.toThrow("Thing not found")
  })

  it("clears started_at when no live step", async () => {
    let call = 0
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "things" && call === 1) {
          return chainOf({ data: { id: "t1", name: "Thing", live_step_id: null }, error: null })
        }
        const c = chainOf({ error: null })
        c.update = vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }))
        return c
      }),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, still_going: false, thing_complete: false })
  })

  it("marks step done and advances to next step", async () => {
    let call = 0
    const promiseFns: Array<() => Promise<unknown>> = []
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "things" && call === 1) {
          // Fetch thing
          return chainOf({ data: { id: "t1", name: "My Thing", live_step_id: "s1" }, error: null })
        }
        if (table === "steps" && call === 2) {
          // Mark step done
          return {
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          }
        }
        if (table === "steps" && call === 3) {
          // Find next step → returns one
          return chainOf({ data: { id: "s2" }, error: null })
        }
        // Parallel: things update + step_events insert
        const c = chainOf({ error: null })
        c.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
        c.insert = vi.fn(async () => ({ error: null }))
        return c
      }),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, still_going: false, thing_complete: false, thing_name: null })
  })

  it("marks thing complete when no next step", async () => {
    let call = 0
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "things" && call === 1) {
          return chainOf({ data: { id: "t1", name: "Done Thing", live_step_id: "s1" }, error: null })
        }
        if (table === "steps" && call === 2) {
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
        }
        if (table === "steps" && call === 3) {
          // No next step
          return chainOf({ data: null, error: { code: "PGRST116" } })
        }
        const c = chainOf({ error: null })
        c.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
        c.insert = vi.fn(async () => ({ error: null }))
        return c
      }),
    } as unknown as Parameters<typeof markThingDone>[0]
    const result = await markThingDone(supabase, "t1", "u1")
    expect(result).toMatchObject({ ok: true, thing_complete: true, thing_name: "Done Thing" })
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
    let call = 0
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
        }
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })
    expect(result).toEqual({ ok: true })
  })

  it("inserts why event with enriched metadata", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "why", metadata: { note: "too hard" } as unknown as import("@/lib/database.types").Json })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "edited" }))
  })

  it("handles why event with null metadata (non-object → spread is empty)", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "why", metadata: null as unknown as import("@/lib/database.types").Json })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ event_type: "edited" }))
  })

  it("handles why event with array metadata (array → spread is empty)", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
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
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
        }
        return { insert: vi.fn(async () => ({ error: { message: "insert fail" } })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })).rejects.toThrow("insert fail")
  })

  it("handles done event with recurrence rule — updates next_due", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"))
    let call = 0
    const stepUpdateEq = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "steps" && call === 1) {
          return chainOf({
            data: { id: "s1", thing_id: "t1", recurrence_rule: { type: "fixed", days: 7, anchor: "completion" }, next_due: "2024-06-01", step_order: 0 },
            error: null,
          })
        }
        return {
          insert: vi.fn(async () => ({ error: null })),
          update: vi.fn(() => ({ eq: stepUpdateEq })),
        }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "done" })
    expect(result).toEqual({ ok: true })
    expect(stepUpdateEq).toHaveBeenCalled()
  })

  it("throws on event insert error for recurring done", async () => {
    let call = 0
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "steps" && call === 1) {
          return chainOf({
            data: { id: "s1", thing_id: "t1", recurrence_rule: { type: "fixed", days: 7, anchor: "completion" }, next_due: null, step_order: 0 },
            error: null,
          })
        }
        return {
          insert: vi.fn(async () => ({ error: { message: "event fail" } })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("event fail")
  })

  it("throws on step update error for recurring done", async () => {
    let call = 0
    const supabase = {
      from: vi.fn((table: string) => {
        call++
        if (table === "steps" && call === 1) {
          return chainOf({
            data: { id: "s1", thing_id: "t1", recurrence_rule: { type: "fixed", days: 7, anchor: "completion" }, next_due: null, step_order: 0 },
            error: null,
          })
        }
        return {
          insert: vi.fn(async () => ({ error: null })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: { message: "step fail" } })) })),
        }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("step fail")
  })

  it("handles non-recurring done — marks step done and advances thing", async () => {
    const thingUpdateEq = vi.fn(async () => ({ error: null }))
    // Track calls by table
    const stepCalls: number[] = []
    let thingCalls = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          stepCalls.push(stepCalls.length + 1)
          const n = stepCalls.length
          if (n === 1) return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
          if (n === 3) return chainOf({ data: { id: "s2" }, error: null }) // next undone step
          // n === 2: parallel update (step done)
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
        }
        if (table === "things") {
          thingCalls++
          return { update: vi.fn(() => ({ eq: thingUpdateEq })) }
        }
        // step_events insert
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    const result = await recordStepEvent(supabase, "s1", "u1", { event_type: "done" })
    expect(result).toEqual({ ok: true })
    expect(thingUpdateEq).toHaveBeenCalled()
  })

  it("throws on non-recurring done event insert error", async () => {
    const stepCalls: number[] = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          stepCalls.push(stepCalls.length + 1)
          if (stepCalls.length === 1) return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
        }
        // step_events: always fail
        return { insert: vi.fn(async () => ({ error: { message: "event insert fail" } })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("event insert fail")
  })

  it("throws on non-recurring done step update error", async () => {
    const stepCalls: number[] = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          stepCalls.push(stepCalls.length + 1)
          if (stepCalls.length === 1) return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: { message: "step update fail" } })) })) }
        }
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("step update fail")
  })

  it("throws on things update error for non-recurring done", async () => {
    const stepCalls: number[] = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          stepCalls.push(stepCalls.length + 1)
          const n = stepCalls.length
          if (n === 1) return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
          if (n === 3) return chainOf({ data: null, error: null }) // no next step
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
        }
        if (table === "things") {
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: { message: "thing fail" } })) })) }
        }
        return { insert: vi.fn(async () => ({ error: null })) }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await expect(recordStepEvent(supabase, "s1", "u1", { event_type: "done" })).rejects.toThrow("thing fail")
  })

  it("passes null metadata for non-why, non-done events with no metadata", async () => {
    const insertFn = vi.fn(async () => ({ error: null }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "steps") {
          return chainOf({ data: { id: "s1", thing_id: "t1", recurrence_rule: null, next_due: null, step_order: 0 }, error: null })
        }
        return { insert: insertFn }
      }),
    } as unknown as Parameters<typeof recordStepEvent>[0]
    await recordStepEvent(supabase, "s1", "u1", { event_type: "skipped" })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }))
  })
})
