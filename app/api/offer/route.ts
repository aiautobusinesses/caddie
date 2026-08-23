import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { parseRecurrenceRule } from "@/lib/recurrence"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfferItem = {
  thing_id: string
  thing_name: string
  estimated_minutes: number | null
  reason: string | null
}

export type InProgressThing = {
  thing_id: string
  thing_name: string
  started_at: string
}

type StepRow = {
  id: string
  name: string
  estimated_minutes: number | null
  recurrence_rule: unknown
  next_due: string | null
  last_done_at: string | null
  step_order: number
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

  // Obligation or recurring step with a next_due but no history
  if (step?.next_due) {
    const days = daysBetween(today, step.next_due)
    if (days <= 0) return "due now"
    if (days === 1) return "due tomorrow"
    if (days <= 7) return `due in ${days} days`
  }

  // No meaningful reason to show
  return null
}

// ---------------------------------------------------------------------------
// Shape spread — prefer variety across time estimates
// ---------------------------------------------------------------------------

function pickWithSpread(items: ThingRow[]): ThingRow[] {
  if (items.length <= 3) return items

  const getMinutes = (t: ThingRow) => {
    const live = t.steps.find((s) => s.id === t.live_step_id)
    return live?.estimated_minutes ?? null
  }

  const quick = items.filter((t) => { const m = getMinutes(t); return m != null && m <= 15 })
  const medium = items.filter((t) => { const m = getMinutes(t); return m != null && m > 15 && m <= 45 })
  const long = items.filter((t) => { const m = getMinutes(t); return m == null || m > 45 })

  const picked: ThingRow[] = []
  for (const bucket of [quick, medium, long]) {
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

  const { data, error } = await supabase
    .from("things")
    .select(`
      id, name, class, notify_window, live_step_id, started_at,
      steps!steps_thing_id_fkey (
        id, name, estimated_minutes, recurrence_rule,
        next_due, last_done_at, step_order
      )
    `)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const things = (data ?? []) as unknown as ThingRow[]

  // Check for in-progress thing
  const inProgress = things.find((t) => t.started_at != null)
  if (inProgress) {
    return NextResponse.json({
      in_progress: {
        thing_id: inProgress.id,
        thing_name: inProgress.name,
        started_at: inProgress.started_at as string,
      } satisfies InProgressThing,
      offer: [],
    })
  }

  // Build offer from things that still have work to do (live_step_id not null,
  // or no steps at all — treat stepless things as always available)
  const available = things.filter((t) => t.live_step_id != null || t.steps.length === 0)

  const obligations = available.filter((t) => {
    if (t.class !== "obligation") return false
    const live = t.steps.find((s) => s.id === t.live_step_id)
    if (!live?.next_due || t.notify_window == null) return true
    return daysBetween(today, live.next_due) <= t.notify_window
  })

  const projects = available.filter((t) => t.class === "project")

  const obligationSlot = obligations.slice(0, 1)
  const projectSlots = pickWithSpread(projects).slice(0, 3 - obligationSlot.length)
  const selected = [...obligationSlot, ...projectSlots]

  const offer: OfferItem[] = selected.map((thing) => {
    const liveStep = thing.steps.find((s) => s.id === thing.live_step_id)
    return {
      thing_id: thing.id,
      thing_name: thing.name,
      estimated_minutes: liveStep?.estimated_minutes ?? null,
      reason: buildReason(thing, liveStep, today),
    }
  })

  return NextResponse.json({ in_progress: null, offer })
}
