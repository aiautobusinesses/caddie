import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { parseRecurrenceRule, calculateNextDue } from "@/lib/recurrence"
import { isStepEventInput, resolveEventTypeForDb } from "@/lib/tasks"
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

  if (!isStepEventInput(body.event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 })
  }

  // Fetch step + its thing
  const { data: stepRaw, error: stepError } = await supabase
    .from("steps")
    .select("id, thing_id, recurrence_rule, next_due, step_order")
    .eq("id", stepId)
    .eq("user_id", user.id)
    .single()

  if (stepError || !stepRaw) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 })
  }

  const step = stepRaw as {
    id: string
    thing_id: string
    recurrence_rule: unknown
    next_due: string | null
    step_order: number
  }

  const dbEventType = resolveEventTypeForDb(body.event_type)
  const metadata =
    body.event_type === "why"
      ? ({ ...(typeof body.metadata === "object" && body.metadata && !Array.isArray(body.metadata) ? body.metadata : {}), kind: "why" } as Json)
      : (body.metadata ?? null)

  // Record event
  const { error: eventError } = await supabase
    .from("step_events")
    .insert({
      step_id: stepId,
      thing_id: step.thing_id,
      user_id: user.id,
      event_type: dbEventType,
      metadata,
    })

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 })
  }

  // Apply side effects for "done"
  if (body.event_type === "done") {
    const now = new Date().toISOString()
    const rule = step.recurrence_rule ? parseRecurrenceRule(step.recurrence_rule) : null

    if (rule) {
      // Recurring step — reset next_due and last_done_at, stay undone
      const nextDue = calculateNextDue(rule, now, step.next_due ?? null)
      const { error } = await supabase
        .from("steps")
        .update({ last_done_at: now, next_due: nextDue })
        .eq("id", stepId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Non-recurring step — mark done
      const { error } = await supabase
        .from("steps")
        .update({ done: true, done_at: now, last_done_at: now })
        .eq("id", stepId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Advance live_step_id on the thing to the next undone step
      const { data: nextStep } = await supabase
        .from("steps")
        .select("id")
        .eq("thing_id", step.thing_id)
        .eq("done", false)
        .neq("id", stepId)
        .order("step_order", { ascending: true })
        .limit(1)
        .single()

      const nextStepId = nextStep?.id ?? null

      const { error: thingError } = await supabase
        .from("things")
        .update({ live_step_id: nextStepId })
        .eq("id", step.thing_id)

      if (thingError) return NextResponse.json({ error: thingError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
