import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import TaskCard from "./components/TaskCard"
import ContextCheck from "./components/ContextCheck"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ready?: string; task?: string }>
}) {
  const { ready, task } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_done")
    .eq("id", user.id)
    .single()

  if (!profile?.onboarding_done) {
    redirect("/lifewalk")
  }

  if (task) {
    return <TaskCard initialTaskId={task} />
  }

  if (ready === "1") {
    return <TaskCard />
  }

  const today = new Date().toISOString().split("T")[0]

  const { data: urgent } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("priority", "high")
    .or(`due_date.lte.${today},next_due.lte.${today}`)
    .limit(1)

  const hasUrgent = (urgent ?? []).length > 0

  if (hasUrgent) {
    return <TaskCard />
  }

  return <ContextCheck />
}
