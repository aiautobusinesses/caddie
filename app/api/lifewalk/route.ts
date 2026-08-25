import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { parseLifeWalkThingsFromModelText } from "@/lib/lifewalk-parse"
import { LIFEWALK_MODEL, LIFEWALK_EXTRACTION_PROMPT } from "@/lib/lifewalk-prompt"

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
      system: LIFEWALK_EXTRACTION_PROMPT,
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
