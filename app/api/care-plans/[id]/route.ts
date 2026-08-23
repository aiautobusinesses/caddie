import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { parseIntervals, computeInitialNextDueAt } from "@/lib/care"
import type { Database } from "@/lib/database.types"

type RouteContext = { params: Promise<{ id: string }> }

type CarePlanUpdate = Database["public"]["Tables"]["care_plans"]["Update"]

/**
 * PATCH /api/care-plans/[id]
 *
 * Editable fields: action, intervals, tolerance_days, overdue_days.
 * Editing any of these sets source = 'user' and never regenerates.
 * next_due_at is recomputed from the new intervals if provided.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Build the update object from allowed fields only
  const update: CarePlanUpdate = {
    source: "user",  // Any edit locks the plan from regeneration
  }

  if (typeof body.action === "string" && body.action.trim()) {
    update.action = body.action.trim()
  }

  if (body.tolerance_days !== undefined) {
    const v = Number(body.tolerance_days)
    if (!isNaN(v) && v >= 0) update.tolerance_days = Math.round(v)
  }

  if (body.overdue_days !== undefined) {
    const v = Number(body.overdue_days)
    if (!isNaN(v) && v >= 0) update.overdue_days = Math.round(v)
  }

  if (body.intervals !== undefined) {
    const parsed = parseIntervals(body.intervals)
    if (!parsed) {
      return NextResponse.json(
        { error: "intervals must be an object mapping month numbers 1–12 to positive day counts" },
        { status: 400 },
      )
    }
    update.intervals = parsed as unknown as import("@/lib/database.types").Json
    // Recompute next_due_at from the new intervals (from today)
    update.next_due_at = computeInitialNextDueAt(parsed)
  }

  // Check something actually changed beyond just setting source
  const keys = Object.keys(update).filter((k) => k !== "source")
  if (keys.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("care_plans")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record plan_edited event
  await supabase.from("care_events").insert({
    care_plan_id: id,
    user_id: user.id,
    type: "plan_edited",
  })

  return NextResponse.json({ ok: true })
}
