import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET as getReflect } from "@/app/api/reflect/route"
import { GET as getFocus, POST as postFocus, DELETE as deleteFocus } from "@/app/api/focus/route"
import { getAuthenticatedContext } from "@/lib/api/session"

vi.mock("@/lib/api/session", () => ({
  getAuthenticatedContext: vi.fn(),
}))

function jsonReq(url: string, body?: unknown, method = "GET"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe("GET /api/reflect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue(null)
    const res = await getReflect()
    expect(res.status).toBe(401)
  })

  it("returns reflections data on success", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    }

    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      supabase: mockSupabase as any,
      user: { id: "u1" } as any,
    })

    const res = await getReflect()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.groups).toEqual([])
  })
})

describe("/api/focus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET returns active focus from profile", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: { active_focus: { label: "Garage", thing_ids: ["t1"] } },
              error: null,
            })),
          })),
        })),
      })),
    }

    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      supabase: mockSupabase as any,
      user: { id: "u1" } as any,
    })

    const res = await getFocus()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.active_focus).toEqual({ label: "Garage", thing_ids: ["t1"] })
  })

  it("POST sets active focus", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [{ id: "t1", name: "Clean garage workbench", domain: "home" }],
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }

    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      supabase: mockSupabase as any,
      user: { id: "u1" } as any,
    })

    const res = await postFocus(jsonReq("http://localhost/api/focus", { query: "garage" }, "POST"))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.active_focus.label).toBe("garage")
    expect(data.active_focus.thing_ids).toEqual(["t1"])
  })

  it("DELETE clears active focus", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }

    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      supabase: mockSupabase as any,
      user: { id: "u1" } as any,
    })

    const res = await deleteFocus()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })
})
