import type { LifeWalkExtractedThing } from "@/lib/tasks"

export const TASKS_UPDATED_EVENT = "caddie:tasks-updated"

export function notifyTasksUpdated() {
  window.dispatchEvent(new CustomEvent(TASKS_UPDATED_EVENT))
}

export async function saveCapturedThings(things: LifeWalkExtractedThing[]): Promise<void> {
  const res = await fetch("/api/things", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ things }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      typeof data.error === "string" ? data.error : "Failed to save",
    )
  }
}

export async function completeOnboarding(): Promise<void> {
  const { createClient } = await import("@/lib/supabase/client")
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_done: true })
    .eq("id", user.id)

  if (error) {
    throw new Error(error.message)
  }
}
