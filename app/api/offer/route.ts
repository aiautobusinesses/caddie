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

  return NextResponse.json({
    in_progress: offerState.inProgress,
    offer: offerState.offer,
    care_group: offerState.careGroup,
  })
}
