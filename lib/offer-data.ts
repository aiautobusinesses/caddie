import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import type { CarePlanRow } from "@/lib/care-grouping"
import { computeOffer } from "@/lib/offer"
import type { OfferComputationResult, OfferThingRow } from "@/lib/offer"

/**
 * Fetches things, care plans, profile data, completion count, and per-thing
 * nudge-back counts for a user, then returns the computed offer state.
 *
 * Used by both the SSR home page and the /api/offer route to avoid
 * duplicating the Supabase queries.
 */
export async function loadOfferData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ result: OfferComputationResult; error: string | null }> {
  const today = new Date().toISOString().split("T")[0]

  const [
    { data: things, error: thingsError },
    { data: carePlans },
    { data: profileData },
    // Two targeted event queries replace the previous full-table scan.
    // completionCount: count of done events (tenure gate).
    { data: doneEvents },
    // nudgeBackCounts: per-thing count of nudged_back events (degradation gate).
    { data: nudgedBackEvents },
  ] = await Promise.all([
    supabase
      .from("things")
      .select(`
        id, name, class, domain, due_date, notify_window, live_step_id, started_at,
        steps!steps_thing_id_fkey (
          id, name, band, mode, shape, needs_know_how, step_order, done
        )
      `)
      .eq("user_id", userId),
    supabase
      .from("care_plans")
      .select(`
        id, entity_id, action, intervals, tolerance_days, overdue_days,
        last_done_at, next_due_at, archived_at,
        entities!care_plans_entity_id_fkey (
          id, name, kind, location, archived_at
        )
      `)
      .eq("user_id", userId)
      .is("archived_at", null),
      // Note: plans whose entities are archived are filtered client-side in care-grouping.ts
      // (!p.entities.archived_at). Filtering on joined columns server-side is not reliably
      // supported in this version of the Supabase JS client, so we accept the minor
      // inefficiency of fetching those rows and discarding them.
    supabase
      .from("profiles")
      .select("last_care_offer_date")
      .eq("id", userId)
      .single(),
    supabase
      .from("step_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "done"),
    supabase
      .from("step_events")
      .select("thing_id")
      .eq("user_id", userId)
      .eq("event_type", "nudged_back"),
  ])

  if (thingsError) return { result: { inProgress: null, offer: [], careGroup: null }, error: thingsError.message }

  const completionCount = (doneEvents ?? []).length

  const nudgeBackCounts: Record<string, number> = {}
  for (const event of (nudgedBackEvents ?? []) as { thing_id: string }[]) {
    nudgeBackCounts[event.thing_id] = (nudgeBackCounts[event.thing_id] ?? 0) + 1
  }

  const result = computeOffer({
    today,
    things: (things ?? []) as unknown as OfferThingRow[],
    carePlans: (carePlans ?? []) as unknown as CarePlanRow[],
    lastCareOfferDate:
      (profileData as { last_care_offer_date: string | null } | null)?.last_care_offer_date ?? null,
    completionCount,
    nudgeBackCounts,
  })

  return { result, error: null }
}
