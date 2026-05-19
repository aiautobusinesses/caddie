import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { transcript } = await req.json()

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 })
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `You are helping someone manage their life admin. They have just narrated a walk around their home and life, describing things they notice that need doing.

Extract every distinct task from this narration. For each task return:
- title: a clear, plain-English description of what needs doing (not too formal, keep their voice)
- category: one of Home, Garden, Car, Admin, Family, Health, Finance, Other
- urgency: one of "now" (urgent/time-sensitive), "soon" (next week or two), "someday" (no rush)
- estimatedMinutes: rough number if you can infer it, otherwise null
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

Return ONLY a JSON array of tasks, no explanation. Example:
[{"title":"Water the houseplants","category":"Home","urgency":"soon","estimatedMinutes":10,"recurrence":"every 3-4 days in summer / every 12-14 days in winter","recurrence_rule":{"type":"seasonal","summerDays":4,"winterDays":13,"anchor":"completion"},"notify_days_before":0,"notify_time_of_day":"morning","notify_escalate":false},{"title":"Book MOT","category":"Car","urgency":"soon","estimatedMinutes":10,"recurrence":"once a year","recurrence_rule":{"type":"annual","month":3,"day":15,"anchor":"schedule"},"notify_days_before":14,"notify_time_of_day":"morning","notify_escalate":true}]

Narration:
${transcript}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== "text") {
    return NextResponse.json({ error: "Unexpected response" }, { status: 500 })
  }

  try {
    const cleaned = content.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const tasks = JSON.parse(cleaned)
    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ error: "Could not parse tasks" }, { status: 500 })
  }
}
