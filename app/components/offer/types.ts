import type { CareGroupOffer, InProgressThing, OfferItem } from "@/lib/offer"

export type Screen = "offer" | "focus" | "settings"

export type OfferCardProps = {
  initialOffer: OfferItem[]
  initialInProgress: InProgressThing | null
  initialCareGroup: CareGroupOffer | null
}
