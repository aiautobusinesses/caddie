import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { acceptInvite } from "@/lib/invites"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
  }

  const supabase = await createClient()
  const { error, data } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
  }

  const { user } = data.session

  // Attempt to accept a pending invite — no-op if there is none or it was
  // already accepted. This promotes the user's account_tier as appropriate.
  await acceptInvite(supabase, user.id, user.email)

  return NextResponse.redirect(`${origin}${next}`)
}
