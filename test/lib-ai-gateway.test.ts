import { describe, expect, it, vi } from "vitest"
import { resolveAiGateway } from "@/lib/ai-gateway"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

// Mock the Anthropic constructor so tests don't make real HTTP calls
vi.mock("@anthropic-ai/sdk", () => {
  function MockAnthropic(this: { apiKey: string }, opts: { apiKey: string }) {
    this.apiKey = opts.apiKey
  }
  return { default: MockAnthropic }
})

function makeSupabase(
  result: { data: { anthropic_api_key: string | null } | null; error: { message: string } | null },
): SupabaseClient<Database> {
  const singleFn = vi.fn(async () => result)
  const eqFn = vi.fn(() => ({ single: singleFn }))
  const selectFn = vi.fn(() => ({ eq: eqFn }))
  return {
    from: vi.fn(() => ({ select: selectFn })),
  } as unknown as SupabaseClient<Database>
}

describe("resolveAiGateway", () => {
  it("returns an error when the profile query fails", async () => {
    const supabase = makeSupabase({ data: null, error: { message: "db error" } })
    const result = await resolveAiGateway(supabase, "u1")
    expect(result.client).toBeNull()
    expect(result.error).toBe("Could not retrieve AI configuration.")
  })

  it("returns an error when anthropic_api_key is null", async () => {
    const supabase = makeSupabase({ data: { anthropic_api_key: null }, error: null })
    const result = await resolveAiGateway(supabase, "u1")
    expect(result.client).toBeNull()
    expect(result.error).toContain("No Anthropic API key")
  })

  it("returns an error when anthropic_api_key is an empty string", async () => {
    const supabase = makeSupabase({ data: { anthropic_api_key: "  " }, error: null })
    const result = await resolveAiGateway(supabase, "u1")
    expect(result.client).toBeNull()
    expect(result.error).toContain("No Anthropic API key")
  })

  it("returns a client when a valid key is present", async () => {
    const supabase = makeSupabase({ data: { anthropic_api_key: "sk-ant-test" }, error: null })
    const result = await resolveAiGateway(supabase, "u1")
    expect(result.error).toBeNull()
    expect(result.client).not.toBeNull()
  })
})
