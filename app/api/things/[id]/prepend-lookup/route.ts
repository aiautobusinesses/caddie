import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Prepends a short/thinking "Look up how to…" step to the front of a thing's
 * step chain and advances live_step_id to that new step.
 *
 * Called when the user answers "No" to the familiarity question on a step
 * flagged needs_know_how = true. The inserted step has step_order -1 so it
 * sorts before the existing chain without renumbering anything.
 */
export async function POST(_req: Request, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  type StepRow = { id: string; name: string; step_order: number }
  type ThingWithSteps = { id: string; live_step_id: string | null; steps: StepRow[] }

  // Fetch the thing and its current live step name
  const { data: thing, error: thingError } = await supabase
    .from("things")
    .select("id, live_step_id, steps!steps_thing_id_fkey(id, name, step_order)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (thingError || !thing) {
    return NextResponse.json({ error: "Thing not found" }, { status: 404 })
  }

  const t = thing as unknown as ThingWithSteps
  const steps = t.steps
  const liveStep = steps.find((s) => s.id === t.live_step_id)
  const lookupName = liveStep ? `Look up how to: ${liveStep.name}` : "Look up how to do this"

  // Insert the lookup step with step_order = (min existing step_order - 1)
  const minOrder = steps.reduce((min, s) => Math.min(min, s.step_order), 0)

  const { data: newStep, error: insertError } = await supabase
    .from("steps")
    .insert({
      thing_id: id,
      user_id: user.id,
      name: lookupName,
      step_order: minOrder - 1,
      band: "short",
      mode: "thinking",
      shape: "clean",
      needs_know_how: false,
      done: false,
    })
    .select("id")
    .single()

  if (insertError || !newStep) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to insert step" }, { status: 500 })
  }

  // Advance live_step_id to the new lookup step
  const { error: updateError } = await supabase
    .from("things")
    .update({ live_step_id: newStep.id })
    .eq("id", id)
    .eq("user_id", user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, step_id: newStep.id })
}
