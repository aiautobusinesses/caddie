import { describe, expect, it, vi } from "vitest"
import { acceptInvite } from "@/lib/invites"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

function makeClient({
  rpcData = null as string | null,
  rpcError = null as { message: string } | null,
}: {
  rpcData?: string | null
  rpcError?: { message: string } | null
} = {}): SupabaseClient<Database> {
  return {
    rpc: vi.fn(async () => ({
      data: rpcData,
      error: rpcError,
    })),
  } as unknown as SupabaseClient<Database>
}

describe("acceptInvite", () => {
  it("returns null when email is empty string", async () => {
    const supabase = makeClient()
    const result = await acceptInvite(supabase, "u1", "")
    expect(result).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("returns null when email is null", async () => {
    const supabase = makeClient()
    const result = await acceptInvite(supabase, "u1", null)
    expect(result).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("returns null when email is undefined", async () => {
    const supabase = makeClient()
    const result = await acceptInvite(supabase, "u1", undefined)
    expect(result).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("returns null when no matching invite is found (rpc returns null)", async () => {
    const supabase = makeClient({ rpcData: null })
    const result = await acceptInvite(supabase, "u1", "test@example.com")
    expect(result).toBeNull()
  })

  it("returns null when rpc returns an error", async () => {
    const supabase = makeClient({ rpcError: { message: "conflict" } })
    const result = await acceptInvite(supabase, "u1", "test@example.com")
    expect(result).toBeNull()
  })

  it("accepts a standard invite and returns the tier", async () => {
    const supabase = makeClient({ rpcData: "standard" })
    const result = await acceptInvite(supabase, "u1", "test@example.com")
    expect(result).toEqual({ account_tier: "standard" })
  })

  it("accepts an advanced invite and returns the tier", async () => {
    const supabase = makeClient({ rpcData: "advanced" })
    const result = await acceptInvite(supabase, "u1", "advanced@example.com")
    expect(result).toEqual({ account_tier: "advanced" })
  })

  it("calls rpc with trimmed email", async () => {
    const supabase = makeClient({ rpcData: "standard" })
    await acceptInvite(supabase, "u1", "  User@Example.COM  ")
    expect(supabase.rpc).toHaveBeenCalledWith("accept_invite", {
      p_user_id: "u1",
      p_email: "User@Example.COM",
    })
  })

  it("calls rpc with correct user_id", async () => {
    const supabase = makeClient({ rpcData: "advanced" })
    await acceptInvite(supabase, "my-user-id", "test@example.com")
    expect(supabase.rpc).toHaveBeenCalledWith("accept_invite", {
      p_user_id: "my-user-id",
      p_email: "test@example.com",
    })
  })
})
