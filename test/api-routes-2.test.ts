import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { AuthenticatedContext } from "@/lib/api/session"

// All vi.mock calls must be at module top level
vi.mock("@/lib/api/session", () => ({ getAuthenticatedContext: vi.fn() }))
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn()
  const mockModelsList = vi.fn()
  function MockAnthropic() { return { messages: { create: mockCreate }, models: { list: mockModelsList } } }
  class APIError extends Error {
    status: number | null
    constructor(msg: string, status: number | null = 502) { super(msg); this.status = status }
  }
  MockAnthropic.APIError = APIError
  return { default: MockAnthropic }
})
vi.mock("@/lib/lifewalk-parse", () => ({
  parseLifeWalkResultFromModelText: vi.fn(),
  extractFromNarration: vi.fn(),
}))
vi.mock("@/lib/seed-care-plan", () => ({ seedCarePlan: vi.fn() }))
vi.mock("@/lib/supabase/server-service", () => ({ createClient: vi.fn(() => ({})) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/thing-persistence", () => ({ persistThings: vi.fn() }))
vi.mock("@/lib/invites", () => ({ acceptInvite: vi.fn() }))
vi.mock("@/lib/ai-gateway", () => ({ resolveAiGateway: vi.fn() }))

import { getAuthenticatedContext } from "@/lib/api/session"
import { parseLifeWalkResultFromModelText, extractFromNarration } from "@/lib/lifewalk-parse"
import { seedCarePlan } from "@/lib/seed-care-plan"
import { createClient as createServiceClient } from "@/lib/supabase/server-service"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { persistThings } from "@/lib/thing-persistence"
import { acceptInvite } from "@/lib/invites"
import { resolveAiGateway } from "@/lib/ai-gateway"

async function getAnthropicCreate() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const inst = new (Anthropic as unknown as new () => { messages: { create: ReturnType<typeof vi.fn> } })()
  return inst.messages.create
}

async function getAnthropicModelsList() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const inst = new (Anthropic as unknown as new () => { models: { list: ReturnType<typeof vi.fn> } })()
  return inst.models.list
}

function fakeAuth(supabaseOverrides: Record<string, unknown> = {}): AuthenticatedContext {
  const profile = { id: "u1", account_tier: "standard", anthropic_api_key: null }
  return {
    user: { id: "u1" },
    profile: null,
    getProfile: vi.fn(async () => profile),
    supabase: { from: vi.fn(), ...supabaseOverrides },
  } as unknown as AuthenticatedContext
}

function fakeAdvancedAuth(supabaseOverrides: Record<string, unknown> = {}): AuthenticatedContext {
  const profile = { id: "u1", account_tier: "advanced", anthropic_api_key: "sk-ant-test" }
  return {
    user: { id: "u1" },
    profile: null,
    getProfile: vi.fn(async () => profile),
    supabase: { from: vi.fn(), ...supabaseOverrides },
  } as unknown as AuthenticatedContext
}

function jsonReq(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Helper to make a fake gateway success result
async function fakeGateway(): Promise<import("@/lib/ai-gateway").AiGatewayResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const client = new (Anthropic as unknown as new () => import("@anthropic-ai/sdk").default)()
  return { client, error: null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// /api/things/[id]/prepend-lookup
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/things/[id]/prepend-lookup", async () => {
  const { POST } = await import("@/app/api/things/[id]/prepend-lookup/route")
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(401)
  })

  it("returns 404 when thing not found", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      rpc: vi.fn(async () => ({ data: null, error: { message: "Thing not found" } })),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(404)
  })

  it("returns 200 and returns step_id from rpc", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      rpc: vi.fn(async () => ({ data: { step_id: "new-step" }, error: null })),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.step_id).toBe("new-step")
  })

  it("calls rpc with correct thing_id and user_id", async () => {
    const rpcFn = vi.fn(async () => ({ data: { step_id: "new-step" }, error: null }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      rpc: rpcFn,
    }) as ReturnType<typeof fakeAuth>)
    await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(rpcFn).toHaveBeenCalledWith("prepend_lookup_step", { p_thing_id: "t1", p_user_id: "u1" })
  })

  it("returns 500 when rpc fails with generic error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      rpc: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("insert failed")
  })

  it("returns 500 with fallback message when rpc returns null data and no error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      rpc: vi.fn(async () => ({ data: null, error: null })),
    }) as ReturnType<typeof fakeAuth>)
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx("t1"))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Failed to create lookup step")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/lifewalk (POST)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/lifewalk", async () => {
  const { POST } = await import("@/app/api/lifewalk/route")

  beforeEach(async () => {
    const create = await getAnthropicCreate()
    create.mockReset()
    vi.mocked(extractFromNarration).mockReset()
  })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { transcript: "hello" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON body", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when transcript is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(jsonReq("http://localhost", { transcript: "  " }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when transcript is not a string (defaults to empty)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(jsonReq("http://localhost", { transcript: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 503 when AI gateway returns an error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue({ client: null, error: "No API key configured." })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(503)
  })

  it("returns things and saved entities on success", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const things = [{ name: "Thing", class: "project", steps: [] }]
    vi.mocked(extractFromNarration).mockResolvedValue({
      things: things as unknown as ReturnType<typeof parseLifeWalkResultFromModelText>["things"],
      entities: [],
    })
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.things).toEqual(things)
    expect(data.entities).toEqual([])
  })

  it("saves entities via RPC and returns their ids", async () => {
    const rpcFn = vi.fn(async () => ({ data: { entity_id: "e1", plan_id: "p1" }, error: null }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({ rpc: rpcFn }))
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const entity = {
      name: "Peace lily", kind: "plant", location: "bedroom", action: "Water",
      intervals: { "1": 14, "2": 14, "3": 10, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 10, "10": 14, "11": 14, "12": 14 },
      tolerance_days: 2, overdue_days: 5,
    }
    vi.mocked(extractFromNarration).mockResolvedValue({ things: [], entities: [entity] })
    const res = await POST(jsonReq("http://localhost", { transcript: "water peace lily" }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.entities).toEqual([{ entity_id: "e1", name: "Peace lily" }])
    expect(rpcFn).toHaveBeenCalledWith(
      "insert_entity_with_care_plan",
      expect.objectContaining({ p_name: "Peace lily" }),
    )
  })

  it("returns 500 when AI returns no text block", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    vi.mocked(extractFromNarration).mockRejectedValue(new APIError("unexpected", 500))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
  })

  it("returns Anthropic error status on APIError", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    vi.mocked(extractFromNarration).mockRejectedValue(new APIError("quota", 429))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(429)
  })

  it("returns 502 on APIError with null status", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    vi.mocked(extractFromNarration).mockRejectedValue(new APIError("bad", null))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(502)
  })

  it("returns 500 with parse error message when extraction throws JSON parse error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockRejectedValue(new Error("No JSON object found in model response"))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("No JSON object found in model response")
  })

  it("returns 500 with the raw error message for generic errors", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockRejectedValue(new Error("some other failure"))
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

  beforeEach(() => {
    vi.mocked(resolveAiGateway).mockReset()
  })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when sentence is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(jsonReq("http://localhost", { sentence: "  " }))
    expect(res.status).toBe(400)
  })

  it("returns 503 when AI gateway returns an error", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue({ client: null, error: "No API key configured." })
    const res = await POST(jsonReq("http://localhost", { sentence: "fern in kitchen" }))
    expect(res.status).toBe(503)
  })

  it("returns 502 when seedCarePlan errors", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue({ error: "AI failed" })
    const res = await POST(jsonReq("http://localhost", { sentence: "fern in kitchen" }))
    expect(res.status).toBe(502)
  })

  it("returns 502 when intervals are invalid", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, intervals: {} })
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(502)
  })

  it("returns 500 when rpc fails (entity insert)", async () => {
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue(validSeed)
    const sb = { rpc: vi.fn(async () => ({ data: null, error: { message: "entity fail" } })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb, profile: null } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
  })

  it("returns 201 with entity and care plan on success", async () => {
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, location: "kitchen", note: "generic plan" })
    const sb = { rpc: vi.fn(async () => ({ data: { entity_id: "e1", plan_id: "p1" }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb, profile: null } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern in kitchen" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toMatchObject({ entity_name: "Fern", action: "Water", source: "generated" })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/capture/voice (POST) — integration-token model
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/capture/voice", async () => {
  const { POST } = await import("@/app/api/capture/voice/route")

  function voiceReq(body: unknown, auth = "Bearer valid-token") {
    return new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: auth },
      body: JSON.stringify(body),
    })
  }

  // A service client whose from() resolves the integration token lookup
  function makeServiceClient(userId: string | null = "u1") {
    const singleFn = vi.fn(async () =>
      userId ? { data: { user_id: userId }, error: null } : { data: null, error: { message: "not found" } },
    )
    const eqFn = vi.fn(() => ({ single: singleFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    const fromFn = vi.fn(() => ({ select: selectFn }))
    return { from: fromFn }
  }

  beforeEach(async () => {
    vi.mocked(resolveAiGateway).mockReset()
    vi.mocked(persistThings).mockReset()
    vi.mocked(extractFromNarration).mockReset()
    const create = await getAnthropicCreate()
    create.mockReset()
  })

  it("returns 401 when authorization header is missing", async () => {
    const req = new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    })
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 401 when token is not found in user_integrations", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient(null) as unknown as ReturnType<typeof createServiceClient>)
    const res = await POST(voiceReq({ text: "hi" }, "Bearer unknown-token"))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON body", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const req = new NextRequest("http://localhost/api/capture/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer valid-token" },
      body: "bad",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when text is empty", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(voiceReq({ text: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when text is not a string", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(voiceReq({ text: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 503 when AI gateway has no key for user", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue({ client: null, error: "No API key configured." })
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(503)
  })

  it("returns 502 when extraction throws an Error", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockRejectedValue(new Error("AI fail"))
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(502)
  })

  it("returns 502 on non-Error AI throw", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockRejectedValue("raw")
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(502)
  })

  it("returns 422 when no things or entities extracted", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockResolvedValue({ things: [], entities: [] })
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(422)
  })

  it("returns 201 on success", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const things = [{ name: "T", class: "project" as const, domain: null, due_date: null, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false }] }]
    vi.mocked(extractFromNarration).mockResolvedValue({ things, entities: [] })
    vi.mocked(persistThings).mockResolvedValue({ saved: [{ thing_id: "t1", name: "T" }] })
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(201)
  })

  it("returns 500 when persistThings throws", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const things = [{ name: "T", class: "project" as const, domain: null, due_date: null, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false }] }]
    vi.mocked(extractFromNarration).mockResolvedValue({ things, entities: [] })
    vi.mocked(persistThings).mockRejectedValue(new Error("save fail"))
    const res = await POST(voiceReq({ text: "hi" }))
    expect(res.status).toBe(500)
  })

  it("returns 500 with generic message when non-Error thrown in persist", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const things = [{ name: "T", class: "project" as const, domain: null, due_date: null, notify_window: null, notify_time_of_day: null, notify_escalate: false, steps: [{ name: "S", band: "short" as const, mode: "doing" as const, shape: "clean" as const, needs_know_how: false }] }]
    vi.mocked(extractFromNarration).mockResolvedValue({ things, entities: [] })
    vi.mocked(persistThings).mockRejectedValue("raw")
    const res = await POST(voiceReq({ text: "hi" }))
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

  beforeEach(() => {
    vi.mocked(acceptInvite).mockReset()
  })

  it("redirects to /auth?error=auth_callback_failed when no code", async () => {
    const req = new Request("http://localhost/auth/confirm?next=/")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("auth_callback_failed")
  })

  it("redirects to next path on successful code exchange and calls acceptInvite", async () => {
    const fakeUser = { id: "u1", email: "user@example.com" }
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          error: null,
          data: { session: { user: fakeUser }, user: fakeUser },
        })),
      },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)
    vi.mocked(acceptInvite).mockResolvedValue(null)

    const req = new Request("http://localhost/auth/confirm?code=abc&next=/home")
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/home")
    expect(vi.mocked(acceptInvite)).toHaveBeenCalledWith(expect.anything(), "u1", "user@example.com")
  })

  it("redirects to error page when code exchange fails", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ error: { message: "expired" }, data: { session: null } })),
      },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)

    const req = new Request("http://localhost/auth/confirm?code=bad")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("auth_callback_failed")
  })

  it("redirects to error page when session is null after exchange", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ error: null, data: { session: null } })),
      },
    } as unknown as Awaited<ReturnType<typeof createServerClient>>)

    const req = new Request("http://localhost/auth/confirm?code=abc")
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("auth_callback_failed")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage — entities
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/entities — branch coverage", async () => {
  const { POST } = await import("@/app/api/entities/route")

  const validSeed = {
    name: "Fern", kind: "plant", location: null, action: "Water",
    intervals: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 7])),
    tolerance_days: 2, overdue_days: 7, note: null,
  }

  beforeEach(() => {
    vi.mocked(resolveAiGateway).mockReset()
  })

  it("returns 400 when sentence is not a string (defaults to '')", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const res = await POST(jsonReq("http://localhost", { sentence: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 500 when rpc returns null data and no error", async () => {
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue(validSeed)
    const sb = { rpc: vi.fn(async () => ({ data: null, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb, profile: null } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(500)
  })

  it("returns 201 with null note when seeded.note is null", async () => {
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(seedCarePlan).mockResolvedValue({ ...validSeed, note: null })
    const sb = { rpc: vi.fn(async () => ({ data: { entity_id: "e1", plan_id: "p1" }, error: null })) }
    vi.mocked(getAuthenticatedContext).mockResolvedValue({ user: { id: "u1" }, supabase: sb, profile: null } as unknown as ReturnType<typeof fakeAuth>)
    const res = await POST(jsonReq("http://localhost", { sentence: "fern" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.note).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage — lifewalk
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/lifewalk — branch coverage", async () => {
  const { POST } = await import("@/app/api/lifewalk/route")

  beforeEach(() => {
    vi.mocked(resolveAiGateway).mockReset()
    vi.mocked(extractFromNarration).mockReset()
  })

  it("returns fallback error message when APIError has empty message", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const APIError = (Anthropic as unknown as any).APIError
    vi.mocked(extractFromNarration).mockRejectedValue(new APIError("", 400))
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe("AI request failed")
  })

  it("returns 500 with 'Could not parse things' when non-Error thrown in extraction", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    vi.mocked(resolveAiGateway).mockResolvedValue(await fakeGateway())
    vi.mocked(extractFromNarration).mockRejectedValue("raw error")
    const res = await POST(jsonReq("http://localhost", { transcript: "do stuff" }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe("Could not parse things")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/account (GET)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/account", async () => {
  const { GET } = await import("@/app/api/account/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 500 when profile query fails", async () => {
    const singleFn = vi.fn(async () => ({ data: null, error: { message: "db error" } }))
    const eqFn = vi.fn(() => ({ single: singleFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it("returns account state with ai_configured false when key is null", async () => {
    const singleFn = vi.fn(async () => ({ data: { account_tier: "standard", anthropic_api_key: null }, error: null }))
    const eqFn = vi.fn(() => ({ single: singleFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ai_configured).toBe(false)
    expect(data.account_tier).toBe("standard")
  })

  it("returns account state with ai_configured true when key is set", async () => {
    const singleFn = vi.fn(async () => ({ data: { account_tier: "advanced", anthropic_api_key: "sk-ant-test" }, error: null }))
    const eqFn = vi.fn(() => ({ single: singleFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ai_configured).toBe(true)
    expect(data.account_tier).toBe("advanced")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/ai-key (POST + DELETE)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/ai-key", async () => {
  const { POST } = await import("@/app/api/ai-key/route")

  beforeEach(async () => {
    const modelsList = await getAnthropicModelsList()
    modelsList.mockReset()
  })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { key: "sk-ant-test" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when key is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await POST(jsonReq("http://localhost", { key: "  " }))
    expect(res.status).toBe(400)
  })

  it("returns 422 when Anthropic key validation fails", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const modelsList = await getAnthropicModelsList()
    modelsList.mockRejectedValue(new Error("invalid key"))
    const res = await POST(jsonReq("http://localhost", { key: "sk-ant-bad" }))
    expect(res.status).toBe(422)
  })

  it("returns 500 when profile update fails", async () => {
    const eqFn = vi.fn(async () => ({ error: { message: "db error" } }))
    const updateFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ update: updateFn })),
    }))
    const modelsList = await getAnthropicModelsList()
    modelsList.mockResolvedValue({})
    const res = await POST(jsonReq("http://localhost", { key: "sk-ant-valid" }))
    expect(res.status).toBe(500)
  })

  it("returns 200 when key is saved successfully", async () => {
    const eqFn = vi.fn(async () => ({ error: null }))
    const updateFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ update: updateFn })),
    }))
    const modelsList = await getAnthropicModelsList()
    modelsList.mockResolvedValue({})
    const res = await POST(jsonReq("http://localhost", { key: "sk-ant-valid" }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})

describe("DELETE /api/ai-key", async () => {
  const { DELETE } = await import("@/app/api/ai-key/route")

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it("returns 500 when profile update fails", async () => {
    const eqFn = vi.fn(async () => ({ error: { message: "db error" } }))
    const updateFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ update: updateFn })),
    }))
    const res = await DELETE()
    expect(res.status).toBe(500)
  })

  it("returns 200 when key is removed successfully", async () => {
    const eqFn = vi.fn(async () => ({ error: null }))
    const updateFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth({
      from: vi.fn(() => ({ update: updateFn })),
    }))
    const res = await DELETE()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// /api/integrations (GET + POST + DELETE)
// ═══════════════════════════════════════════════════════════════════════════════

describe("/api/integrations", async () => {
  const { GET, POST, DELETE } = await import("@/app/api/integrations/route")

  it("GET returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("GET returns 403 when account_tier is standard", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("GET returns 500 when query fails", async () => {
    const orderFn = vi.fn(async () => ({ data: null, error: { message: "db" } }))
    const eqFn = vi.fn(() => ({ order: orderFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it("GET returns integrations list for advanced user", async () => {
    const fakeIntegrations = [{ id: "i1", provider: "home_assistant", token: "tok", label: null, created_at: "" }]
    const orderFn = vi.fn(async () => ({ data: fakeIntegrations, error: null }))
    const eqFn = vi.fn(() => ({ order: orderFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    // Token is masked server-side; verify structure and masking
    expect(data.integrations).toEqual([{ ...fakeIntegrations[0], token: "••••••••" }])
  })

  it("GET returns empty array when data is null", async () => {
    const orderFn = vi.fn(async () => ({ data: null, error: null }))
    const eqFn = vi.fn(() => ({ order: orderFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ select: selectFn })),
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.integrations).toEqual([])
  })

  it("POST returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await POST(jsonReq("http://localhost", { provider: "home_assistant" }))
    expect(res.status).toBe(401)
  })

  it("POST returns 403 when account_tier is standard", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await POST(jsonReq("http://localhost", { provider: "home_assistant" }))
    expect(res.status).toBe(403)
  })

  it("POST returns 400 on invalid JSON", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth())
    const req = new NextRequest("http://localhost", { method: "POST", body: "bad" })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("POST returns 400 when provider is empty", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth())
    const res = await POST(jsonReq("http://localhost", { provider: "" }))
    expect(res.status).toBe(400)
  })

  it("POST returns 500 when insert fails", async () => {
    const singleFn = vi.fn(async () => ({ data: null, error: { message: "db" } }))
    const selectFn = vi.fn(() => ({ single: singleFn }))
    const insertFn = vi.fn(() => ({ select: selectFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ insert: insertFn })),
    }))
    const res = await POST(jsonReq("http://localhost", { provider: "home_assistant" }))
    expect(res.status).toBe(500)
  })

  it("POST returns 201 with new integration for advanced user", async () => {
    const newIntegration = { id: "i1", provider: "home_assistant", token: "tok123", label: "My HA", created_at: "" }
    const singleFn = vi.fn(async () => ({ data: newIntegration, error: null }))
    const selectFn = vi.fn(() => ({ single: singleFn }))
    const insertFn = vi.fn(() => ({ select: selectFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ insert: insertFn })),
    }))
    const res = await POST(jsonReq("http://localhost", { provider: "home_assistant", label: "My HA" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toEqual(newIntegration)
  })

  it("POST sets label to null when not a string", async () => {
    const newIntegration = { id: "i1", provider: "google", token: "tok", label: null, created_at: "" }
    const singleFn = vi.fn(async () => ({ data: newIntegration, error: null }))
    const selectFn = vi.fn(() => ({ single: singleFn }))
    const insertFn = vi.fn(() => ({ select: selectFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ insert: insertFn })),
    }))
    const res = await POST(jsonReq("http://localhost", { provider: "google" }))
    expect(res.status).toBe(201)
  })

  it("DELETE returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const req = new NextRequest("http://localhost/api/integrations?id=i1", { method: "DELETE" })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it("DELETE returns 403 when account_tier is standard", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const req = new NextRequest("http://localhost/api/integrations?id=i1", { method: "DELETE" })
    const res = await DELETE(req)
    expect(res.status).toBe(403)
  })

  it("DELETE returns 400 when id is missing", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth())
    const req = new NextRequest("http://localhost/api/integrations", { method: "DELETE" })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it("DELETE returns 500 when delete fails", async () => {
    const eqUserFn = vi.fn(async () => ({ error: { message: "db" } }))
    const eqIdFn = vi.fn(() => ({ eq: eqUserFn }))
    const deleteFn = vi.fn(() => ({ eq: eqIdFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ delete: deleteFn })),
    }))
    const req = new NextRequest("http://localhost/api/integrations?id=i1", { method: "DELETE" })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })

  it("DELETE returns 200 on success", async () => {
    const eqUserFn = vi.fn(async () => ({ error: null }))
    const eqIdFn = vi.fn(() => ({ eq: eqUserFn }))
    const deleteFn = vi.fn(() => ({ eq: eqIdFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ delete: deleteFn })),
    }))
    const req = new NextRequest("http://localhost/api/integrations?id=i1", { method: "DELETE" })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage — ai-key POST (non-string key body)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/ai-key — branch coverage", async () => {
  const { POST } = await import("@/app/api/ai-key/route")

  beforeEach(async () => {
    const modelsList = await getAnthropicModelsList()
    modelsList.mockReset()
  })

  it("returns 400 when key is not a string (body.key is a number → '' → !key)", async () => {
    // typeof body.key !== "string" → key = "" → !key → 400
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAuth())
    const res = await POST(jsonReq("http://localhost", { key: 42 }))
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage — integrations POST (non-string provider/label)
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/integrations — branch coverage", async () => {
  const { POST } = await import("@/app/api/integrations/route")

  it("returns 400 when provider is not a string (body.provider is a number → '' → !provider)", async () => {
    // typeof body.provider !== "string" → provider = "" → !provider → 400
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth())
    const res = await POST(jsonReq("http://localhost", { provider: 99 }))
    expect(res.status).toBe(400)
  })

  it("sets label to null when label is an empty string (body.label.trim() || null → null)", async () => {
    // body.label.trim() === "" → "" || null → null
    const newIntegration = { id: "i1", provider: "home_assistant", token: "tok", label: null, created_at: "" }
    const singleFn = vi.fn(async () => ({ data: newIntegration, error: null }))
    const selectFn = vi.fn(() => ({ single: singleFn }))
    const insertFn = vi.fn(() => ({ select: selectFn }))
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth({
      from: vi.fn(() => ({ insert: insertFn })),
    }))
    const res = await POST(jsonReq("http://localhost", { provider: "home_assistant", label: "  " }))
    expect(res.status).toBe(201)
  })

  it("returns 400 when provider is not in the allowed list", async () => {
    // ALLOWED_PROVIDERS.includes() → false → 400 Invalid provider
    vi.mocked(getAuthenticatedContext).mockResolvedValue(fakeAdvancedAuth())
    const res = await POST(jsonReq("http://localhost", { provider: "unknown_provider" }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe("Invalid provider")
  })
})
