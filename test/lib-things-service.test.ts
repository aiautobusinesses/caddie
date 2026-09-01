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
})
