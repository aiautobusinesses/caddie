import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { acceptInvite } from "@/lib/invites"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as "email" | "magiclink" | "recovery" | null
  const next = searchParams.get("next") ?? "/"

  const supabase = await createClient()
  let user = null

  if (tokenHash && type) {
    // Token-hash flow: works cross-device (no PKCE cookie required).
    const { error, data } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error || !data.session) {
      return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
    }
    user = data.session.user
  } else if (code) {
    // PKCE flow: requires the same browser that requested the magic link.
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
    }
    user = data.session.user
  } else {
    return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
  }

  // Attempt to accept a pending invite — no-op if there is none or it was
  // already accepted. This promotes the user's account_tier as appropriate.
  await acceptInvite(supabase, user.id, user.email)

  return NextResponse.redirect(`${origin}${next}`)
}
