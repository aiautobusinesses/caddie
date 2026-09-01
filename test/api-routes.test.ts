import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import type { AuthenticatedContext } from "@/lib/api/session"

// All vi.mock calls at module top level (hoisted before imports)
vi.mock("@/lib/api/session", () => ({ getAuthenticatedContext: vi.fn() }))
vi.mock("@/lib/thing-persistence", () => ({ persistThings: vi.fn() }))
vi.mock("@/lib/things-service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/things-service")>()
  return { ...orig, markThingDone: vi.fn(), markThingStillGoing: vi.fn(), recordStepEvent: vi.fn() }
})
vi.mock("@/lib/offer-data", () => ({ loadOfferData: vi.fn() }))

import { getAuthenticatedContext } from "@/lib/api/session"
import { persistThings } from "@/lib/thing-persistence"
import { markThingDone, markThingStillGoing, recordStepEvent, ServiceError } from "@/lib/things-service"
import { loadOfferData } from "@/lib/offer-data"

// Helper to build a fake authenticated context
function fakeAuth(supabaseOverrides: Record<string, unknown> = {}): AuthenticatedContext {
  return {
    user: { id: "u1" },
    profile: null,
    getProfile: vi.fn(async () => null),
    supabase: {
      from: vi.fn(),
      auth: {},
      ...supabaseOverrides,
    },
  } as unknown as AuthenticatedContext
}

// Helper to build fake Supabase fluent chain
function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.insert = vi.fn(async () => result)
  c.update = vi.fn(() => c)
  c.delete = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.is = vi.fn(() => c)
  c.in = vi.fn(() => c)
  c.order = vi.fn(() => c)
  c.limit = vi.fn(() => c)
  c.single = vi.fn(async () => result)
  c.upsert = vi.fn(async () => result)
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

