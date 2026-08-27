import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import Anthropic from "@anthropic-ai/sdk"
import { encrypt } from "@/lib/encryption"

/**
 * POST /api/ai-key
 * Body: { key: string }
 *
 * Validates the supplied Anthropic key with a lightweight API call, then
 * stores it against the authenticated user's profile. The key is never
 * returned to the client after this point.
 *
 * DELETE /api/ai-key
 * Removes the stored key for the authenticated user.
 */

async function validateAnthropicKey(key: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey: key })
    await client.models.list(undefined, { signal: AbortSignal.timeout(10_000) })
    return true
  } catch {
    return false
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

  const valid = await validateAnthropicKey(key)
  if (!valid) {
    return NextResponse.json({ error: "The API key is invalid or could not be verified." }, { status: 422 })
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
