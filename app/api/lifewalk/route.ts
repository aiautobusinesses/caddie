import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { parseLifeWalkThingsFromModelText } from "@/lib/lifewalk-parse"

const LIFEWALK_MODEL = "claude-haiku-4-5"

const EXTRACTION_PROMPT = `You are helping someone manage their life admin. They have narrated a walk around their home and life, describing things they notice that need doing.

Extract every distinct THING from this narration and break each one into ordered STEPS — the actual actions, in the order they need to happen.

Rules:
- The unit is the STEP, not the thing. "Order a bath panel" is a step. "Fix the bathroom" is not.
- Single-step obligations (book MOT, renew insurance) must have exactly one step. Do not invent extra steps.
- Recurring maintenance (watering, mowing) has one repeating step.
- For ambiguous things, use best judgement on a sensible first step and obvious subsequent steps. Do not over-decompose.
- ONE thing per subject per deadline. Never create both "MOT for Touran" and "Book MOT for Touran" — only the actionable thing with one step ("Book MOT for Touran").
- Different work types on the same subject stay separate (e.g. "Service MX-5" and "Renew tax for MX-5" are two things).

For each thing return:
- name: plain English name, keep the narrator's voice (e.g. "Bath panel", "MOT", "Peace lily")
- class: "obligation" if something bad happens if a date passes (MOT, tax, insurance, bills); otherwise "project"
- notify_window: for obligations only — integer days before the step's next_due to first notify; null for projects
- notify_time_of_day: "morning", "afternoon", or "evening" — when it makes most sense to act; null for projects
- notify_escalate: true for hard-deadline obligations where a second closer-in reminder makes sense; false otherwise
- steps: ordered array of step objects, each with:
  - name: imperative plain English action ("Order the bath panel", not "Ordering")
  - estimated_minutes: rough number if inferrable, otherwise null
  - ends_cleanly: true if this step is self-contained and completing it is unambiguous; false if it may need multiple sessions or has a mandatory wait (e.g. paint drying)
  - recurrence_rule: for recurring steps only — exactly one of:
    - { "type": "fixed", "days": N, "anchor": "completion" }
    - { "type": "seasonal", "summerDays": N, "winterDays": N, "anchor": "completion" }
    - { "type": "annual", "month": 1-12, "day": 1-31, "anchor": "schedule" }
    null for one-off steps
  - next_due: ISO date YYYY-MM-DD for hard deadlines (MOT expiry, tax due, insurance renewal); null otherwise. Use the next upcoming occurrence from today.

recurrence_rule guidance:
- Plant watering → always "seasonal" (infer summerDays and winterDays from what the narrator says)
- Annual calendar obligations → "annual" with anchor "schedule"
- Everything else with a repeat interval → "fixed" with anchor "completion"
- One-off steps → null

Return ONLY a valid JSON array of things. No markdown, no code fences, no commentary.

Example:
[{"name":"Bath panel","class":"project","notify_window":null,"notify_time_of_day":null,"notify_escalate":false,"steps":[{"name":"Measure up and order the right size panel","estimated_minutes":20,"ends_cleanly":true,"recurrence_rule":null,"next_due":null},{"name":"Remove old panel and treat mould on wall","estimated_minutes":45,"ends_cleanly":false,"recurrence_rule":null,"next_due":null},{"name":"Fit new panel and seal edges","estimated_minutes":60,"ends_cleanly":true,"recurrence_rule":null,"next_due":null}]},{"name":"MOT","class":"obligation","notify_window":14,"notify_time_of_day":"morning","notify_escalate":true,"steps":[{"name":"Book MOT at the garage","estimated_minutes":10,"ends_cleanly":true,"recurrence_rule":{"type":"annual","month":3,"day":15,"anchor":"schedule"},"next_due":"2026-03-15"}]}]`

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Life walk is not configured (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    )
  }

  let transcript: string
  try {
    const body = await req.json()
    transcript = typeof body.transcript === "string" ? body.transcript : ""
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: LIFEWALK_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Narration:\n${transcript.trim()}`,
        },
      ],
    })

    const textBlock = message.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 })
    }

    const things = parseLifeWalkThingsFromModelText(textBlock.text)
    return NextResponse.json({ things })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message || "AI request failed" },
        { status: error.status ?? 502 },
      )
    }

    const message =
      error instanceof Error ? error.message : "Could not parse things"

    const isParseError =
      message.includes("JSON") ||
      message.includes("No valid things") ||
      message.includes("model response")

    return NextResponse.json(
      { error: isParseError ? "Could not parse your narration. Try again or shorten it." : message },
      { status: 500 },
    )
  }
}
