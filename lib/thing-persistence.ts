import { parseRecurrenceRule } from "@/lib/recurrence"
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

    const { data: thingRow, error: thingError } = await supabase
      .from("things")
      .insert({
        user_id: options.userId,
        name: thing.name.trim(),
        class: thing.class ?? "project",
        notify_window: thing.notify_window ?? null,
        notify_time_of_day: thing.notify_time_of_day ?? null,
        notify_escalate: thing.notify_escalate ?? false,
        source: options.source,
      })
      .select("id")
      .single()

    if (thingError || !thingRow) {
      throw new Error(thingError?.message ?? "Failed to insert thing")
    }

    const thingId = thingRow.id
    const stepInserts = thing.steps.map((step, index) => ({
      thing_id: thingId,
      user_id: options.userId,
      name: step.name.trim(),
      step_order: index,
      band: step.band ?? "sitting",
      mode: step.mode ?? "doing",
      shape: step.shape ?? "clean",
      needs_know_how: step.needs_know_how ?? false,
      recurrence_rule: step.recurrence_rule
        ? (parseRecurrenceRule(step.recurrence_rule) as Json)
        : null,
      next_due: step.next_due ?? null,
      done: false,
    }))

    const { data: stepRows, error: stepsError } = await supabase
      .from("steps")
      .insert(stepInserts)
      .select("id, step_order")

    if (stepsError || !stepRows?.length) {
      await supabase.from("things").delete().eq("id", thingId)
      throw new Error(stepsError?.message ?? "Failed to insert steps")
    }

    const firstStep = stepRows.find((step) => step.step_order === 0) ?? stepRows[0]
    const { error: liveStepError } = await supabase
      .from("things")
      .update({ live_step_id: firstStep.id })
      .eq("id", thingId)

    if (liveStepError) {
      throw new Error(liveStepError.message)
    }

    saved.push({ thing_id: thingId, name: thing.name.trim() })
  }

  return { saved }
}
