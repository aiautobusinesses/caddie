import type { CareGroupOffer, InProgressThing, OfferItem } from "@/lib/offer"

export type Screen = "offer" | "focus" | "familiarity" | "settings" | "stop_note"

export type OfferCardProps = {
  initialOffer: OfferItem[]
  initialInProgress: InProgressThing | null
  initialCareGroup: CareGroupOffer | null
}
