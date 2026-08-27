import { describe, expect, it, vi } from "vitest"
import { getAuthenticatedContext } from "@/lib/api/session"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"

function makeFakeClient(user: unknown, profileData: unknown = null) {
  const singleFn = vi.fn(async () => ({ data: profileData, error: null }))
  const eqFn = vi.fn(() => ({ single: singleFn }))
  const selectFn = vi.fn(() => ({ eq: eqFn }))
  const fromFn = vi.fn(() => ({ select: selectFn }))

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: fromFn,
  }
}

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

  it("returns context with profile when user is present", async () => {
    const fakeUser = { id: "u1", email: "test@example.com" }
    const fakeProfile = { id: "u1", timezone: "Europe/London", onboarding_done: false, account_tier: "standard" as const }
    const fakeClient = makeFakeClient(fakeUser, fakeProfile)

    vi.mocked(createClient).mockResolvedValue(fakeClient as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()

    expect(result).not.toBeNull()
    expect(result?.user).toBe(fakeUser)
    expect(result?.supabase).toBe(fakeClient)
    // profile is now lazily loaded — use getProfile() to access it
    expect(result?.profile).toBeNull()
    const loaded = await result?.getProfile()
    expect(loaded).toEqual(fakeProfile)
  })

  it("returns context with null profile when profile fetch returns null", async () => {
    const fakeUser = { id: "u1", email: "test@example.com" }
    const fakeClient = makeFakeClient(fakeUser, null)

    vi.mocked(createClient).mockResolvedValue(fakeClient as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()

    expect(result).not.toBeNull()
    expect(result?.profile).toBeNull()
  })
})
