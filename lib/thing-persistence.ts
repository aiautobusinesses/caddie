import type { Database, Json } from "@/lib/database.types"
import type { LifeWalkExtractedThing } from "@/lib/tasks"
import type { SupabaseClient } from "@supabase/supabase-js"

export type PersistThingsOptions = {
  source: Database["public"]["Enums"]["task_source"]
  userId: string
}

export type PersistThingsResult = {
  saved: { thing_id: string; name: string }[]
}

export async function persistThings(
  supabase: SupabaseClient<Database>,
  things: LifeWalkExtractedThing[],
  options: PersistThingsOptions,
): Promise<PersistThingsResult> {
  const saved: { thing_id: string; name: string }[] = []

  for (const thing of things) {
    if (!thing.name?.trim() || !Array.isArray(thing.steps) || thing.steps.length === 0) {
      continue
    }

    const steps = thing.steps.map((step, index) => ({
      name: step.name.trim(),
      step_order: index,
      band: step.band ?? "sitting",
      mode: step.mode ?? "doing",
      shape: step.shape ?? "clean",
      needs_know_how: step.needs_know_how ?? false,
    }))

    const { data: thingId, error } = await supabase.rpc("insert_thing_with_steps", {
      p_user_id: options.userId,
      p_name: thing.name.trim(),
      p_class: thing.class ?? "project",
      p_domain: thing.domain ?? null,
      p_due_date: thing.due_date ?? null,
      p_notify_window: thing.notify_window ?? null,
      p_notify_time_of_day: thing.notify_time_of_day ?? null,
      p_notify_escalate: thing.notify_escalate ?? false,
      p_source: options.source,
      p_steps: steps as unknown as Json,
    })

    if (error || !thingId) {
      throw new Error(error?.message ?? "Failed to insert thing")
    }

    saved.push({ thing_id: thingId, name: thing.name.trim() })
  }

  return { saved }
}
