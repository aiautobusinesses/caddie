import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { persistThings } from "@/lib/thing-persistence"
import type { LifeWalkExtractedThing } from "@/lib/tasks"

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let things: LifeWalkExtractedThing[]
  try {
    const body = await request.json()
    things = Array.isArray(body.things) ? body.things : []
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (things.length === 0) {
    return NextResponse.json({ error: "No things provided" }, { status: 400 })
  }

  try {
    const result = await persistThings(auth.supabase, things, { source: "life_walk", userId: auth.user.id })
    return NextResponse.json({ saved: result.saved }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 })
  }
}
