/**
 * Grouping algorithm for recurring care offers.
 *
 * Algorithm (per spec):
 * 1. Find care plans where next_due_at <= today. Take the most overdue as anchor.
 * 2. Pull in every plan sharing anchor.action AND anchor.location where
 *    next_due_at <= today + anchor.tolerance_days.
 * 3. If group has one member, offer as single. If more, offer as grouped.
 *
 * Same action, different location = separate offers.
 * Returns at most one group (the most overdue anchor wins).
 *
 * This is called at offer time; nothing is stored.
 */

import { buildCareReason, isGenuinelyOverdue } from "@/lib/care"

export type CarePlanRow = {
  id: string
  entity_id: string
  action: string
  intervals: unknown
  tolerance_days: number
  overdue_days: number
  last_done_at: string | null
  next_due_at: string | null
  archived_at: string | null
  entities: {
    id: string
    name: string
    kind: string
    location: string | null
    archived_at: string | null
  }
}

export type CareGroup = {
  /** The anchor plan id — most overdue member. */
  anchor_plan_id: string
  action: string
  location: string | null
  /** Display title, e.g. "Water the front room plants" */
  title: string
  /** Entity names, e.g. ["Fiddle-leaf fig", "Monstera", "Ferns"] */
  entity_names: string[]
  /** All plan ids in this group (for reporting). */
  plan_ids: string[]
  /** Reason string for the offer card. */
  reason: string | null
  /** True if any member is genuinely overdue. */
  has_overdue: boolean
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

/**
 * Build care groups from a flat list of care plan rows.
 * Returns one group (the most urgent anchor + its tolerance window).
 * Returns null if nothing is due.
 */
export function buildCareGroup(
  plans: CarePlanRow[],
  today: string,
): CareGroup | null {
  // Eligible: active, entity active, due today or overdue
  const due = plans.filter(
    (p) =>
      !p.archived_at &&
      !p.entities.archived_at &&
      p.next_due_at != null &&
      p.next_due_at <= today,
  )

  if (due.length === 0) return null

  // Sort by next_due_at ascending — most overdue first
  due.sort((a, b) => {
    /* v8 ignore next */
    if (!a.next_due_at || !b.next_due_at) return 0
    return a.next_due_at < b.next_due_at ? -1 : 1
  })

  const anchor = due[0]
  /* v8 ignore next */
  if (!anchor.next_due_at) return null

  const windowEnd = addDays(today, anchor.tolerance_days)

  // Pull in plans matching anchor.action + anchor.location within tolerance window
  const group = plans.filter(
    (p) =>
      !p.archived_at &&
      !p.entities.archived_at &&
      p.action === anchor.action &&
      p.entities.location === anchor.entities.location &&
      p.next_due_at != null &&
      p.next_due_at <= windowEnd,
  )

  /* v8 ignore next */
  if (group.length === 0) return null

  // Deduplicate (anchor is already in due, may also be in group)
  const seen = new Set<string>()
  const members: CarePlanRow[] = []
  for (const p of group) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      members.push(p)
    }
  }

  const entityNames = members.map((p) => p.entities.name)
  const location = anchor.entities.location

  const hasOverdue = members.some(
    (p) =>
      p.next_due_at != null &&
      isGenuinelyOverdue(p.next_due_at, p.overdue_days, today),
  )

  // Build offer title
  let title: string
  if (members.length === 1) {
    title = `${anchor.action} ${members[0].entities.name}`
    if (location) title += ` (${location})`
  } else {
    // e.g. "Water the front room plants", "Put out the kitchen bins"
    const locationPart = location ? `the ${location} ` : "your "
    // Use the entity kind from the anchor (e.g. "plant", "bin") pluralised simply.
    // Kind is a short noun stored at capture time; appending "s" is sufficient for
    // the common cases. A kind already plural (e.g. "bins") is stored as-is by the LLM.
    const kindPlural = anchor.entities.kind.endsWith("s")
      ? anchor.entities.kind
      : `${anchor.entities.kind}s`
    title = `${anchor.action} ${locationPart}${kindPlural}`
  }

  // Reason from the anchor
  const reason = buildCareReason(
    anchor.next_due_at,
    anchor.last_done_at,
    anchor.overdue_days,
    today,
  )

  return {
    anchor_plan_id: anchor.id,
    action: anchor.action,
    location,
    title,
    entity_names: entityNames,
    plan_ids: members.map((p) => p.id),
    reason: hasOverdue
      ? buildOverdueReason(anchor, today)
      : reason,
    has_overdue: hasOverdue,
  }
}

function buildOverdueReason(anchor: CarePlanRow, today: string): string {
  if (!anchor.last_done_at) return "hasn't been done in a while"
  const msPerDay = 24 * 60 * 60 * 1000
  const days = Math.round(
    (new Date(today).getTime() - new Date(anchor.last_done_at).getTime()) / msPerDay,
  )
  return `hasn't been done in ${days} day${days === 1 ? "" : "s"}`
}

