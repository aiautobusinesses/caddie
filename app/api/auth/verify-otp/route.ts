import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { acceptInvite } from "@/lib/invites"

/**
 * POST /api/auth/verify-otp
 * Body: { email: string, token: string }
 *
 * Verifies the one-time code from the sign-in email and sets the session
 * cookies. Unlike the magic link, this works entirely inside the browser/PWA
 * the user is already in, so it isn't affected by links opening elsewhere.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim() : ""
  const token = typeof body?.token === "string" ? body.token.replace(/\s/g, "") : ""

  if (!email || !token) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" })

  if (error || !data.session) {
    return NextResponse.json({ error: "That code is invalid or has expired." }, { status: 401 })
  }

  // Same as /auth/confirm: promote the account tier if there is a pending invite.
  await acceptInvite(supabase, data.session.user.id, data.session.user.email)

  return NextResponse.json({ ok: true })
}
