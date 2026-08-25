import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { markThingDone, markThingStillGoing, ServiceError } from "@/lib/things-service"

type RouteContext = { params: Promise<{ id: string }> }

// Body: { still_going: boolean }
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  let stillGoing = false
  try {
    const body = await req.json()
    stillGoing = body.still_going === true
  } catch {
    // default to done
  }

  try {
    if (stillGoing) {
      const result = await markThingStillGoing(supabase, id, user.id)
      return NextResponse.json(result)
    }
    const result = await markThingDone(supabase, id, user.id)
    return NextResponse.json(result)
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status })
  }
}
