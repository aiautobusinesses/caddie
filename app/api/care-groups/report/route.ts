import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

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

  const { error } = await supabase.rpc("report_care_group", {
    p_user_id: user.id,
    p_plan_ids: planIds,
    p_done_ids: doneIds,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
