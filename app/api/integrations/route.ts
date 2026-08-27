import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import type { AuthenticatedContext } from "@/lib/api/session"

/**
 * Integration management for Advanced users.
 *
 * GET  /api/integrations        — list all integrations for the current user
 * POST /api/integrations        — create a new integration (generates a token)
 * DELETE /api/integrations?id=  — remove an integration by id
 */

const ALLOWED_PROVIDERS = ["home_assistant", "google", "other"] as const

async function requireAdvanced(auth: AuthenticatedContext): Promise<NextResponse | null> {
  const profile = await auth.getProfile()
  if (profile?.account_tier !== "advanced") {
    return NextResponse.json({ error: "Advanced account required" }, { status: 403 })
  }
  return null
}

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const forbidden = await requireAdvanced(auth)
  if (forbidden) return forbidden

  const { data, error } = await auth.supabase
    .from("user_integrations")
    .select("id, provider, token, label, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const masked = (data ?? []).map((row) => ({ ...row, token: "••••••••" }))
  return NextResponse.json({ integrations: masked })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const forbidden = await requireAdvanced(auth)
  if (forbidden) return forbidden

  let provider: string
  let label: string | null
  try {
    const body = await request.json()
    provider = typeof body.provider === "string" ? body.provider.trim() : ""
    label = typeof body.label === "string" ? body.label.trim() || null : null
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 })
  }

  if (!ALLOWED_PROVIDERS.includes(provider as (typeof ALLOWED_PROVIDERS)[number])) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from("user_integrations")
    .insert({ user_id: auth.user.id, provider, label })
    .select("id, provider, token, label, created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const forbidden = await requireAdvanced(auth)
  if (forbidden) return forbidden

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id") ?? ""

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from("user_integrations")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
