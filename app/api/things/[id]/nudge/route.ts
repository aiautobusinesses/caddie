import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { nudgeStep, ServiceError, type NudgeDirection } from "@/lib/things-service"

type RouteContext = { params: Promise<{ id: string }> }

// Body: { direction: "back" | "forward" }
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  let direction: NudgeDirection
  try {
    const body = await req.json()
    if (body.direction !== "back" && body.direction !== "forward") {
      return NextResponse.json({ error: "direction must be 'back' or 'forward'" }, { status: 400 })
    }
    direction = body.direction as NudgeDirection
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await nudgeStep(supabase, id, user.id, direction)
    return NextResponse.json(result)
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status })
  }
}
