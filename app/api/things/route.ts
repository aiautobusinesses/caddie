import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { parseRecurrenceRule } from "@/lib/recurrence"
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

  const { supabase, user } = auth
  const saved: { thing_id: string; name: string }[] = []

  for (const thing of things) {
    if (!thing.name?.trim() || !Array.isArray(thing.steps) || thing.steps.length === 0) {
      continue
    }

    // Insert thing without live_step_id first (circular FK — add after steps)
    const { data: thingRow, error: thingError } = await supabase
      .from("things")
      .insert({
        user_id: user.id,
        name: thing.name.trim(),
        class: thing.class ?? "project",
        notify_window: thing.notify_window ?? null,
        notify_time_of_day: thing.notify_time_of_day ?? null,
        notify_escalate: thing.notify_escalate ?? false,
        source: "life_walk",
      })
      .select("id")
      .single()

    if (thingError || !thingRow) {
      return NextResponse.json(
        { error: thingError?.message ?? "Failed to insert thing" },
        { status: 500 },
      )
    }

    const thingId = thingRow.id

    // Insert steps in order
    const stepInserts = thing.steps.map((step, idx) => ({
      thing_id: thingId,
      user_id: user.id,
      name: step.name.trim(),
      step_order: idx,
      ends_cleanly: step.ends_cleanly ?? true,
      estimated_minutes: step.estimated_minutes ?? null,
      recurrence_rule: step.recurrence_rule
        ? (parseRecurrenceRule(step.recurrence_rule) as unknown as import("@/lib/database.types").Json)
        : null,
      next_due: step.next_due ?? null,
      done: false,
    }))

    const { data: stepRows, error: stepsError } = await supabase
      .from("steps")
      .insert(stepInserts)
      .select("id, step_order")

    if (stepsError || !stepRows?.length) {
      // Clean up the orphaned thing
      await supabase.from("things").delete().eq("id", thingId)
      return NextResponse.json(
        { error: stepsError?.message ?? "Failed to insert steps" },
        { status: 500 },
      )
    }

    // Point live_step_id at the first undone step (order 0)
    const firstStep = stepRows.find((s) => s.step_order === 0) ?? stepRows[0]
    const { error: liveStepError } = await supabase
      .from("things")
      .update({ live_step_id: firstStep.id })
      .eq("id", thingId)

    if (liveStepError) {
      return NextResponse.json({ error: liveStepError.message }, { status: 500 })
    }

    saved.push({ thing_id: thingId, name: thing.name.trim() })
  }

  return NextResponse.json({ saved }, { status: 201 })
}
