import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { parseLifeWalkTasksFromModelText } from "@/lib/lifewalk-parse"

const LIFEWALK_MODEL = "claude-haiku-4-5"

const EXTRACTION_PROMPT = `You are helping someone manage their life admin. They have just narrated a walk around their home and life, describing things they notice that need doing.

Extract every distinct task from this narration. For each task return:
- title: a clear, plain-English description of what needs doing (not too formal, keep their voice)
- category: one of Home, Garden, Car, Admin, Family, Health, Finance, Other
- urgency: one of "now" (urgent/time-sensitive), "soon" (next week or two), "someday" (no rush)
- estimatedMinutes: rough number if you can infer it, otherwise null
- next_due: ISO date YYYY-MM-DD when the narrator gives a specific deadline (MOT expiry, car tax due, insurance renewal, "due in March", etc.). Required whenever a calendar date or month is mentioned for a deadline. Use the next upcoming occurrence of that date from today.
- due_date: same as next_due for hard calendar deadlines; otherwise null
- recurrence: plain English description of when this needs doing again. For plant watering you MUST give two rates separated by a slash: summer rate and winter rate (e.g. "every 3-4 days in summer / every 12-14 days in winter"). Never give a single fixed interval for plant watering. For garden tasks reflect seasonal variation similarly. For home maintenance use intervals like "every 6 months" or "once a year". For one-off tasks use null.
- recurrence_rule: structured recurrence for scheduling, or null for one-off tasks. Use exactly one of these shapes:
  - { "type": "fixed", "days": number, "anchor": "completion" | "schedule" }
  - { "type": "seasonal", "summerDays": number, "winterDays": number, "anchor": "completion" | "schedule" }
  - { "type": "annual", "month": number (1-12), "day": number (1-31), "anchor": "schedule" }

recurrence_rule rules:
- Annual tasks (e.g. "once a year", specific calendar date) → type "annual", anchor "schedule"
- Plant watering → always type "seasonal" (infer summerDays and winterDays from the recurrence text)
- Everything else with a repeat interval → type "fixed" with anchor "completion", unless clearly tied to a fixed calendar date then use anchor "schedule"
- If recurrence is unclear or absent → recurrence_rule: null
- notify_days_before: integer. How many days before next_due to first notify. Examples: plant watering = 0 (notify on the day), MOT booking = 14, bin collection = 1, session planning = 2. One-off tasks with no deadline = 0.
- notify_time_of_day: one of "morning", "afternoon", "evening". When it makes most sense to act. Bin collection = "evening", garden tasks = "morning", admin = "morning".
- notify_escalate: boolean. True for hard deadline tasks where a second closer-in notification makes sense (MOT, annual tasks, fixed-date deadlines). Recurring maintenance = false.

Return ONLY a valid JSON array. No markdown, no code fences, no commentary before or after.

Example with a dated deadline:
[{"title":"Book MOT","category":"Car","urgency":"soon","estimatedMinutes":15,"next_due":"2026-03-15","due_date":"2026-03-15","recurrence":"once a year","recurrence_rule":{"type":"annual","month":3,"day":15,"anchor":"schedule"},"notify_days_before":14,"notify_time_of_day":"morning","notify_escalate":true}]`

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

    const tasks = parseLifeWalkTasksFromModelText(textBlock.text)
    return NextResponse.json({ tasks })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message || "AI request failed" },
        { status: error.status ?? 502 },
      )
    }

    const message =
      error instanceof Error ? error.message : "Could not parse tasks"

    const isParseError =
      message.includes("JSON") ||
      message.includes("No valid tasks") ||
      message.includes("model response")

    return NextResponse.json(
      { error: isParseError ? "Could not parse tasks. Try again or shorten your narration." : message },
      { status: 500 },
    )
  }
}
