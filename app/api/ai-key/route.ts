import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { getAuthenticatedContext } from "@/lib/api/session"
import { encrypt } from "@/lib/encryption"

/**
 * POST /api/ai-key
 * Body: { key: string }
 *
 * Verifies the key with a lightweight Anthropic call and stores it encrypted
 * against the user's profile. There is deliberately no format check, since
 * Anthropic's key prefixes change. The key is rejected only
 * when Anthropic explicitly answers 401 (authentication failed). Timeouts,
 * network errors, rate limits, 5xx and permission (403) responses do not say
 * anything about the key itself, so they must not block onboarding — the key
 * is saved and any real problem surfaces on the first AI call.
 *
 * DELETE /api/ai-key
 * Removes the stored key for the authenticated user.
 */

/** True only if Anthropic definitively rejected the key (HTTP 401). */
async function isKeyRejected(key: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0 })
    await client.models.list(undefined, { signal: AbortSignal.timeout(8_000) })
    return false
  } catch (err) {
    return err instanceof Anthropic.APIError && err.status === 401
  }
}

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

  if (await isKeyRejected(key)) {
    return NextResponse.json(
      { error: "Anthropic rejected this API key. Check it and try again." },
      { status: 422 },
    )
  }

  let encrypted: string
  try {
    encrypted = encrypt(key)
  } catch (err) {
    console.error("[ai-key] encryption failed:", err)
    return NextResponse.json(
      { error: "Server encryption is not configured correctly (check ENCRYPTION_KEY)." },
      { status: 500 },
    )
  }

  const { error } = await auth.supabase
    .from("profiles")
    .update({ anthropic_api_key: encrypted })
    .eq("id", auth.user.id)

  if (error) {
    console.error("[ai-key] profile update failed:", error)
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
