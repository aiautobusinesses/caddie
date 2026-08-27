import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

/**
 * GET /api/account
 *
 * Returns a safe summary of the current user's account state for the
 * settings screen. Never includes the raw anthropic_api_key.
 */
export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("account_tier, anthropic_api_key")
    .eq("id", auth.user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Could not load account data." }, { status: 500 })
  }

  return NextResponse.json({
    account_tier: data.account_tier,
    ai_configured: Boolean(data.anthropic_api_key?.trim()),
  })
}
