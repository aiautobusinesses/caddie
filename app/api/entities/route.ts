import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { seedCarePlan } from "@/lib/seed-care-plan"
import { computeInitialNextDueAt, parseIntervals } from "@/lib/care"

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
 * "fiddle-leaf fig in the front room". Returns the entity and plan
 * for review before saving.
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

  // Ask LLM to extract entity + generate care plan
  const seeded = await seedCarePlan(sentence)
  if ("error" in seeded) {
    return NextResponse.json({ error: seeded.error }, { status: 502 })
  }

  const intervals = parseIntervals(seeded.intervals)
  if (!intervals) {
    return NextResponse.json({ error: "Generated intervals were invalid" }, { status: 502 })
  }

  // Insert entity
  const { data: entityRow, error: entityError } = await supabase
    .from("entities")
    .insert({
      user_id: user.id,
      name: seeded.name,
      kind: seeded.kind,
      location: seeded.location ?? null,
    })
    .select("id")
    .single()

  if (entityError || !entityRow) {
    return NextResponse.json(
      { error: entityError?.message ?? "Failed to create entity" },
      { status: 500 },
    )
  }

  const nextDueAt = computeInitialNextDueAt(intervals)

  // Insert care plan
  const { data: planRow, error: planError } = await supabase
    .from("care_plans")
    .insert({
      entity_id: entityRow.id,
      user_id: user.id,
      action: seeded.action,
      intervals: intervals as unknown as import("@/lib/database.types").Json,
      tolerance_days: seeded.tolerance_days,
      overdue_days: seeded.overdue_days,
      next_due_at: nextDueAt,
      source: "generated",
    })
    .select("id")
    .single()

  if (planError || !planRow) {
    // Clean up the orphaned entity
    await supabase.from("entities").delete().eq("id", entityRow.id)
    return NextResponse.json(
      { error: planError?.message ?? "Failed to create care plan" },
      { status: 500 },
    )
  }

  const response: SeedResponse = {
    entity_id: entityRow.id,
    entity_name: seeded.name,
    care_plan_id: planRow.id,
    action: seeded.action,
    intervals,
    tolerance_days: seeded.tolerance_days,
    overdue_days: seeded.overdue_days,
    source: "generated",
    note: seeded.note ?? null,
  }

  return NextResponse.json(response, { status: 201 })
}
