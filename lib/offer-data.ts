import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import type { CarePlanRow } from "@/lib/care-grouping"
import { computeOffer } from "@/lib/offer"
import type { OfferComputationResult, OfferThingRow } from "@/lib/offer"

/**
 * Fetches things, care plans, and profile data for a user, then returns
 * the computed offer state.
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
  ] = await Promise.all([
    supabase
      .from("things")
      .select(`
        id, name, class, notify_window, live_step_id, started_at,
        steps!steps_thing_id_fkey (
          id, name, band, mode, shape, needs_know_how, recurrence_rule,
          next_due, last_done_at, step_order, done
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
    supabase
      .from("profiles")
      .select("last_care_offer_date")
      .eq("id", userId)
      .single(),
  ])

  if (thingsError) return { result: { inProgress: null, offer: [], careGroup: null }, error: thingsError.message }

  const result = computeOffer({
    today,
    things: (things ?? []) as OfferThingRow[],
    carePlans: (carePlans ?? []) as CarePlanRow[],
    lastCareOfferDate:
      (profileData as { last_care_offer_date: string | null } | null)?.last_care_offer_date ?? null,
  })

  return { result, error: null }
}
