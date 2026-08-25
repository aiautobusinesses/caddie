import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { recordStepEvent, ServiceError } from "@/lib/things-service"
import type { Json } from "@/lib/database.types"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: stepId } = await context.params
  const { supabase, user } = auth

  let body: { event_type: string; metadata?: Json }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await recordStepEvent(supabase, stepId, user.id, body)
    return NextResponse.json(result)
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status })
  }
}
