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
    // also call getProfile() to cover the data ?? null branch (line 33)
    const loaded = await result!.getProfile()
    expect(loaded).toBeNull()
  })

  it("getProfile() returns cached result on second call", async () => {
    const fakeUser = { id: "u1", email: "test@example.com" }
    const fakeProfile = { id: "u1", timezone: "UTC", onboarding_done: true, account_tier: "standard" as const }
    const fakeClient = makeFakeClient(fakeUser, fakeProfile)

    vi.mocked(createClient).mockResolvedValue(fakeClient as unknown as Awaited<ReturnType<typeof createClient>>)
    const result = await getAuthenticatedContext()

    expect(result).not.toBeNull()
    const first = await result!.getProfile()
    const second = await result!.getProfile()
    // cachedProfile is set after first call — second call must not re-query
    expect(first).toEqual(fakeProfile)
    expect(second).toEqual(fakeProfile)
    // single() should only have been called once (cache hit on second call)
    const singleFn = (fakeClient.from as ReturnType<typeof vi.fn>).mock.results[0]?.value?.select?.mock?.results[0]?.value?.eq?.mock?.results[0]?.value?.single
    if (singleFn) expect(singleFn).toHaveBeenCalledTimes(1)
  })
})
