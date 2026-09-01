import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { resolveAiGateway } from "@/lib/ai-gateway"
import { extractFromNarration } from "@/lib/lifewalk-parse"
import { parseIntervals, computeInitialNextDueAt } from "@/lib/care"
import type { Json } from "@/lib/database.types"
import type { LifeWalkExtractedEntity } from "@/lib/tasks"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

// ── Design rule ───────────────────────────────────────────────────────────────
// Entities are facts about the world (the peace lily exists regardless of the
// user's task list) and are saved to the database immediately. Things are
// proposals: they are returned to the client for the review screen and only
// saved when the user confirms. This is why:
//   - cancel on the review screen does not undo entities
//   - this route returns { things, entities } while /api/entities returns full
//     plan details for post-save editing — two paths, deliberately different shapes
// Do not "fix" the asymmetry by deferring entity saves to the review confirm
// step — you will lose the plants.
// ─────────────────────────────────────────────────────────────────────────────

type SaveEntitiesResult = {
  saved: { entity_id: string; name: string }[]
  dropped: number
}

async function saveEntities(
  supabase: SupabaseClient<Database>,
  userId: string,
  entities: LifeWalkExtractedEntity[],
): Promise<SaveEntitiesResult> {
  const saved: { entity_id: string; name: string }[] = []
  let dropped = 0

  for (const entity of entities) {
    const intervals = parseIntervals(entity.intervals)
    if (!intervals) {
      // normalizeEntity already called parseIntervals at parse time, so reaching
      // here is a logic error. Log loudly so it surfaces rather than silently
      // losing an item.
      console.error("[lifewalk] BUG: entity intervals invalid after parse (should be unreachable):", entity.name)
      dropped++
      continue
    }

    const nextDueAt = computeInitialNextDueAt(intervals)
    const { data: rpcResult, error } = await supabase.rpc("insert_entity_with_care_plan", {
      p_user_id: userId,
      p_name: entity.name,
      p_kind: entity.kind,
      p_location: entity.location ?? null,
      p_action: entity.action,
      p_intervals: intervals as unknown as Json,
      p_tolerance_days: entity.tolerance_days,
      p_overdue_days: entity.overdue_days,
      p_next_due_at: nextDueAt,
    })

    if (error) {
      console.error("[lifewalk] entity save error:", entity.name, error.message)
      dropped++
      continue
    }

    if (rpcResult) {
      const { entity_id } = rpcResult as { entity_id: string; plan_id: string }
      saved.push({ entity_id, name: entity.name })
    }
  }

  return { saved, dropped }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let transcript: string
  try {
    const body = await req.json()
    transcript = typeof body.transcript === "string" ? body.transcript : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 })
  }

  const gateway = await resolveAiGateway(auth.supabase, auth.user.id)
  if (gateway.error !== null) {
    return NextResponse.json({ error: gateway.error }, { status: 503 })
  }

  try {
    const { things, entities } = await extractFromNarration(gateway.client, transcript)
    const { saved: savedEntities, dropped } = await saveEntities(auth.supabase, auth.user.id, entities)
    return NextResponse.json({
      things,
      entities: savedEntities,
      ...(dropped > 0 ? { entities_dropped: dropped } : {}),
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message || "AI request failed" },
        { status: error.status ?? 502 },
      )
    }
    const message = error instanceof Error ? error.message : "Could not parse things"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
