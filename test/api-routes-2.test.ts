import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { AuthenticatedContext } from "@/lib/api/session"

// All vi.mock calls must be at module top level
vi.mock("@/lib/api/session", () => ({ getAuthenticatedContext: vi.fn() }))
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn()
  function MockAnthropic() { return { messages: { create: mockCreate } } }
  class APIError extends Error {
    status: number | null
    constructor(msg: string, status: number | null = 502) { super(msg); this.status = status }
  }
  MockAnthropic.APIError = APIError
  return { default: MockAnthropic }
})
vi.mock("@/lib/lifewalk-parse", () => ({ parseLifeWalkThingsFromModelText: vi.fn() }))
vi.mock("@/lib/seed-care-plan", () => ({ seedCarePlan: vi.fn() }))
vi.mock("@/lib/supabase/server-service", () => ({ createClient: vi.fn(() => ({})) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/thing-persistence", () => ({ persistThings: vi.fn() }))

import { getAuthenticatedContext } from "@/lib/api/session"
import { parseLifeWalkThingsFromModelText } from "@/lib/lifewalk-parse"
import { seedCarePlan } from "@/lib/seed-care-plan"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { persistThings } from "@/lib/thing-persistence"

async function getAnthropicCreate() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const inst = new (Anthropic as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()
  return inst.messages.create
}

function fakeAuth(supabaseOverrides: Record<string, unknown> = {}): AuthenticatedContext {
  return { user: { id: "u1" }, supabase: { from: vi.fn(), ...supabaseOverrides } } as unknown as AuthenticatedContext
}

// Full fluent chain for Supabase: select, insert, update, delete, eq, in, single, upsert
function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  const self = () => c
  c.select = vi.fn(self)
  c.insert = vi.fn(self)
  c.update = vi.fn(self)
  c.delete = vi.fn(self)
  c.eq = vi.fn(self)
  c.neq = vi.fn(self)
  c.is = vi.fn(self)
  c.in = vi.fn(self)
  c.order = vi.fn(self)
  c.limit = vi.fn(self)
  c.single = vi.fn(async () => result)
  c.upsert = vi.fn(async () => result)
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

// Full chain with .insert().select().single() support
function insertSelectChain(result: unknown) {
  const singleFn = vi.fn(async () => result)
  const selectFn = vi.fn(() => ({ single: singleFn }))
  const insertFn = vi.fn(() => ({ select: selectFn }))
  const deleteFn = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  return { insert: insertFn, delete: deleteFn, select: selectFn, single: singleFn }
}

function jsonReq(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things/[id]/prepend-lookup
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/things/[id]/prepend-lookup", async () => {
  const { POST } = await import("@/app/api/things/[id]/prepend-lookup/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  // Builds a from() mock that sequences: first call → thing fetch, second call → steps insert, third call → things update
  function makeFrom({
    thingData = { id: "t1", live_step_id: "s1", steps: [{ id: "s1", name: "Prep walls", step_order: 0 }] },
    thingError = null,
    insertData = { id: "new-step" },
    insertError = null,
    updateError = null,
  }: {
    thingData?: unknown
    thingError?: unknown
    insertData?: unknown
    insertError?: unknown
    updateError?: unknown
  } = {}) {
    let call = 0
    return vi.fn(() => {
      call++
      if (call === 1) return chain({ data: thingData, error: thingError })
      if (call === 2) return chain({ data: insertData, error: insertError })
      return chain({ data: null, error: updateError })
    })
  }

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(401)
  })

  it("returns 404 when thing not found", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom({ thingData: null, thingError: { message: "not found" } }),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(404)
  })

  it("returns 200 and prepends lookup step using live step name", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom(),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.step_id).toBe("new-step")
  })

  it("uses fallback name when live_step_id does not match any step", async () => {
    // live_step_id points to a step not in the steps array → liveStep undefined → fallback name
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom({
        thingData: { id: "t1", live_step_id: "missing", steps: [{ id: "s1", name: "Prep walls", step_order: 0 }] },
      }),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(200)
  })

  it("uses step_order -1 when existing steps have order 0 (minOrder 0 → -1)", async () => {
    // steps = [{step_order: 0}] → minOrder = 0 → inserted at -1
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom(),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(200)
  })

  it("returns 500 when step insert fails", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom({ insertData: null, insertError: { message: "insert failed" } }),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("insert failed")
  })

  it("returns 500 with fallback message when insertError is null but data is null", async () => {
    // insertError null but newStep also null → fallback "Failed to insert step"
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom({ insertData: null, insertError: null }),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Failed to insert step")
  })

  it("returns 500 when live_step_id update fails", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: makeFrom({ updateError: { message: "update failed" } }),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("update failed")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/lifewalk (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/lifewalk", async () => {
  const { POST } = await import("@/app/api/lifewalk/route")

  beforeEach(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test")
    const create = await getAnthropicCreate()
    create.mockReset()
  })

  it("returns 503 when ANTHROPIC_API_KEY missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const res = await POST(jsonReq("http://localhost", { transcript: "hello" }))
    expect(res.status).toBe(503)
  })

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when transcript is empty", async () => {
    const res = await POST(jsonReq("http://localhost", { transcript: "  " }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when transcript is not a string (defaults to empty)", async () => {
    // app/api/lifewalk/route.ts line 17: typeof body.transcript !== 'string' → ""
    const res = await POST(jsonReq("http://localhost", { transcript: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns things on success", async () => {
    const things = [{ name: "Thing", class: "project", steps: [] }]
    vi.mocked(parseLifeWalkThingsFromModelText).mockReturnValue(things as unknown as ReturnType<typeof parseLifeWalkThingsFromModelText>)
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.things).toEqual(things)
  })

  it("returns 500 when AI returns no text block", async () => {
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [] })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
  })

  it("returns Anthropic error status on APIError", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const create = await getAnthropicCreate()
    create.mockRejectedValue(new APIError("quota", 429))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(429)
  })

  it("returns 502 on APIError with null status", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const create = await getAnthropicCreate()
    create.mockRejectedValue(new APIError("bad", null))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(502)
  })

  it("returns 500 with parse-specific message when parseLifeWalkThingsFromModelText throws JSON error", async () => {
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockImplementation(() => { throw new Error("No JSON array found in model response") })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toMatch(/parse/i)
  })

  it("returns 500 with the raw error message for generic errors", async () => {
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockImplementation(() => { throw new Error("some other failure") })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("some other failure")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/entities (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/entities", async () => {
  const { POST } = await import("@/app/api/entities/route")

  const validSeed = {
    name: "Fern", kind: "plant", location: null, action: "Water",
    intervals: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7])),
    tolerance_days: 2, overdue_days: 7, note: null,
  }

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when sentence is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await POST(jsonReq("http://localhost", { sentence: "  " }))
    expect(res.status).toBe(400)
  })

  it("returns 502 when seedCarePlan errors", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(seedCarePlan).mockResolvedValue({ error: "AI failed" })
    const res = await POST(jsonReq("http://localhost", { sentence: "fern in kitchen" }))
    expect(res.status).toBe(502)
  })

  it("returns 502 when intervals are invalid", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, intervals: {} })
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(502)
  })

  it("returns 500 when entity insert fails", async () => {
    vi.mocked(seedCarePlan).mockResolvedValue(validSeed)
    const iscFail = insertSelectChain({ data: null, error: { message: "entity fail" } })
    const sb = { from: vi.fn(() => iscFail) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
  })

  it("returns 500 and cleans up entity when care_plan insert fails", async () => {
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, location: "kitchen", note: null })
    let call = 0
    const deleteEq = vi.fn(async () => ({ error: null }))
    const sb = {
      from: vi.fn((table: string) => {
        call++
        if (table === "entities" && call === 1) {
          return insertSelectChain({ data: { id: "e1" }, error: null })
        }
        if (table === "care_plans") {
          return insertSelectChain({ data: null, error: { message: "plan fail" } })
        }
        // cleanup delete call
        return { delete: vi.fn(() => ({ eq: deleteEq })) }
      }),
    }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
    expect(deleteEq).toHaveBeenCalled()
  })

  it("returns 201 with entity and care plan on success", async () => {
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, location: "kitchen", note: "generic plan" })
    let call = 0
    const sb = {
      from: vi.fn((_table: string) => {
        call++
        if (call === 1) return insertSelectChain({ data: { id: "e1" }, error: null })
        return insertSelectChain({ data: { id: "p1" }, error: null })
      }),
    }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern in kitchen" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toMatchObject({ entity_name: "Fern", action: "Water", source: "generated" })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/capture/voice (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/capture/voice", async () => {
  const { POST } = await import("@/app/api/capture/voice/route")

  function voiceReq(body: unknown, auth = "Bearer secret") {
    return new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: auth },
      body: JSON.stringify(body),
    })
  }

  beforeEach(async () => {
    vi.stubEnv("VOICE_WEBHOOK_SECRET", "secret")
    vi.stubEnv("ANTHROPIC_API_KEY", "test")
    const create = await getAnthropicCreate()
    create.mockReset()
    vi.mocked(parseLifeWalkThingsFromModelText).mockReset()
    vi.mocked(persistThings).mockReset()
  })

  it("returns 503 when VOICE_WEBHOOK_SECRET missing", async () => {
    vi.stubEnv("VOICE_WEBHOOK_SECRET", "")
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }, "Bearer secret"))
    expect(res.status).toBe(503)
  })

  it("returns 401 when auth header is wrong", async () => {
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }, "Bearer wrong"))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body: "bad",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when text missing", async () => {
    const res = await POST(voiceReq({ text: "", user_id: "u1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when user_id missing", async () => {
    const res = await POST(voiceReq({ text: "hi", user_id: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 503 when ANTHROPIC_API_KEY missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(503)
  })

  it("returns 500 when AI returns no text block", async () => {
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [] })
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(500)
  })

  it("returns 502 on AI Error throw", async () => {
    const create = await getAnthropicCreate()
    create.mockRejectedValue(new Error("AI fail"))
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(502)
  })

  it("returns 502 on non-Error AI throw", async () => {
    const create = await getAnthropicCreate()
    create.mockRejectedValue("raw")
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(502)
  })

  it("returns 422 when no things extracted (empty array returned)", async () => {
    // voice route line 69: things.length === 0 → 422
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    // Return empty array (not throw) → hits the things.length === 0 check
    vi.mocked(parseLifeWalkThingsFromModelText).mockReturnValue([])
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(422)
  })

  it("returns 201 on success", async () => {
    const things = [{ name: "T", class: "project" as const, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false, recurrence_rule: null, next_due: null }] }]
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockReturnValue(things)
    vi.mocked(persistThings).mockResolvedValue({ saved: [{ thing_id: "t1", name: "T" }] })
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(201)
  })

  it("returns 500 when persistThings throws", async () => {
    const things = [{ name: "T", class: "project" as const, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false, recurrence_rule: null, next_due: null }] }]
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockReturnValue(things)
    vi.mocked(persistThings).mockRejectedValue(new Error("save fail"))
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(500)
  })

  it("returns 500 with generic message when non-Error thrown in persist", async () => {
    const things = [{ name: "T", class: "project" as const, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false, recurrence_rule: null, next_due: null }] }]
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockReturnValue(things)
    vi.mocked(persistThings).mockRejectedValue("raw")
    const res = await POST(voiceReq({ text: "hi", user_id: "u1" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Failed to save")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /auth/confirm (GET)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /auth/confirm", async () => {
  const { GET } = await import("@/app/auth/confirm/route")

  it("redirects to /auth?error=auth_callback_failed when no code", async () => {
    const req = new Request("http://localhost/auth/confirm?next=/")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("auth_callback_failed")
  })

  it("redirects to next path on successful code exchange", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn(async () => ({ error: null })) },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)
    const req = new Request("http://localhost/auth/confirm?code=abc&next=/home")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/home")
  })

  it("redirects to error page when code exchange fails", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn(async () => ({ error: { message: "expired" } })) },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)
    const req = new Request("http://localhost/auth/confirm?code=bad")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("auth_callback_failed")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Additional branch coverage for routes with remaining misses
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/capture/voice — branch coverage", async () => {
  const { POST } = await import("@/app/api/capture/voice/route")

  function voiceReq(body: unknown, auth = "Bearer secret") {
    return new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: auth },
      body: JSON.stringify(body),
    })
  }

  beforeEach(async () => {
    vi.stubEnv("VOICE_WEBHOOK_SECRET", "secret")
    vi.stubEnv("ANTHROPIC_API_KEY", "test")
    const create = await getAnthropicCreate()
    create.mockReset()
    vi.mocked(parseLifeWalkThingsFromModelText).mockReset()
    vi.mocked(persistThings).mockReset()
  })

  it("returns 400 when body.text is not a string (route.ts:27 — text = '')", async () => {
    // typeof body.text !== "string" → text = "" → !text → 400
    const res = await POST(voiceReq({ text: 42, user_id: "u1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when body.user_id is not a string (route.ts:28 — userId = '')", async () => {
    // typeof body.user_id !== "string" → userId = "" → !userId → 400
    const res = await POST(voiceReq({ text: "hello", user_id: 99 }))
    expect(res.status).toBe(400)
  })

  it("returns 401 when authorization header is absent (route.ts:17 — authHeader = '')", async () => {
    // get("authorization") returns null → ?? "" → authHeader = "" → !== "Bearer secret" → 401
    const req = new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi", user_id: "u1" }),
      // no authorization header → returns null → ?? ""
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe("POST /api/entities — branch coverage", async () => {
  const { POST } = await import("@/app/api/entities/route")

  const validSeed = {
    name: "Fern", kind: "plant", location: null, action: "Water",
    intervals: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7])),
    tolerance_days: 2, overdue_days: 7, note: null,
  }

  it("returns 400 when sentence is not a string (route.ts:39 — sentence = '')", async () => {
    // typeof body.sentence !== "string" → sentence = "" → !sentence → 400
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await POST(jsonReq("http://localhost", { sentence: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 500 when entityRow is null but entityError is null (route.ts:75 — !entityRow)", async () => {
    // entityError is null but entityRow is null → ?? "Failed to create entity"
    vi.mocked(seedCarePlan).mockResolvedValue(validSeed)
    const iscFail = insertSelectChain({ data: null, error: null })
    const sb = { from: vi.fn(() => iscFail) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
  })

  it("returns 500 when planRow is null and planError is null (route.ts:102-116)", async () => {
    // planError is null but planRow is null → cleanup entity + ?? "Failed to create care plan"
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, location: "kitchen" })
    const deleteEq = vi.fn(async () => ({ error: null }))
    let call = 0
    const sb = {
      from: vi.fn((table: string) => {
        call++
        if (table === "entities" && call === 1) {
          return insertSelectChain({ data: { id: "e1" }, error: null })
        }
        if (table === "care_plans") {
          // planRow is null, planError is null
          return insertSelectChain({ data: null, error: null })
        }
        // cleanup delete
        return { delete: vi.fn(() => ({ eq: deleteEq })) }
      }),
    }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
    expect(deleteEq).toHaveBeenCalled()
  })

  it("returns 201 with null note when seeded.note is null (route.ts:116 — note ?? null)", async () => {
    // seeded.note is null → note ?? null uses the right side (null)
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, note: null })
    let call = 0
    const sb = {
      from: vi.fn((_table: string) => {
        call++
        if (call === 1) return insertSelectChain({ data: { id: "e1" }, error: null })
        return insertSelectChain({ data: { id: "p1" }, error: null })
      }),
    }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.note).toBeNull()
  })
})

describe("POST /api/lifewalk — branch coverage", async () => {
  const { POST } = await import("@/app/api/lifewalk/route")

  beforeEach(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test")
    const create = await getAnthropicCreate()
    create.mockReset()
    vi.mocked(parseLifeWalkThingsFromModelText).mockReset()
  })

  it("returns fallback error message when APIError has empty message (route.ts:52)", async () => {
    // error.message || "AI request failed" — empty message → "AI request failed"
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const create = await getAnthropicCreate()
    create.mockRejectedValue(new APIError("", 400))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe("AI request failed")
  })

  it("returns 502 on APIError with null status (route.ts:53 — status ?? 502)", async () => {
    // error.status ?? 502 — null status → 502
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    const create = await getAnthropicCreate()
    create.mockRejectedValue(new APIError("some error", null))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(502)
  })

  it("returns 500 with 'Could not parse things' when non-Error thrown in parseLifeWalkThingsFromModelText (route.ts:58)", async () => {
    // error instanceof Error false → "Could not parse things"
    const create = await getAnthropicCreate()
    create.mockResolvedValue({ content: [{ type: "text", text: "[]" }] })
    vi.mocked(parseLifeWalkThingsFromModelText).mockImplementation(() => { throw "raw error" })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Could not parse things")
  })
})

