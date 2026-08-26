import { buildCareGroup } from "@/lib/care-grouping"
import type { CarePlanRow } from "@/lib/care-grouping"
import { parseRecurrenceRule } from "@/lib/recurrence"

export type OfferItem = {
  thing_id: string
  thing_name: string
  step_id: string
  step_name: string
  band: "short" | "sitting" | "run"
  needs_know_how: boolean
  reason: string | null
}

export type CareGroupOffer = {
  type: "care_group"
  anchor_plan_id: string
  action: string
  location: string | null
  title: string
  entity_names: string[]
  plan_ids: string[]
  reason: string | null
  has_overdue: boolean
}

export type InProgressThing = {
  thing_id: string
  thing_name: string
  step_name: string
  started_at: string
}

export type OfferStepRow = {
  id: string
  name: string
  band: "short" | "sitting" | "run"
  mode: "thinking" | "doing"
  shape: "clean" | "bleeds"
  needs_know_how: boolean
  recurrence_rule: unknown
  next_due: string | null
  last_done_at: string | null
  step_order: number
  done: boolean
}

export type OfferThingRow = {
  id: string
  name: string
  class: "obligation" | "project"
  notify_window: number | null
  live_step_id: string | null
  started_at: string | null
  steps: OfferStepRow[]
}

export type OfferComputationInput = {
  today: string
  things: OfferThingRow[]
  carePlans: CarePlanRow[]
  lastCareOfferDate: string | null
}

export type OfferComputationResult = {
  inProgress: InProgressThing | null
  offer: OfferItem[]
  careGroup: CareGroupOffer | null
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay)
}

function buildReason(
  thing: OfferThingRow,
  step: OfferStepRow | undefined,
  today: string,
): string | null {
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
      if (daysSince > 0) {
        return `last done ${daysSince} day${daysSince === 1 ? "" : "s"} ago`
      }
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

function pickWithSpread(items: OfferThingRow[]): OfferThingRow[] {
  if (items.length <= 3) return items

  const getBand = (thing: OfferThingRow) =>
    thing.steps.find((step) => step.id === thing.live_step_id)?.band ?? "sitting"

  const short = items.filter((thing) => getBand(thing) === "short")
  const sitting = items.filter((thing) => getBand(thing) === "sitting")
  const run = items.filter((thing) => getBand(thing) === "run")

  const picked: OfferThingRow[] = []
  for (const bucket of [short, sitting, run]) {
    if (picked.length < 3 && bucket.length > 0) picked.push(bucket[0])
  }

  for (const thing of items) {
    if (picked.length >= 3) break
    if (!picked.includes(thing)) picked.push(thing)
  }

  return picked.slice(0, 3)
}

function buildInProgressThing(things: OfferThingRow[]): InProgressThing | null {
  const inProgress = things.find((thing) => thing.started_at != null)
  if (!inProgress) return null

  const liveStep = inProgress.steps.find((step) => step.id === inProgress.live_step_id)
  return {
    thing_id: inProgress.id,
    thing_name: inProgress.name,
    step_name: liveStep?.name ?? inProgress.name,
    started_at: inProgress.started_at as string,
  }
}

function mapCareGroup(group: ReturnType<typeof buildCareGroup>): CareGroupOffer | null {
  if (!group) return null

  return {
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

export function computeOffer(input: OfferComputationInput): OfferComputationResult {
  const { today, things, carePlans, lastCareOfferDate } = input

  const inProgress = buildInProgressThing(things)
  if (inProgress) {
    return { inProgress, offer: [], careGroup: null }
  }

  const careAlreadyOfferedToday = lastCareOfferDate === today
  const careGroup = !careAlreadyOfferedToday && carePlans.length > 0
    ? mapCareGroup(buildCareGroup(carePlans, today))
    : null

  const available = things.filter((thing) => thing.live_step_id != null || thing.steps.length === 0)

  const obligations = available.filter((thing) => {
    if (thing.class !== "obligation") return false
    const liveStep = thing.steps.find((step) => step.id === thing.live_step_id)
    if (!liveStep?.next_due || thing.notify_window == null) return true
    return daysBetween(today, liveStep.next_due) <= thing.notify_window
  })

  const projects = available.filter((thing) => thing.class === "project")
  const hasObligation = obligations.length > 0
  const useCareSlot = !hasObligation && careGroup != null
  const reservedSlots = hasObligation || useCareSlot ? 1 : 0
  const selected = [
    ...obligations.slice(0, 1),
    ...pickWithSpread(projects).slice(0, 3 - reservedSlots),
  ]

  const offer = selected.map((thing) => {
    const liveStep = thing.steps.find((step) => step.id === thing.live_step_id)
    return {
      thing_id: thing.id,
      thing_name: thing.name,
      step_id: liveStep?.id ?? thing.id,
      step_name: liveStep?.name ?? `Next thing on ${thing.name}`,
      band: liveStep?.band ?? "sitting",
      needs_know_how: liveStep?.needs_know_how ?? false,
      reason: buildReason(thing, liveStep, today),
    }
  })

  return {
    inProgress: null,
    offer,
    careGroup: useCareSlot ? careGroup : null,
  }
}
