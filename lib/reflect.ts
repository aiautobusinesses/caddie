import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

export type ReflectedStep = {
  id: string
  step_id: string
  thing_id: string
  thing_name: string
  step_name: string
  domain: string | null
  completed_at: string
  sittings_count: number
  was_nudged: boolean
  highlight: string | null
}

export type ReflectionGroup = {
  label: string
  items: ReflectedStep[]
}

function getRelativeDateLabel(dateIso: string, todayIso: string): string {
  const itemDate = dateIso.split("T")[0]
  const today = todayIso.split("T")[0]

  if (itemDate === today) return "Today"

  const itemTime = new Date(itemDate).getTime()
  const todayTime = new Date(today).getTime()
  const diffDays = Math.round((todayTime - itemTime) / (1000 * 60 * 60 * 24))

  if (diffDays === 1) return "Yesterday"
  if (diffDays <= 7) return "This past week"
  if (diffDays <= 30) return "This past month"
  return "Earlier"
}

export async function loadReflections(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ groups: ReflectionGroup[]; totalCount: number }> {
  const todayIso = new Date().toISOString()

  // Fetch recent done events with joined step and thing data
  const { data: doneEvents, error } = await supabase
    .from("step_events")
    .select(`
      id, step_id, thing_id, created_at,
      steps!step_events_step_id_fkey (
        id, name, band, mode, shape
      ),
      things!step_events_thing_id_fkey (
        id, name, domain, class
      )
    `)
    .eq("user_id", userId)
    .eq("event_type", "done")
    .order("created_at", { ascending: false })
    .limit(60)

  if (error || !doneEvents) {
    return { groups: [], totalCount: 0 }
  }

  const stepIds = doneEvents.map((e) => e.step_id)

  // Fetch all prior stopped or nudged_back events for these steps to derive difficulty
  const { data: difficultyEvents } = stepIds.length > 0
    ? await supabase
        .from("step_events")
        .select("step_id, event_type")
        .eq("user_id", userId)
        .in("step_id", stepIds)
        .in("event_type", ["stopped", "nudged_back"])
    : { data: [] }

  const stoppedCounts: Record<string, number> = {}
  const nudgedCounts: Record<string, number> = {}

  for (const event of difficultyEvents ?? []) {
    if (event.event_type === "stopped") {
      stoppedCounts[event.step_id] = (stoppedCounts[event.step_id] ?? 0) + 1
    } else if (event.event_type === "nudged_back") {
      nudgedCounts[event.step_id] = (nudgedCounts[event.step_id] ?? 0) + 1
    }
  }

  const reflected: ReflectedStep[] = doneEvents.map((event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const step = event.steps as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thing = event.things as any

    const stepName = step?.name ?? "Step"
    const thingName = thing?.name ?? "Thing"
    const domain = thing?.domain ?? null

    const stoppedCount = stoppedCounts[event.step_id] ?? 0
    const nudgedCount = nudgedCounts[event.step_id] ?? 0
    const sittingsCount = 1 + stoppedCount
    const wasNudged = nudgedCount > 0

    let highlight: string | null = null
    if (sittingsCount >= 3) {
      highlight = `${sittingsCount} sittings`
    } else if (sittingsCount === 2) {
      highlight = "2 sittings"
    } else if (wasNudged) {
      highlight = "Revisited & finished"
    } else if (step?.band === "run") {
      highlight = "Solid run"
    }

    return {
      id: event.id,
      step_id: event.step_id,
      thing_id: event.thing_id,
      thing_name: thingName,
      step_name: stepName,
      domain,
      completed_at: event.created_at,
      sittings_count: sittingsCount,
      was_nudged: wasNudged,
      highlight,
    }
  })

  // Group into relative dates
  const groupMap = new Map<string, ReflectedStep[]>()
  for (const item of reflected) {
    const label = getRelativeDateLabel(item.completed_at, todayIso)
    const existing = groupMap.get(label) ?? []
    existing.push(item)
    groupMap.set(label, existing)
  }

  const groups: ReflectionGroup[] = Array.from(groupMap.entries()).map(([label, items]) => ({
    label,
    items,
  }))

  return { groups, totalCount: reflected.length }
}
