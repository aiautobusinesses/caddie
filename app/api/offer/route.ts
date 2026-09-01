import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { loadOfferData } from "@/lib/offer-data"
import type { OfferItem, CareGroupOffer, InProgressThing } from "@/lib/offer"

// Re-export so existing imports from this route continue to work.
export type { OfferItem, CareGroupOffer, InProgressThing }

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { result: offerState, error } = await loadOfferData(auth.supabase, auth.user.id)
  if (error) return NextResponse.json({ error }, { status: 500 })

  // Record an `offered` event for each step in the spread.
  // Fire-and-forget: a write failure must never block or break the offer response.
  // These events are the signal source for v2 "never-accepted park" and offer frequency tracking.
  if (offerState.offer.length > 0) {
    const rows = offerState.offer.map((item) => ({
      step_id: item.step_id,
      thing_id: item.thing_id,
      user_id: auth.user.id,
      event_type: "offered" as const,
      metadata: null,
    }))
    void Promise.resolve(auth.supabase.from("step_events").insert(rows)).catch(() => {/* swallow */})
  }

  // Set last_care_offer_date the moment a care group is included in a response.
  // The once-daily cap must hold even if the user dismisses the card without reporting —
  // recording it only at report time (in the report_care_group RPC) means the cap is
  // bypassed whenever the user sees the card but doesn't submit.
  // Fire-and-forget: a write failure must not block the offer response.
  if (offerState.careGroup) {
    const today = new Date().toISOString().split("T")[0]
    void Promise.resolve(
      auth.supabase
        .from("profiles")
        .update({ last_care_offer_date: today })
        .eq("id", auth.user.id)
    ).catch(() => {/* swallow */})
  }

  return NextResponse.json({
    in_progress: offerState.inProgress,
    offer: offerState.offer,
    care_group: offerState.careGroup,
  })
}
