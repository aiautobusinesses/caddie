import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { parseRecurrenceRule } from "@/lib/recurrence"
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
  reason: string | null
}

/** A grouped recurring care offer. band/mode/shape are always short/doing/clean per spec. */
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

type StepRow = {
  id: string
  name: string
  band: "short" | "sitting" | "run"
  mode: "thinking" | "doing"
  shape: "clean" | "bleeds"
  recurrence_rule: unknown
  next_due: string | null
  last_done_at: string | null
  step_order: number
  done: boolean
}

type ThingRow = {
  id: string
  name: string
  class: "obligation" | "project"
  notify_window: number | null
  live_step_id: string | null
  started_at: string | null
  steps: StepRow[]
}

// ---------------------------------------------------------------------------
// Reason computation
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay,
  )
}

function buildReason(thing: ThingRow, step: StepRow | undefined, today: string): string | null {
  // Obligation with a due date
  if (thing.class === "obligation" && step?.next_due) {
    const days = daysBetween(today, step.next_due)
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
    if (days === 0) return "due today"
    if (days === 1) return "due tomorrow"
    return `due in ${days} days`
  }

  // Recurring step with a last_done_at
  if (step?.recurrence_rule && step.last_done_at) {
    const rule = parseRecurrenceRule(step.recurrence_rule)
    if (rule) {
      const daysSince = daysBetween(step.last_done_at.split("T")[0], today)
      if (daysSince > 0) {
        return `last done ${daysSince} day${daysSince === 1 ? "" : "s"} ago`
      }
    }
  }

  // Step with a next_due
  if (step?.next_due) {
    const days = daysBetween(today, step.next_due)
    if (days <= 0) return "due now"
    if (days === 1) return "due tomorrow"
    if (days <= 7) return `due in ${days} days`
  }

  // Band-based reason — only show if genuinely useful
  if (step?.band === "short") return "quick one"

  // No meaningful reason
  return null
}

// ---------------------------------------------------------------------------
// Shape spread — prefer variety across band
// ---------------------------------------------------------------------------

function pickWithSpread(items: ThingRow[]): ThingRow[] {
  if (items.length <= 3) return items

  const getBand = (t: ThingRow) =>
    t.steps.find((s) => s.id === t.live_step_id)?.band ?? "sitting"

  const short   = items.filter((t) => getBand(t) === "short")
  const sitting = items.filter((t) => getBand(t) === "sitting")
  const run     = items.filter((t) => getBand(t) === "run")

  const picked: ThingRow[] = []
  for (const bucket of [short, sitting, run]) {
    if (picked.length < 3 && bucket.length > 0) picked.push(bucket[0])
  }
  for (const t of items) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  return picked.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { supabase, user } = auth
  const today = new Date().toISOString().split("T")[0]

  // ── Fetch things + steps ──────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("things")
    .select(`
      id, name, class, notify_window, live_step_id, started_at,
      steps!steps_thing_id_fkey (
        id, name, band, mode, shape, recurrence_rule,
        next_due, last_done_at, step_order, done
      )
    `)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const things = (data ?? []) as unknown as ThingRow[]

  // ── Check for in-progress thing ───────────────────────────────────────────
  const inProgress = things.find((t) => t.started_at != null)
  if (inProgress) {
    const liveStep = inProgress.steps.find((s) => s.id === inProgress.live_step_id)
    return NextResponse.json({
      in_progress: {
        thing_id: inProgress.id,
        thing_name: inProgress.name,
        step_name: liveStep?.name ?? inProgress.name,
        started_at: inProgress.started_at as string,
      } satisfies InProgressThing,
      offer: [],
      care_group: null,
    })
  }

  // ── Fetch care plans for grouping ─────────────────────────────────────────
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

  // ── Check once-daily cap ─────────────────────────────────────────────────
  const { data: profileData } = await supabase
    .from("profiles")
    .select("last_care_offer_date")
    .eq("id", user.id)
    .single()

  const lastCareOfferDate = (profileData as { last_care_offer_date: string | null } | null)
    ?.last_care_offer_date ?? null
  const careAlreadyOfferedToday = lastCareOfferDate === today

  // ── Build care group ──────────────────────────────────────────────────────
  let careGroup: CareGroupOffer | null = null
  if (!careAlreadyOfferedToday && carePlanData && carePlanData.length > 0) {
    const plans = carePlanData as unknown as CarePlanRow[]
    const group = buildCareGroup(plans, today)
    if (group) {
      careGroup = {
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

  // ── Build obligation + project offer ─────────────────────────────────────
  const available = things.filter((t) => t.live_step_id != null || t.steps.length === 0)

  const obligations = available.filter((t) => {
    if (t.class !== "obligation") return false
    const live = t.steps.find((s) => s.id === t.live_step_id)
    if (!live?.next_due || t.notify_window == null) return true
    return daysBetween(today, live.next_due) <= t.notify_window
  })

  const projects = available.filter((t) => t.class === "project")

  // Obligation wins the slot; care takes it only if no obligation
  const hasObligation = obligations.length > 0
  const obligationSlot = obligations.slice(0, 1)

  // If obligation wins, care group is suppressed for that slot
  // Care group takes the slot when no obligations, and hasn't been shown today
  const useCareSlot = !hasObligation && careGroup != null

  // Project slots fill remaining space (max 3 total, 1 reserved for obligation/care)
  const reservedSlots = hasObligation || useCareSlot ? 1 : 0
  const projectSlots = pickWithSpread(projects).slice(0, 3 - reservedSlots)
  const selected = [...obligationSlot, ...projectSlots]

  const offer: OfferItem[] = selected.map((thing) => {
    const liveStep = thing.steps.find((s) => s.id === thing.live_step_id)
    return {
      thing_id: thing.id,
      thing_name: thing.name,
      step_id: liveStep?.id ?? thing.id,
      step_name: liveStep?.name ?? `Next thing on ${thing.name}`,
      band: liveStep?.band ?? "sitting",
      reason: buildReason(thing, liveStep, today),
    }
  })

  return NextResponse.json({
    in_progress: null,
    offer,
    care_group: useCareSlot ? careGroup : null,
  })
}
