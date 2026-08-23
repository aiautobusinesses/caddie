import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

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

  if (stillGoing) {
    // Just clear started_at so it won't show return screen next open,
    // but keep the thing in the offer pool
    const { error } = await supabase
      .from("things")
      .update({ started_at: null })
      .eq("id", id)
      .eq("user_id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, still_going: true })
  }

  // Mark done: record event + clear started_at
  const { data: thing, error: fetchError } = await supabase
    .from("things")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !thing) {
    return NextResponse.json({ error: "Thing not found" }, { status: 404 })
  }

  // Find the current live step to record the event against
  const { data: liveStepRow } = await supabase
    .from("things")
    .select("live_step_id")
    .eq("id", id)
    .single()

  const liveStepId = liveStepRow?.live_step_id ?? null
  const now = new Date().toISOString()

  if (liveStepId) {
    // Mark step done + advance live_step_id
    await supabase
      .from("steps")
      .update({ done: true, done_at: now, last_done_at: now })
      .eq("id", liveStepId)

    // Find next undone step
    const { data: nextStep } = await supabase
      .from("steps")
      .select("id")
      .eq("thing_id", id)
      .eq("done", false)
      .neq("id", liveStepId)
      .order("step_order", { ascending: true })
      .limit(1)
      .single()

    const thingComplete = !nextStep

    await supabase
      .from("things")
      .update({
        live_step_id: nextStep?.id ?? null,
        started_at: null,
      })
      .eq("id", id)

    // Record step event
    await supabase.from("step_events").insert({
      step_id: liveStepId,
      thing_id: id,
      user_id: user.id,
      event_type: "done",
      metadata: { source: "thing_done" },
    })

    return NextResponse.json({
      ok: true,
      still_going: false,
      thing_complete: thingComplete,
      thing_name: thingComplete ? thing.name : null,
    })
  } else {
    // No steps — just clear started_at
    await supabase
      .from("things")
      .update({ started_at: null })
      .eq("id", id)
      .eq("user_id", user.id)
  }

  return NextResponse.json({ ok: true, still_going: false })
}
