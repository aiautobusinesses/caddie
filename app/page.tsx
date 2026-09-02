import { redirect } from "next/navigation"
import OfferCard from "./components/OfferCard"
import { createClient } from "@/lib/supabase/server"
import { loadOfferData } from "@/lib/offer-data"
import ErrorMessage from "./components/ErrorMessage"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth")

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_done, last_care_offer_date, anthropic_api_key")
    .eq("id", user.id)
    .single()

  // Ensure the user has configured their Anthropic key before anything else.
  if (!profile?.anthropic_api_key?.trim()) redirect("/setup")

  if (!profile?.onboarding_done) redirect("/lifewalk")

  const { result: offerState, error } = await loadOfferData(supabase, user.id)
  if (error) return <ErrorMessage message={error} />

  return (
    <OfferCard
      initialOffer={offerState.offer}
      initialInProgress={offerState.inProgress}
      initialCareGroup={offerState.careGroup}
    />
  )
}
