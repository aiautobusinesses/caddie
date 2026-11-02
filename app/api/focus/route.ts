import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await auth.supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("active_focus" as any)
    .eq("id", auth.user.id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ active_focus: (profile as any)?.active_focus ?? null })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { label?: string; query?: string; thing_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const query = (body.query ?? body.label ?? "").trim()
  if (!query) {
    return NextResponse.json({ error: "Query or label is required" }, { status: 400 })
  }

  let matchedThingIds = body.thing_ids ?? []

  // If thing_ids weren't provided, find matching project things
  if (matchedThingIds.length === 0) {
    const { data: things } = await auth.supabase
      .from("things")
      .select("id, name, domain")
      .eq("user_id", auth.user.id)
      .eq("class", "project")

    const searchLower = query.toLowerCase()
    matchedThingIds = (things ?? [])
      .filter((t) =>
        t.name.toLowerCase().includes(searchLower) ||
        (t.domain && t.domain.toLowerCase().includes(searchLower))
      )
      .map((t) => t.id)
  }

  const focusData = {
    label: query,
    thing_ids: matchedThingIds,
  }

  const { error } = await auth.supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ active_focus: focusData } as any)
    .eq("id", auth.user.id)

  if (error) {
    return NextResponse.json({ error: "Failed to set focus" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, active_focus: focusData })
}

export async function DELETE() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await auth.supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ active_focus: null } as any)
    .eq("id", auth.user.id)

  if (error) {
    return NextResponse.json({ error: "Failed to clear focus" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
