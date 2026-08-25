import { describe, expect, it, vi } from "vitest"
import { getAuthenticatedContext } from "@/lib/api/session"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"

describe("getAuthenticatedContext", () => {
  it("returns null when getUser returns an error", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "auth error" } }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()
    expect(result).toBeNull()
  })

  it("returns null when user is null", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()
    expect(result).toBeNull()
  })

  it("returns context when user is present", async () => {
    const fakeUser = { id: "u1", email: "test@example.com" }
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }) },
    }
    vi.mocked(createClient).mockResolvedValue(fakeClient as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()
    expect(result).not.toBeNull()
    expect(result?.user).toBe(fakeUser)
    expect(result?.supabase).toBe(fakeClient)
  })
})
