import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server-service"
import { resolveAiGateway } from "@/lib/ai-gateway"
import { extractThingsFromNarration } from "@/lib/lifewalk-parse"
import { persistThings } from "@/lib/thing-persistence"
import type { Database } from "@/lib/database.types"

/**
 * POST /api/capture/voice
 *
 * External voice-capture webhook for Advanced integration users.
 * Authentication is via a per-user integration token (stored in
 * user_integrations) supplied as the Authorization bearer value.
 * No user_id is accepted in the request body — the token lookup
 * resolves the owning user server-side.
 */
export async function POST(request: NextRequest) {
  // ── Auth: per-user integration token ──────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient<Database>()

  const { data: integration, error: integrationError } = await supabase
    .from("user_integrations")
    .select("user_id")
    .eq("token", token)
    .single()

  if (integrationError || !integration) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = integration.user_id

  // ── Body ──────────────────────────────────────────────────────────────────
  let text: string
  try {
    const body = await request.json()
    text = typeof body.text === "string" ? body.text.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 })
  }

  // ── Resolve AI gateway for this user ──────────────────────────────────────
  const gateway = await resolveAiGateway(supabase, userId)
  if (gateway.error !== null) {
    return NextResponse.json({ error: gateway.error }, { status: 503 })
  }

  // ── Extract things via Claude ──────────────────────────────────────────────
  let things
  try {
    things = await extractThingsFromNarration(gateway.client, text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (things.length === 0) {
    return NextResponse.json({ error: "No things extracted from text" }, { status: 422 })
  }

  // ── Persist via service role (integration context — no session cookie) ────
  try {
    const result = await persistThings(supabase, things, { source: "voice", userId })
    return NextResponse.json({ saved: result.saved }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 })
  }
}
