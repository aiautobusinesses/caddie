import { buildCareGroup } from "@/lib/care-grouping"
import type { CarePlanRow } from "@/lib/care-grouping"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfferItem = {
  thing_id: string
  thing_name: string
  step_id: string
  step_name: string
  band: "short" | "sitting" | "run"
  mode: "thinking" | "doing"
  domain: string
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
  step_order: number
  done: boolean
}

export type OfferThingRow = {
  id: string
  name: string
  class: "obligation" | "project"
  domain: string | null
  due_date: string | null
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
  completionCount: number
  nudgeBackCounts: Record<string, number>
}

export type OfferComputationResult = {
  inProgress: InProgressThing | null
  offer: OfferItem[]
  careGroup: CareGroupOffer | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Working assumption: below this many completed steps the offer is conservative.
 * Protect early efficacy before the loop is established.
 */
export const TENURE_THRESHOLD = 10

/**
 * Working assumption: a thing nudged back this many times drops to a generic
 * step line.  The safety valve for wrong chains while specific-by-default is
 * being proven.
 */
export const NUDGE_BACK_THRESHOLD = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay)
}

export function isEarlyPhase(completionCount: number): boolean {
  return completionCount < TENURE_THRESHOLD
}

/**
 * Build the reason line for an offer item.
 *
 * Rules:
 *  - Obligations: due-date reason from `thing.due_date` (never from a step field).
 *  - Projects:    never urgency language.  Prefer a non-clock reason; fall back to null.
 *  - Short band:  "quick one" is always a valid non-clock reason.
 *  - Early phase: return null — degrade to generic rather than invent a specific one.
 */
function buildReason(
  thing: OfferThingRow,
  step: OfferStepRow | undefined,
  today: string,
  earlyPhase: boolean,
): string | null {
  if (earlyPhase) return null

  if (thing.class === "obligation" && thing.due_date) {
    const days = daysBetween(today, thing.due_date)
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
    if (days === 0) return "due today"
    if (days === 1) return "due tomorrow"
    return `due in ${days} days`
  }

  // Non-clock reason for projects — never urgency language.
  if (step?.band === "short") return "quick one"

  return null
}

/**
 * Pick up to three items from a pool, spreading across band, then mode, then
 * domain to avoid offering three items from the same axis.
 */
function pickWithSpread(items: OfferThingRow[]): OfferThingRow[] {
  if (items.length <= 3) return items

  function getLiveStep(thing: OfferThingRow): OfferStepRow | undefined {
    return thing.steps.find((s) => s.id === thing.live_step_id)
  }

  const getBand = (thing: OfferThingRow): OfferStepRow["band"] =>
    getLiveStep(thing)?.band ?? "sitting"

  const getMode = (thing: OfferThingRow): OfferStepRow["mode"] =>
    getLiveStep(thing)?.mode ?? "doing"

  const getDomain = (thing: OfferThingRow): string =>
    thing.domain ?? "other"

  // First pass: one item per band (primary axis).
  const short = items.filter((t) => getBand(t) === "short")
  const sitting = items.filter((t) => getBand(t) === "sitting")
  const run = items.filter((t) => getBand(t) === "run")

  const picked: OfferThingRow[] = []
  for (const bucket of [short, sitting, run]) {
    if (picked.length < 3 && bucket.length > 0) picked.push(bucket[0])
  }

  // Second pass: fill remaining slots from overflow, preferring mode variety.
  const pickedModes = new Set(picked.map(getMode))
  for (const thing of items) {
    if (picked.length >= 3) break
    if (picked.includes(thing)) continue
    const mode = getMode(thing)
    if (!pickedModes.has(mode)) {
      picked.push(thing)
      pickedModes.add(mode)
    }
  }

  // Third pass: fill remaining slots from overflow, preferring domain variety.
  const pickedDomains = new Set(picked.map(getDomain))
  for (const thing of items) {
    if (picked.length >= 3) break
    if (picked.includes(thing)) continue
    const domain = getDomain(thing)
    if (!pickedDomains.has(domain)) {
      picked.push(thing)
      pickedDomains.add(domain)
    }
  }

  // Final fill: take anything remaining to reach the limit.
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

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeOffer(input: OfferComputationInput): OfferComputationResult {
  const { today, things, carePlans, lastCareOfferDate, completionCount, nudgeBackCounts } = input
  const earlyPhase = isEarlyPhase(completionCount)

  const inProgress = buildInProgressThing(things)
  if (inProgress) {
    return { inProgress, offer: [], careGroup: null }
  }

  const careAlreadyOfferedToday = lastCareOfferDate === today
  const rawCareGroup = !careAlreadyOfferedToday && carePlans.length > 0
    ? mapCareGroup(buildCareGroup(carePlans, today))
    : null

  const available = things.filter((thing) => thing.live_step_id != null || thing.steps.length === 0)

  const obligations = available.filter((thing) => {
    if (thing.class !== "obligation") return false
    if (!thing.due_date || thing.notify_window == null) return true
    return daysBetween(today, thing.due_date) <= thing.notify_window
  })

  // Projects: early-phase filter — skip unconfirmed needs_know_how steps.
  // If filtering empties the pool, fall back to the unfiltered pool with generic names.
  const allProjects = available.filter((thing) => thing.class === "project")

  const filteredProjects = earlyPhase
    ? allProjects.filter((thing) => {
        const liveStep = thing.steps.find((s) => s.id === thing.live_step_id)
        return !(liveStep?.needs_know_how ?? false)
      })
    : allProjects

  const projects = filteredProjects.length > 0 ? filteredProjects : allProjects

  // One clock-bearing slot, maximum: obligation wins over care group.
  const hasObligation = obligations.length > 0
  const useCareSlot = !hasObligation && rawCareGroup != null
  const reservedSlots = hasObligation || useCareSlot ? 1 : 0
  const selected = [
    ...obligations.slice(0, 1),
    ...pickWithSpread(projects).slice(0, 3 - reservedSlots),
  ]

  const offer = selected.map((thing) => {
    const liveStep = thing.steps.find((s) => s.id === thing.live_step_id)

    // Per-thing degradation: a thing repeatedly nudged back shows a generic line.
    const nudgeCount = nudgeBackCounts[thing.id] ?? 0
    const useGenericName = nudgeCount >= NUDGE_BACK_THRESHOLD

    // Early-phase floor: if the project pool fell back to unfiltered, use generic names.
    const isUnconfirmedKnowHow = earlyPhase && (liveStep?.needs_know_how ?? false)

    const stepName = (useGenericName || isUnconfirmedKnowHow)
      ? `Next thing on ${thing.name}`
      : (liveStep?.name ?? `Next thing on ${thing.name}`)

    return {
      thing_id: thing.id,
      thing_name: thing.name,
      step_id: liveStep?.id ?? thing.id,
      step_name: stepName,
      band: liveStep?.band ?? "sitting",
      mode: liveStep?.mode ?? "doing",
      domain: thing.domain ?? "other",
      // Suppress needs_know_how when showing a generic step name — the accept-question
      // makes no sense when we've already hidden the specific step behind a fallback.
      needs_know_how: (useGenericName || isUnconfirmedKnowHow) ? false : (liveStep?.needs_know_how ?? false),
      reason: buildReason(thing, liveStep, today, earlyPhase),
    } satisfies OfferItem
  })

  return {
    inProgress: null,
    offer,
    careGroup: useCareSlot ? rawCareGroup : null,
  }
}
