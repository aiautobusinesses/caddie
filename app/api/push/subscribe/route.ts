import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedContext } from "@/lib/api/session"
import type { Json } from "@/lib/database.types"

type PushSubscriptionPayload = {
  endpoint: string
  keys?: {
    p256dh: string
    auth: string
  }
  expirationTime?: number | null
}

function isPushSubscriptionPayload(value: unknown): value is PushSubscriptionPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "endpoint" in value &&
    typeof (value as PushSubscriptionPayload).endpoint === "string" &&
    (value as PushSubscriptionPayload).endpoint.length > 0
  )
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedContext()
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isPushSubscriptionPayload(body)) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 })
  }

  const { supabase, user } = auth

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      subscription: body as Json,
      endpoint: body.endpoint,
    },
    { onConflict: "user_id,endpoint" },
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
