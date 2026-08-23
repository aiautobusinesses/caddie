import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { getAuthenticatedContext } from "@/lib/api/session"

type RouteContext = { params: Promise<{ id: string }> }

const MODEL = "claude-haiku-4-5"

const BREAKDOWN_SYSTEM = `You are helping someone figure out how to get started on a task they're stuck on.

Given the name of a task, return a short ordered list of concrete next actions — the actual physical steps, in the order they need to happen.

Rules:
- 3 to 6 steps maximum. Do not pad.
- Each step should be completable in a single session.
- Use plain imperative English. "Measure the space", not "You should measure the space".
- Do not include steps that are obviously already done (e.g. if the task is "fit the bath panel", don't include "buy a bath panel").
- If the task is simple (a phone call, an online booking), return just 1 or 2 steps.

Return ONLY a JSON array of strings. No objects, no keys, no commentary.

Example: ["Measure the alcove width and height","Order the shelving unit online","Clear the alcove and mark fixing points","Fit the brackets and hang the shelves"]`

export async function POST(_req: Request, context: RouteContext) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const { supabase, user } = auth

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 })
  }

  const { data: thing, error: fetchError } = await supabase
    .from("things")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !thing) {
    return NextResponse.json({ error: "Thing not found" }, { status: 404 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      temperature: 0.2,
      system: BREAKDOWN_SYSTEM,
      messages: [{ role: "user", content: `Task: ${thing.name}` }],
    })

    const block = message.content.find((b) => b.type === "text")
    if (!block || block.type !== "text") {
      return NextResponse.json({ error: "Unexpected AI response" }, { status: 500 })
    }

    let steps: string[] = []
    try {
      const cleaned = block.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        steps = parsed.filter((s) => typeof s === "string" && s.trim())
      }
    } catch {
      return NextResponse.json({ error: "Could not parse breakdown" }, { status: 500 })
    }

    if (steps.length === 0) {
      return NextResponse.json({ error: "No steps returned" }, { status: 500 })
    }

    return NextResponse.json({ steps })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 502 })
    }
    const msg = error instanceof Error ? error.message : "Breakdown failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
