import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { computeNextDueAt, parseIntervals } from "@/lib/care"

/**
 * POST /api/care-groups/report
 *
 * Body: {
 *   plan_ids: string[]   — all plan ids in the group
 *   done_ids: string[]   — ids the user ticked
 * }
 *
 * - done_ids  → care_events type 'done', last_done_at set, next_due_at recomputed
 * - not-done  → care_events type 'not_done', stays due
 * - Records the care offer date in profiles.last_care_offer_date so the
 *   once-daily cap is respected.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { supabase, user } = auth

  let planIds: string[]
  let doneIds: string[]
  try {
    const body = await req.json()
    planIds = Array.isArray(body.plan_ids) ? (body.plan_ids as string[]) : []
    doneIds = Array.isArray(body.done_ids) ? (body.done_ids as string[]) : []
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (planIds.length === 0) {
    return NextResponse.json({ error: "No plan_ids provided" }, { status: 400 })
  }

  // Fetch the plans so we can recompute next_due_at
  const { data: plans, error: fetchError } = await supabase
    .from("care_plans")
    .select("id, intervals")
    .in("id", planIds)
    .eq("user_id", user.id)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const planMap = new Map<string, { intervals: unknown }>()
  for (const p of plans ?? []) {
    planMap.set(p.id, { intervals: p.intervals })
  }

  const now = new Date().toISOString()
  const today = now.split("T")[0]
  const doneSet = new Set(doneIds)

  // Process each plan
  for (const planId of planIds) {
    const isDone = doneSet.has(planId)
    const plan = planMap.get(planId)

    if (isDone && plan) {
      const intervals = parseIntervals(plan.intervals)
      const nextDueAt = intervals ? computeNextDueAt(now, intervals) : null

      await supabase
        .from("care_plans")
        .update({
          last_done_at: now,
          ...(nextDueAt ? { next_due_at: nextDueAt } : {}),
        })
        .eq("id", planId)
        .eq("user_id", user.id)

      await supabase.from("care_events").insert({
        care_plan_id: planId,
        user_id: user.id,
        type: "done",
      })
    } else {
      // not_done — stays due, ages normally
      await supabase.from("care_events").insert({
        care_plan_id: planId,
        user_id: user.id,
        type: "not_done",
      })
    }
  }

  // Record that care was offered today (once-daily cap)
  await supabase
    .from("profiles")
    .update({ last_care_offer_date: today })
    .eq("id", user.id)

  return NextResponse.json({ ok: true })
}
