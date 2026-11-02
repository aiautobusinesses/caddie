import type { CareGroupOffer, InProgressThing, OfferItem, BuyingClusterOffer } from "@/lib/offer"

export type Screen = "offer" | "focus" | "familiarity" | "settings" | "stop_note" | "reflect"

export type OfferCardProps = {
  initialOffer: OfferItem[]
  initialInProgress: InProgressThing | null
  initialCareGroup: CareGroupOffer | null
  initialBuyingCluster?: BuyingClusterOffer | null
}
