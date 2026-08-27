import { NextResponse } from "next/server"
import { createClient as createServiceClientRaw } from "@/lib/supabase/server-service"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/database.types"

function createServiceClient() {
  return createServiceClientRaw<Database>()
}

const RP_ID =
  process.env.NEXT_PUBLIC_PASSKEY_RP_ID ??
  (process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
    : "localhost")

/** GET — issue a registration challenge for the signed-in user */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const challenge = bufferToBase64url(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer)
  const userId = bufferToBase64url(
    new TextEncoder().encode(user.id).buffer as ArrayBuffer,
  )

  // Store challenge server-side
  const service = createServiceClient()
  const { error: insertErr } = await service.from("passkey_challenges").insert({
    challenge,
    user_id: user.id,
  })

  if (insertErr) {
    console.error("[passkey register GET]", insertErr)
    return NextResponse.json(
      { error: "Failed to create challenge. Check SUPABASE_SERVICE_ROLE_KEY and that migration 007 has been applied." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    challenge,
    userId,
    userName: user.email ?? user.id,
    rpId: RP_ID,
  })
}

/** POST — verify attestation and store the credential */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.credentialId || !body?.clientDataJSON || !body?.attestationObject) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify the challenge
  const clientData = JSON.parse(
    new TextDecoder().decode(base64urlToBuffer(body.clientDataJSON)),
  ) as { type: string; challenge: string; origin: string }

  if (clientData.type !== "webauthn.create") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  }

  const { data: challengeRow, error: challengeErr } = await service
    .from("passkey_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", user.id)
    .eq("challenge", clientData.challenge)
    .is("credential_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (challengeErr || !challengeRow) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 400 })
  }

  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 })
  }

  // Clean up used challenge
  await service
    .from("passkey_challenges")
    .delete()
    .eq("id", challengeRow.id)

  // Parse the attestation object to extract the public key.
  // For "none" attestation we only need the authData from the CBOR-encoded object.
  // We do a minimal CBOR decode to get the authData, then extract the public key.
  const publicKeyCose = await extractPublicKeyFromAttestation(
    body.attestationObject,
  )
  if (!publicKeyCose) {
    return NextResponse.json(
      { error: "Could not extract public key" },
      { status: 400 },
    )
  }

  // Upsert credential — one passkey per user
  const { error: storeErr } = await service
    .from("passkey_credentials")
    .upsert(
      {
        user_id: user.id,
        credential_id: body.credentialId,
        public_key_spki: publicKeyCose,
        sign_count: 0,
      },
      { onConflict: "user_id" },
    )

  if (storeErr) {
    console.error("[passkey register]", storeErr)
    return NextResponse.json({ error: "Failed to store credential" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

/**
 * Minimal CBOR decode to extract the COSE public key from the attestation.
 * We store the raw COSE bytes (base64url) — the authenticate route will use
 * the Web Crypto API with the imported key for signature verification.
 *
 * The authData layout (from §6.1 of the WebAuthn spec):
 *   [32 bytes rpIdHash][1 byte flags][4 bytes signCount]
 *   [16 bytes aaguid][2 bytes credIdLen][N bytes credId][COSE key...]
 */
async function extractPublicKeyFromAttestation(
  attestationObjectB64: string,
): Promise<string | null> {
  try {
    const bytes = new Uint8Array(base64urlToBuffer(attestationObjectB64))
    // Minimal CBOR map decoder — just enough to get "authData" key
    const authData = cborGetAuthData(bytes)
    if (!authData) return null

    // authData offsets
    let offset = 32 + 1 + 4 // rpIdHash + flags + signCount

    const flags = authData[32]
    const hasAttestedCredData = (flags & 0x40) !== 0
    if (!hasAttestedCredData) return null

    offset += 16 // aaguid
    const credIdLen = (authData[offset] << 8) | authData[offset + 1]
    offset += 2 + credIdLen

    // Rest is COSE key
    const coseKey = authData.slice(offset)
    return bufferToBase64url(coseKey.buffer as ArrayBuffer)
  } catch {
    return null
  }
}

/**
 * Extremely minimal CBOR parser — only handles the top-level map of the
 * attestationObject to extract the "authData" byte string.
 */
function cborGetAuthData(bytes: Uint8Array): Uint8Array | null {
  let offset = 0

  function readByte() {
    return bytes[offset++]
  }

  function readUint(additional: number): number {
    if (additional < 24) return additional
    if (additional === 24) return readByte()
    if (additional === 25) {
      const v = (readByte() << 8) | readByte()
      return v
    }
    return 0
  }

  function readItem(): unknown {
    const byte = readByte()
    const type = byte >> 5
    const additional = byte & 0x1f
    const len = readUint(additional)

    if (type === 2) {
      // byte string
      const buf = bytes.slice(offset, offset + len)
      offset += len
      return buf
    }
    if (type === 3) {
      // text string
      const buf = bytes.slice(offset, offset + len)
      offset += len
      return new TextDecoder().decode(buf)
    }
    if (type === 5) {
      // map
      const map: Record<string, unknown> = {}
      for (let i = 0; i < len; i++) {
        const key = readItem() as string
        const val = readItem()
        map[key] = val
      }
      return map
    }
    if (type === 4) {
      // array
      const arr = []
      for (let i = 0; i < len; i++) arr.push(readItem())
      return arr
    }
    return null
  }

  try {
    const top = readItem() as Record<string, unknown>
    const authData = top["authData"]
    if (authData instanceof Uint8Array) return authData
    return null
  } catch {
    return null
  }
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}
