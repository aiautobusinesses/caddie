import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server-service"
import { parseLifeWalkThingsFromModelText } from "@/lib/lifewalk-parse"
import { persistThings } from "@/lib/thing-persistence"
import { LIFEWALK_MODEL, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"
import type { LifeWalkExtractedThing } from "@/lib/tasks"
import type { Database } from "@/lib/database.types"

export async function POST(request: NextRequest) {
  // ── Auth: static bearer token ──────────────────────────────────────────────
  const token = process.env.VOICE_WEBHOOK_SECRET
  if (!token) {
    return NextResponse.json({ error: "Voice capture is not configured" }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let text: string
  let userId: string
  try {
    const body = await request.json()
    text = typeof body.text === "string" ? body.text.trim() : ""
    userId = typeof body.user_id === "string" ? body.user_id.trim() : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 })
  }
  if (!userId) {
    return NextResponse.json({ error: "No user_id provided" }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 })
  }

  // ── Extract things via Claude ──────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let things: LifeWalkExtractedThing[]

  try {
    const message = await client.messages.create({
      model: LIFEWALK_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      system: LIFEWALK_EXTRACTION_PROMPT,
      messages: [{ role: "user", content: `Narration:\n${text}` }],
    })

    const textBlock = message.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 })
    }

    things = parseLifeWalkThingsFromModelText(textBlock.text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (things.length === 0) {
    return NextResponse.json({ error: "No things extracted from text" }, { status: 422 })
  }

  // ── Save to Supabase using the service role (bypasses RLS) ─────────────────
  const supabase = createClient<Database>()

  try {
    const result = await persistThings(supabase, things, { source: "voice", userId })
    return NextResponse.json({ saved: result.saved }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 })
  }
}
