import { NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Prepends a short/thinking "Look up how to…" step to the front of a thing's
 * step chain and advances live_step_id to that new step.
 *
 * Called when the user answers "No" to the familiarity question on a step
 * flagged needs_know_how = true. The inserted step has step_order -1 so it
 * sorts before the existing chain without renumbering anything.
 */
export async function POST(_req: Request, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  const { data: result, error } = await supabase.rpc("prepend_lookup_step", {
    p_thing_id: id,
    p_user_id: user.id,
  })

  if (error) {
    const status = error.message === "Thing not found" ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  const rpcResult = result as { step_id: string } | null
  if (!rpcResult?.step_id) {
    return NextResponse.json({ error: "Failed to create lookup step" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, step_id: rpcResult.step_id })
}
