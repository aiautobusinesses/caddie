import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import OfferCard from "./components/OfferCard"
import type { OfferItem, InProgressThing, CareGroupOffer } from "@/app/api/offer/route"
import { parseRecurrenceRule } from "@/lib/recurrence"
import { buildCareGroup } from "@/lib/care-grouping"
import type { CarePlanRow } from "@/lib/care-grouping"

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_done, last_care_offer_date")
    .eq("id", user.id)
    .single()

  if (!profile?.onboarding_done) redirect("/lifewalk")

  const today = new Date().toISOString().split("T")[0]

  const { data: things } = await supabase
    .from("things")
    .select(`
      id, name, class, notify_window, live_step_id, started_at,
      steps!steps_thing_id_fkey (
        id, name, band, mode, shape, recurrence_rule,
        next_due, last_done_at, step_order, done
      )
    `)
    .eq("user_id", user.id)

  type RawStep = { id: string; name: string; band: "short" | "sitting" | "run"; mode: "thinking" | "doing"; shape: "clean" | "bleeds"; recurrence_rule: unknown; next_due: string | null; last_done_at: string | null; step_order: number; done: boolean }
  type RawThing = { id: string; name: string; class: string; notify_window: number | null; live_step_id: string | null; started_at: string | null; steps: RawStep[] }

  const rows = (things ?? []) as RawThing[]

  const msPerDay = 24 * 60 * 60 * 1000
  const daysBetween = (a: string, b: string) =>
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay)

  function buildReason(thing: RawThing, step: RawStep | undefined): string | null {
    if (thing.class === "obligation" && step?.next_due) {
      const days = daysBetween(today, step.next_due)
      if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
      if (days === 0) return "due today"
      if (days === 1) return "due tomorrow"
      return `due in ${days} days`
    }
    if (step?.recurrence_rule && step.last_done_at) {
      const rule = parseRecurrenceRule(step.recurrence_rule)
      if (rule) {
        const daysSince = daysBetween(step.last_done_at.split("T")[0], today)
        if (daysSince > 0) return `last done ${daysSince} day${daysSince === 1 ? "" : "s"} ago`
      }
    }
    if (step?.next_due) {
      const days = daysBetween(today, step.next_due)
      if (days <= 0) return "due now"
      if (days === 1) return "due tomorrow"
      if (days <= 7) return `due in ${days} days`
    }
    if (step?.band === "short") return "quick one"
    return null
  }

  // Check for in-progress thing
  const inProgressRow = rows.find((t) => t.started_at != null)
  const initialInProgress: InProgressThing | null = inProgressRow
    ? {
        thing_id: inProgressRow.id,
        thing_name: inProgressRow.name,
        step_name: inProgressRow.steps.find((s) => s.id === inProgressRow.live_step_id)?.name ?? inProgressRow.name,
        started_at: inProgressRow.started_at!,
      }
    : null

  if (initialInProgress) {
    return <OfferCard initialOffer={[]} initialInProgress={initialInProgress} initialCareGroup={null} />
  }

  // ── Care group ─────────────────────────────────────────────────────────────
  const lastCareOfferDate = profile?.last_care_offer_date ?? null
  const careAlreadyOfferedToday = lastCareOfferDate === today

  let initialCareGroup: CareGroupOffer | null = null
  if (!careAlreadyOfferedToday) {
    const { data: carePlanData } = await supabase
      .from("care_plans")
      .select(`
        id, entity_id, action, intervals, tolerance_days, overdue_days,
        last_done_at, next_due_at, archived_at,
        entities!care_plans_entity_id_fkey (
          id, name, location, archived_at
        )
      `)
      .eq("user_id", user.id)
      .is("archived_at", null)

    if (carePlanData && carePlanData.length > 0) {
      const group = buildCareGroup(carePlanData as unknown as CarePlanRow[], today)
      if (group) {
        initialCareGroup = {
          type: "care_group",
          anchor_plan_id: group.anchor_plan_id,
          action: group.action,
          location: group.location,
          title: group.title,
          entity_names: group.entity_names,
          plan_ids: group.plan_ids,
          reason: group.reason,
          has_overdue: group.has_overdue,
        }
      }
    }
  }

  // ── Build offer ────────────────────────────────────────────────────────────
  const available = rows.filter((t) => t.live_step_id != null || t.steps.length === 0)

  const obligations = available.filter((t) => {
    if (t.class !== "obligation") return false
    const live = t.steps.find((s) => s.id === t.live_step_id)
    if (!live?.next_due || t.notify_window == null) return true
    return daysBetween(today, live.next_due) <= t.notify_window
  })

  const projects = available.filter((t) => t.class === "project")

  const hasObligation = obligations.length > 0
  const useCareSlot = !hasObligation && initialCareGroup != null
  const reservedSlots = hasObligation || useCareSlot ? 1 : 0

  function pickWithSpread(items: RawThing[]): RawThing[] {
    if (items.length <= 3) return items
    const getBand = (t: RawThing) => t.steps.find((s) => s.id === t.live_step_id)?.band ?? "sitting"
    const short   = items.filter((t) => getBand(t) === "short")
    const sitting = items.filter((t) => getBand(t) === "sitting")
    const run     = items.filter((t) => getBand(t) === "run")
    const picked: RawThing[] = []
    for (const bucket of [short, sitting, run]) {
      if (picked.length < 3 && bucket.length > 0) picked.push(bucket[0])
    }
    for (const t of items) {
      if (picked.length >= 3) break
      if (!picked.includes(t)) picked.push(t)
    }
    return picked.slice(0, 3)
  }

  const selected = [...obligations.slice(0, 1), ...pickWithSpread(projects).slice(0, 3 - reservedSlots)]

  const initialOffer: OfferItem[] = selected.map((t) => {
    const live = t.steps.find((s) => s.id === t.live_step_id)
    return {
      thing_id: t.id,
      thing_name: t.name,
      step_id: live?.id ?? t.id,
      step_name: live?.name ?? `Next thing on ${t.name}`,
      band: live?.band ?? "sitting",
      reason: buildReason(t, live),
    }
  })

  return (
    <OfferCard
      initialOffer={initialOffer}
      initialInProgress={null}
      initialCareGroup={useCareSlot ? initialCareGroup : null}
    />
  )
}
