import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { loadReflections } from "@/lib/reflect"

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = await loadReflections(auth.supabase, auth.user.id)
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load reflections"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
