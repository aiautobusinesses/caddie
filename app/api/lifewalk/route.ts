import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import { resolveAiGateway } from "@/lib/ai-gateway"
import { extractThingsFromNarration } from "@/lib/lifewalk-parse"

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const gateway = await resolveAiGateway(auth.supabase, auth.user.id)
  if (gateway.error !== null) {
    return NextResponse.json({ error: gateway.error }, { status: 503 })
  }

  try {
    const things = await extractThingsFromNarration(gateway.client, transcript)
    return NextResponse.json({ things })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message || "AI request failed" },
        { status: error.status ?? 502 },
      )
    }
    const message = error instanceof Error ? error.message : "Could not parse things"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
