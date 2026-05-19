import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import TaskList from "./components/TaskList"
import type { TaskRow } from "@/lib/tasks"

export default async function TasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth")
  }

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("next_due", { ascending: true, nullsFirst: false })

  if (error) {
    throw new Error(error.message)
  }

  return <TaskList initialTasks={(tasks ?? []) as TaskRow[]} />
}