function jsonReq(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// /api/care-groups/report
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/care-groups/report", async () => {
  const { POST } = await import("@/app/api/care-groups/report/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost/api/care-groups/report", {}))
    expect(res.status).toBe(401)
  })

  it("returns 400 when body is invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const req = new NextRequest("http://localhost/api/care-groups/report", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when plan_ids is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: [], done_ids: [] }))
    expect(res.status).toBe(400)
  })

  it("returns 500 when rpc fails", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: null, error: { message: "db fail" } })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: [] }))
    expect(res.status).toBe(500)
  })

  it("returns 200 on success — done plan", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: ["p1"] }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it("returns 200 on success — not-done plan", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: [] }))
    expect(res.status).toBe(200)
  })

  it("calls rpc with correct plan_ids and done_ids", async () => {
    const rpcFn = vi.fn(async () => ({ data: { ok: true }, error: null }))
    const sb = { rpc: rpcFn }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1", "p2"], done_ids: ["p1"] }))
    expect(res.status).toBe(200)
    expect(rpcFn).toHaveBeenCalledWith("report_care_group", {
      p_user_id: "u1",
      p_plan_ids: ["p1", "p2"],
      p_done_ids: ["p1"],
    })
  })

  it("returns 200 with empty done_ids", async () => {
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: ["p1"] }))
    expect(res.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/care-plans/[id]
// ═══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/care-plans/[id]", async () => {
  const { PATCH } = await import("@/app/api/care-plans/[id]/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await PATCH(jsonReq("http://localhost", {}, "PATCH"), ctx("p1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON body", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const req = new NextRequest("http://localhost", { method: "PATCH", body: "bad" })
    const res = await PATCH(req, ctx("p1"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when no valid fields provided", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await PATCH(jsonReq("http://localhost", {}, "PATCH"), ctx("p1"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when intervals are invalid", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await PATCH(jsonReq("http://localhost", { intervals: "bad" }, "PATCH"), ctx("p1"))
    expect(res.status).toBe(400)
  })

  it("returns 500 when DB update fails", async () => {
    const sb = { from: vi.fn(() => chain({ error: { message: "db error" } })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await PATCH(jsonReq("http://localhost", { action: "Water" }, "PATCH"), ctx("p1"))
    expect(res.status).toBe(500)
  })

  it("returns 200 on successful patch with all fields", async () => {
    const sb = { from: vi.fn(() => chain({ error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const intervals = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7]))
    const res = await PATCH(
      jsonReq("http://localhost", { action: "Feed", intervals, tolerance_days: 2, overdue_days: 5 }, "PATCH"),
      ctx("p1"),
    )
    expect(res.status).toBe(200)
  })

  it("accepts tolerance_days and overdue_days as 0", async () => {
    const sb = { from: vi.fn(() => chain({ error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await PATCH(jsonReq("http://localhost", { tolerance_days: 0, overdue_days: 0 }, "PATCH"), ctx("p1"))
    expect(res.status).toBe(200)
  })

  it("ignores NaN tolerance_days and overdue_days", async () => {
    // Number("abc") → NaN → skipped → no valid fields → 400
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await PATCH(jsonReq("http://localhost", { tolerance_days: "abc", overdue_days: "xyz" }, "PATCH"), ctx("p1"))
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/things", async () => {
  const { POST } = await import("@/app/api/things/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { things: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when no things", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { things: [] }))
    expect(res.status).toBe(400)
  })

  it("returns 201 on success", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(persistThings).mockResolvedValue({ saved: [{ thing_id: "t1", name: "Thing" }] })
    const thing = { name: "T", class: "project", domain: null, due_date: null, notify_window: null, steps: [{ name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false }] }
    const res = await POST(jsonReq("http://localhost", { things: [thing] }))
    expect(res.status).toBe(201)
  })

  it("treats non-array body.things as empty array → 400", async () => {
    // app/api/things/route.ts line 13: body.things not array → things = []
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { things: "not-an-array" }))
    expect(res.status).toBe(400)
  })

  it("returns 500 when persistThings throws", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(persistThings).mockRejectedValue(new Error("persist failed"))
    const thing = { name: "T", class: "project", domain: null, due_date: null, notify_window: null, steps: [{ name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false }] }
    const res = await POST(jsonReq("http://localhost", { things: [thing] }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("persist failed")
  })

  it("returns 500 with generic message when non-Error thrown", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(persistThings).mockRejectedValue("raw")
    const thing = { name: "T", class: "project", domain: null, due_date: null, notify_window: null, steps: [{ name: "S", band: "short", mode: "doing", shape: "clean", needs_know_how: false }] }
    const res = await POST(jsonReq("http://localhost", { things: [thing] }))
    expect(res.status).toBe(500)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things/[id] (PATCH + DELETE)
// ═══════════════════════════════════════════════════════════════════════════════

describe("/api/things/[id]", async () => {
  const { PATCH, DELETE } = await import("@/app/api/things/[id]/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  describe("PATCH", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
      const res = await PATCH(jsonReq("http://localhost", { name: "x" }, "PATCH"), ctx("t1"))
      expect(res.status).toBe(401)
    })

    it("returns 400 on invalid JSON", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
      const req = new NextRequest("http://localhost", { method: "PATCH", body: "bad" })
      const res = await PATCH(req, ctx("t1"))
      expect(res.status).toBe(400)
    })

    it("returns 400 when name is empty", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
      const res = await PATCH(jsonReq("http://localhost", { name: "  " }, "PATCH"), ctx("t1"))
      expect(res.status).toBe(400)
    })

    it("returns 500 when DB update fails", async () => {
      const sb = { from: vi.fn(() => chain({ error: { message: "fail" } })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await PATCH(jsonReq("http://localhost", { name: "New name" }, "PATCH"), ctx("t1"))
      expect(res.status).toBe(500)
    })

    it("returns 200 on success", async () => {
      const sb = { from: vi.fn(() => chain({ data: { id: "t1" }, error: null })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await PATCH(jsonReq("http://localhost", { name: "New name" }, "PATCH"), ctx("t1"))
      expect(res.status).toBe(200)
    })

    it("returns 404 when thing is not found (data is null)", async () => {
      const sb = { from: vi.fn(() => chain({ data: null, error: null })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await PATCH(jsonReq("http://localhost", { name: "New name" }, "PATCH"), ctx("t1"))
      expect(res.status).toBe(404)
    })
  })

  describe("DELETE", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
      const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), ctx("t1"))
      expect(res.status).toBe(401)
    })

    it("returns 500 when DB delete fails", async () => {
      const sb = { from: vi.fn(() => chain({ error: { message: "fail" } })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), ctx("t1"))
      expect(res.status).toBe(500)
    })

    it("returns 200 on success", async () => {
      const sb = { from: vi.fn(() => chain({ data: [{ id: "t1" }], error: null })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), ctx("t1"))
      expect(res.status).toBe(200)
    })

    it("returns 404 when thing is not found (empty data array)", async () => {
      const sb = { from: vi.fn(() => chain({ data: [], error: null })) }
      vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
      const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), ctx("t1"))
      expect(res.status).toBe(404)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things/[id]/start
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/things/[id]/start", async () => {
  const { POST } = await import("@/app/api/things/[id]/start/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(401)
  })

  it("returns 500 on DB error", async () => {
    const sb = { from: vi.fn(() => chain({ error: { message: "fail" } })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
  })

  it("returns 200 on success", async () => {
    const sb = { from: vi.fn(() => chain({ data: { id: "t1" }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(200)
  })

  it("returns 404 when thing is not found (data is null)", async () => {
    const sb = { from: vi.fn(() => chain({ data: null, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things/[id]/done
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/things/[id]/done", async () => {
  const { POST } = await import("@/app/api/things/[id]/done/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", {}), ctx("t1"))
    expect(res.status).toBe(401)
  })

  it("calls markThingStillGoing when still_going is true", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingStillGoing).mockResolvedValue({ ok: true, still_going: true })
    const res = await POST(jsonReq("http://localhost", { still_going: true }), ctx("t1"))
    expect(markThingStillGoing).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it("calls markThingDone when still_going is false", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingDone).mockResolvedValue({ ok: true, still_going: false, thing_complete: false, thing_name: null })
    const res = await POST(jsonReq("http://localhost", { still_going: false }), ctx("t1"))
    expect(markThingDone).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it("defaults to done when body parse fails", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingDone).mockResolvedValue({ ok: true, still_going: false, thing_complete: false, thing_name: null })
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad json" })
    const res = await POST(req, ctx("t1"))
    expect(markThingDone).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it("returns ServiceError status when thrown", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingDone).mockRejectedValue(new ServiceError("not found", 404))
    const res = await POST(jsonReq("http://localhost", {}), ctx("t1"))
    expect(res.status).toBe(404)
  })

  it("returns 500 for generic error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingDone).mockRejectedValue(new Error("db fail"))
    const res = await POST(jsonReq("http://localhost", {}), ctx("t1"))
    expect(res.status).toBe(500)
  })

  it("returns 500 with generic message when non-Error thrown", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(markThingDone).mockRejectedValue("raw")
    const res = await POST(jsonReq("http://localhost", {}), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Something went wrong")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/steps/[id]/event
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/steps/[id]/event", async () => {
  const { POST } = await import("@/app/api/steps/[id]/event/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { event_type: "done" }), ctx("s1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req, ctx("s1"))
    expect(res.status).toBe(400)
  })

  it("returns result from recordStepEvent on success", async () => {
    vi.mocked(recordStepEvent).mockResolvedValue({ ok: true })
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { event_type: "skipped" }), ctx("s1"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it("returns ServiceError status on ServiceError", async () => {
    vi.mocked(recordStepEvent).mockRejectedValue(new ServiceError("bad", 400))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { event_type: "done" }), ctx("s1"))
    expect(res.status).toBe(400)
  })

  it("returns 500 for non-Error thrown", async () => {
    vi.mocked(recordStepEvent).mockRejectedValue("raw")
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { event_type: "done" }), ctx("s1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Something went wrong")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/offer (GET)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/offer", async () => {
  const { GET } = await import("@/app/api/offer/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 500 when loadOfferData errors", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(loadOfferData).mockResolvedValue({
      result: { inProgress: null, offer: [], careGroup: null },
      error: "DB down",
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it("returns offer data on success", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    vi.mocked(loadOfferData).mockResolvedValue({
      result: { inProgress: null, offer: [], careGroup: null },
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ in_progress: null, offer: [], care_group: null })
  })

  it("fires offered events fire-and-forget when offer is non-empty", async () => {
    // Covers lines 20-27: the step_events insert block runs when offer.length > 0.
    // Fire-and-forget: result is irrelevant to the response, but the insert must be called.
    const insertFn = vi.fn(async () => ({ error: null }))
    const auth = fakeAuth({ from: vi.fn(() => ({ insert: insertFn })) })
    vi.mocked(getAuthenticatedContext).mockResolvedValue(auth as ReturnType<typeof fakeAuth>)
    vi.mocked(loadOfferData).mockResolvedValue({
      result: {
        inProgress: null,
        offer: [{ thing_id: "t1", thing_name: "T", step_id: "s1", step_name: "S", band: "short", mode: "doing", domain: "home", needs_know_how: false, reason: null }],
        careGroup: null,
      },
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    // Allow the fire-and-forget microtask to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(insertFn).toHaveBeenCalled()
  })

  it("updates last_care_offer_date fire-and-forget when care group is present", async () => {
    // Covers lines 36-37: the profiles update runs when offerState.careGroup is set.
    const updateFn = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const auth = fakeAuth({ from: vi.fn(() => ({ update: updateFn, insert: vi.fn(async () => ({ error: null })) })) })
    vi.mocked(getAuthenticatedContext).mockResolvedValue(auth as ReturnType<typeof fakeAuth>)
    vi.mocked(loadOfferData).mockResolvedValue({
      result: {
        inProgress: null,
        offer: [],
        careGroup: {
          type: "care_group",
          anchor_plan_id: "p1",
          action: "Water",
          location: "front room",
          title: "Water the front room plants",
          entity_names: ["Fern"],
          plan_ids: ["p1"],
          reason: null,
          has_overdue: false,
        },
      },
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ last_care_offer_date: expect.any(String) }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/push/subscribe (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/push/subscribe", async () => {
  const { POST } = await import("@/app/api/push/subscribe/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", {}))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when payload missing endpoint", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { keys: { p256dh: "a", auth: "b" } }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when endpoint is empty string", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { endpoint: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 500 when upsert fails", async () => {
    const sb = { from: vi.fn(() => chain({ error: { message: "db fail" } })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { endpoint: "https://push.example.com" }))
    expect(res.status).toBe(500)
  })

  it("returns 200 on success", async () => {
    const sb = { from: vi.fn(() => chain({ error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { endpoint: "https://push.example.com" }))
    expect(res.status).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Additional branch coverage for care-groups/report
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/care-groups/report — branch coverage", async () => {
  const { POST } = await import("@/app/api/care-groups/report/route")

  it("handles non-array plan_ids (falls back to []) — returns 400 for empty planIds (route.ts:28)", async () => {
    // body.plan_ids is not an array → planIds = [] → planIds.length === 0 → 400
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth() as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: "not-array", done_ids: ["p1"] }))
    expect(res.status).toBe(400)
  })

  it("handles non-array done_ids (falls back to [])", async () => {
    // body.done_ids is not an array → doneIds = [] → rpc called with empty done_ids
    const sb = { rpc: vi.fn(async () => ({ data: { ok: true }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: "not-array" }))
    expect(res.status).toBe(200)
  })

  it("passes multiple plan_ids to rpc", async () => {
    const rpcFn = vi.fn(async () => ({ data: { ok: true }, error: null }))
    const sb = { rpc: rpcFn }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1", "p2"], done_ids: ["p1", "p2"] }))
    expect(res.status).toBe(200)
    expect(rpcFn).toHaveBeenCalledWith("report_care_group", expect.objectContaining({
      p_plan_ids: ["p1", "p2"],
      p_done_ids: ["p1", "p2"],
    }))
  })

  it("passes empty done_ids to rpc when done_ids is not an array", async () => {
    const rpcFn = vi.fn(async () => ({ data: { ok: true }, error: null }))
    const sb = { rpc: rpcFn }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { plan_ids: ["p1"], done_ids: null }))
    expect(res.status).toBe(200)
    expect(rpcFn).toHaveBeenCalledWith("report_care_group", expect.objectContaining({
      p_done_ids: [],
    }))
  })
})
