import { NextRequest, NextResponse } from "next/server"
import type { Database } from "@/lib/database.types"
import { getAuthenticatedContext } from "@/lib/api/session"

type RouteContext = { params: Promise<{ id: string }> }

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"]

const FORBIDDEN_KEYS = new Set([
  "id",
  "user_id",
  "created_at",
])

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: taskId } = await context.params
  const { supabase, user } = auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const updates: TaskUpdate = {}
  for (const [key, value] of Object.entries(body)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue
    }
    ;(updates as Record<string, unknown>)[key] = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task })
}
