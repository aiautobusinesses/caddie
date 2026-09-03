import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { encrypt } from "@/lib/encryption"

/**
 * POST /api/ai-key
 * Body: { key: string }
 *
 * Validates the key format, then stores it encrypted against the user's
 * profile. Live API validation is intentionally skipped — it can fail for
 * network reasons unrelated to key validity and blocks onboarding. A bad
 * key will surface as an error on the first AI call instead.
 *
 * DELETE /api/ai-key
 * Removes the stored key for the authenticated user.
 */

/** Anthropic keys follow the pattern sk-ant-api03-<base64url chars> */
const ANTHROPIC_KEY_RE = /^sk-ant-api\d{2}-[\w-]{80,}$/

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let key: string
  try {
    const body = await request.json()
    key = typeof body.key === "string" ? body.key.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!key) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 })
  }

  if (!ANTHROPIC_KEY_RE.test(key)) {
    return NextResponse.json(
      { error: "That doesn't look like an Anthropic API key. It should start with sk-ant-api03-." },
      { status: 422 },
    )
  }

  const { error } = await auth.supabase
    .from("profiles")
    .update({ anthropic_api_key: encrypt(key) })
    .eq("id", auth.user.id)

  if (error) {
    return NextResponse.json({ error: "Failed to save API key." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await auth.supabase
    .from("profiles")
    .update({ anthropic_api_key: null })
    .eq("id", auth.user.id)

  if (error) {
    return NextResponse.json({ error: "Failed to remove API key." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
