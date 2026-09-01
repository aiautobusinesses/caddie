import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { resolveAiGateway } from "@/lib/ai-gateway"
import { seedCarePlan } from "@/lib/seed-care-plan"
import { computeInitialNextDueAt, parseIntervals } from "@/lib/care"
import type { Json } from "@/lib/database.types"

export type CapturedEntity = {
  name: string
  kind: string
  location: string | null
}

export type SeedResponse = {
  entity_id: string
  entity_name: string
  care_plan_id: string
  action: string
  intervals: Record<string, number>
  tolerance_days: number
  overdue_days: number
  source: "generated"
  note: string | null   // e.g. "Unrecognised species — generic plan applied"
}

/**
 * POST /api/entities
 * Body: { sentence: string }
 *
 * Calls the LLM to extract entity + care plan from a sentence like
 * "fiddle-leaf fig in the front room". Saves the entity and plan
 * atomically, then returns the saved ids and plan details so the client
 * can offer the user a chance to edit the plan after capture.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let sentence: string
  try {
    const body = await req.json()
    sentence = typeof body.sentence === "string" ? body.sentence.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!sentence) {
    return NextResponse.json({ error: "No sentence provided" }, { status: 400 })
  }

  const { supabase, user } = auth

  const gateway = await resolveAiGateway(supabase, user.id)
  if (gateway.error !== null) {
    return NextResponse.json({ error: gateway.error }, { status: 503 })
  }

  // Ask LLM to extract entity + generate care plan
  const seeded = await seedCarePlan(sentence, gateway.client)
  if ("error" in seeded) {
    return NextResponse.json({ error: seeded.error }, { status: 502 })
  }

  const intervals = parseIntervals(seeded.intervals)
  if (!intervals) {
    return NextResponse.json({ error: "Generated intervals were invalid" }, { status: 502 })
  }

  const nextDueAt = computeInitialNextDueAt(intervals)

  const { data: rpcResult, error: rpcError } = await supabase.rpc("insert_entity_with_care_plan", {
    p_user_id: user.id,
    p_name: seeded.name,
    p_kind: seeded.kind,
    p_location: seeded.location ?? null,
    p_action: seeded.action,
    p_intervals: intervals as unknown as Json,
    p_tolerance_days: seeded.tolerance_days,
    p_overdue_days: seeded.overdue_days,
    p_next_due_at: nextDueAt,
  })

  if (rpcError || !rpcResult) {
    return NextResponse.json(
      { error: rpcError?.message ?? "Failed to create entity" },
      { status: 500 },
    )
  }

  const { entity_id, plan_id } = rpcResult as { entity_id: string; plan_id: string }

  const response: SeedResponse = {
    entity_id,
    entity_name: seeded.name,
    care_plan_id: plan_id,
    action: seeded.action,
    intervals,
    tolerance_days: seeded.tolerance_days,
    overdue_days: seeded.overdue_days,
    source: "generated",
    note: seeded.note ?? null,
  }

  return NextResponse.json(response, { status: 201 })
}
