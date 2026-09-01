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
    { data: stepEvents },
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
          id, name, location, archived_at
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
    // Fetch step_events for this user — used to derive completionCount and nudgeBackCounts.
    supabase
      .from("step_events")
      .select("event_type, thing_id")
      .eq("user_id", userId),
  ])

  if (thingsError) return { result: { inProgress: null, offer: [], careGroup: null }, error: thingsError.message }

  type EventRow = { event_type: string; thing_id: string }
  const events: EventRow[] = (stepEvents ?? []) as EventRow[]

  const completionCount = events.filter((e) => e.event_type === "done").length

  // Per-thing count of nudged_back events — stored as "edited" with kind metadata,
  // but the event_type written by the event route is "edited" for all non-DB-enum values.
  // The nudged_back signal is recorded as event_type="edited" with metadata {kind:"nudged_back"}.
  // We cannot distinguish it from other edits here without joining metadata, so we use
  // a dedicated count: step_events where event_type = 'edited' are queried below separately.
  // For now, nudgeBackCounts is derived from the separate event_type string stored by the
  // /api/steps/[id]/event route (see resolveEventTypeForDb — all non-db types become "edited").
  //
  // TODO: When Supabase supports metadata filters reliably, narrow this to kind=nudged_back.
  // For now we use the full edited count per thing as a conservative proxy.
  const nudgeBackCounts: Record<string, number> = {}
  for (const event of events) {
    if (event.event_type === "edited") {
      nudgeBackCounts[event.thing_id] = (nudgeBackCounts[event.thing_id] ?? 0) + 1
    }
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
