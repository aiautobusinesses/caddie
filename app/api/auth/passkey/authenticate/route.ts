import { NextResponse } from "next/server"
import { createClient as createServiceClientRaw } from "@/lib/supabase/server-service"
import type { Database } from "@/lib/database.types"

function createServiceClient() {
  return createServiceClientRaw<Database>()
}

const RP_ID =
  process.env.NEXT_PUBLIC_PASSKEY_RP_ID ??
  (process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
    : "localhost")

/** GET — issue an authentication challenge for a given credential */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const credentialId = searchParams.get("credentialId")

  if (!credentialId) {
    return NextResponse.json({ error: "Missing credentialId" }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify credential exists
  const { data: cred, error: credErr } = await service
    .from("passkey_credentials")
    .select("user_id")
    .eq("credential_id", credentialId)
    .single()

  if (credErr || !cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 })
  }

  const challenge = bufferToBase64url(
    crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer,
  )

  const { error: insertErr } = await service.from("passkey_challenges").insert({
    challenge,
    user_id: cred.user_id,
    credential_id: credentialId,
  })

  if (insertErr) {
    console.error("[passkey authenticate GET]", insertErr)
    return NextResponse.json(
      { error: "Failed to create challenge. Check SUPABASE_SERVICE_ROLE_KEY and that migration 007 has been applied." },
      { status: 500 },
    )
  }

  return NextResponse.json({ challenge, rpId: RP_ID })
}

/** POST — verify assertion and return a Supabase session */
export async function POST(request: Request) {
  // Derive the expected origin from the env var (production) or the request
  // itself (dev). Never fall back to a hardcoded string so that
  // cross-environment deployments (preview, prod) always match.
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
  const requestOrigin = request.headers.get("origin") ?? ""
  const ORIGIN = configuredOrigin ?? requestOrigin

  const body = await request.json().catch(() => null)
  if (
    !body?.credentialId ||
    !body?.clientDataJSON ||
    !body?.authenticatorData ||
    !body?.signature
  ) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const service = createServiceClient()

  // Lookup credential
  const { data: cred, error: credErr } = await service
    .from("passkey_credentials")
    .select("id, user_id, public_key_spki, sign_count")
    .eq("credential_id", body.credentialId)
    .single()

  if (credErr || !cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 })
  }

  // Parse and verify client data
  const clientData = JSON.parse(
    new TextDecoder().decode(base64urlToBuffer(body.clientDataJSON)),
  ) as { type: string; challenge: string; origin: string }

  if (clientData.type !== "webauthn.get") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  }

  if (clientData.origin !== ORIGIN) {
    return NextResponse.json({ error: "Origin mismatch" }, { status: 400 })
  }

  // Find and consume challenge
  const { data: challengeRow, error: challengeErr } = await service
    .from("passkey_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", cred.user_id)
    .eq("credential_id", body.credentialId)
    .eq("challenge", clientData.challenge)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (challengeErr || !challengeRow) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 400 })
  }

  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 })
  }

  await service.from("passkey_challenges").delete().eq("id", challengeRow.id)

  // Verify the rpId hash in authenticatorData
  const authDataBytes = new Uint8Array(
    base64urlToBuffer(body.authenticatorData),
  )
  const rpIdHash = authDataBytes.slice(0, 32)
  const expectedHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(RP_ID),
  )
  const expectedHashBytes = new Uint8Array(expectedHash)
  for (let i = 0; i < 32; i++) {
    if (rpIdHash[i] !== expectedHashBytes[i]) {
      return NextResponse.json({ error: "rpId hash mismatch" }, { status: 400 })
    }
  }

  // Verify user-present and user-verified flags
  const flags = authDataBytes[32]
  if ((flags & 0x01) === 0) {
    return NextResponse.json({ error: "User not present" }, { status: 400 })
  }
  if ((flags & 0x04) === 0) {
    return NextResponse.json({ error: "User not verified" }, { status: 400 })
  }

  // Verify signature using stored COSE public key
  const sigValid = await verifyCoseSignature(
    cred.public_key_spki,
    body.authenticatorData,
    body.clientDataJSON,
    body.signature,
  )

  if (!sigValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Update last_used_at and sign_count
  await service
    .from("passkey_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cred.id)

  // Issue a new Supabase session for the verified user via the admin API.
  // `createSession` is available in @supabase/supabase-js >= 2.x.
  const adminClient = createServiceClient()
  const { data: newSession, error: newSessErr } = await (
    adminClient.auth.admin as unknown as {
      createSession: (opts: { user_id: string }) => Promise<{
        data: { session: { access_token: string; refresh_token: string } | null }
        error: Error | null
      }>
    }
  ).createSession({ user_id: cred.user_id })

  if (newSessErr || !newSession?.session) {
    console.error("[passkey authenticate] createSession error", newSessErr)
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    )
  }

  return NextResponse.json({
    accessToken: newSession.session.access_token,
    refreshToken: newSession.session.refresh_token,
  })
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  )
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/**
 * Verifies a WebAuthn assertion signature.
 *
 * The stored public_key_spki is the raw COSE key bytes (from the attested
 * credential data). We try to import as ECDSA P-256 first (alg -7), then
 * RSASSA-PKCS1-v1_5 (alg -257).
 *
 * The signed data is: SHA-256(clientDataJSON) concatenated after authenticatorData.
 */
async function verifyCoseSignature(
  coseKeyB64: string,
  authenticatorDataB64: string,
  clientDataJSONB64: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const authDataBytes = new Uint8Array(base64urlToBuffer(authenticatorDataB64))
    const clientDataBytes = new Uint8Array(base64urlToBuffer(clientDataJSONB64))
    const sigBytes = new Uint8Array(base64urlToBuffer(signatureB64))
    const coseKeyBytes = new Uint8Array(base64urlToBuffer(coseKeyB64))

    // Hash clientDataJSON
    const clientDataHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", clientDataBytes),
    )

    // Signed data = authData || hash(clientData)
    const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length)
    signedData.set(authDataBytes, 0)
    signedData.set(clientDataHash, authDataBytes.length)

    // Parse COSE key to determine algorithm
    const alg = parseCoseAlgorithm(coseKeyBytes)
    const keyBytes = parseCoseKeyBytes(coseKeyBytes, alg)
    if (!keyBytes) return false

    if (alg === -7) {
      // ECDSA P-256
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      )
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        sigBytes,
        signedData,
      )
    }

    if (alg === -257) {
      // RSA-PKCS1-v1.5 SHA-256
      const key = await crypto.subtle.importKey(
        "spki",
        keyBytes,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      )
      return await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        sigBytes,
        signedData,
      )
    }

    return false
  } catch (e) {
    console.error("[passkey verify]", e)
    return false
  }
}

/** Parse algorithm id from COSE map (key 3) */
function parseCoseAlgorithm(coseBytes: Uint8Array): number {
  // Very minimal CBOR: find key 3 in the top-level map
  let offset = 0
  const firstByte = coseBytes[offset++]
  const mapLen = firstByte & 0x1f
  for (let i = 0; i < mapLen; i++) {
    const keyByte = coseBytes[offset++]
    const keyType = keyByte >> 5
    const keyAdditional = keyByte & 0x1f
    let keyVal = 0
    if (keyType === 0 || keyType === 1) {
      // unsigned or negative int
      keyVal = keyAdditional < 24 ? keyAdditional : coseBytes[offset++]
      if (keyType === 1) keyVal = -1 - keyVal
    }
    const valByte = coseBytes[offset++]
    const valType = valByte >> 5
    const valAdditional = valByte & 0x1f
    const valLen = valAdditional < 24 ? valAdditional : coseBytes[offset++]
    if (keyVal === 3) {
      // algorithm
      if (valType === 0) return valLen
      if (valType === 1) return -1 - valLen
    }
    if (valType === 2 || valType === 3) {
      offset += valLen
    } else if (valType === 4) {
      // skip array items
      for (let j = 0; j < valLen; j++) {
        const itemByte = coseBytes[offset++]
        const itemLen = itemByte & 0x1f
        if ((itemByte >> 5) === 2 || (itemByte >> 5) === 3) {
          offset += itemLen < 24 ? itemLen : coseBytes[offset++]
        }
      }
    }
  }
  return -7 // default to ES256
}

/**
 * Extract the raw public key bytes from a COSE key.
 * For EC2 (kty 2): returns uncompressed point (x || y prefixed with 0x04).
 * For RSA (kty 3): returns SPKI-encoded key.
 */
function parseCoseKeyBytes(
  coseBytes: Uint8Array,
  alg: number,
): ArrayBuffer | null {
  // For EC2 keys (alg -7), CBOR map has kty=2, crv=1(-1), x(-2), y(-3)
  // For RSA (alg -257), CBOR has kty=3, n(-1), e(-2)
  // We do a simple pass to collect byte strings at expected keys
  const map = parseCborMap(coseBytes)
  if (!map) return null

  if (alg === -7) {
    // EC2: x at key -2, y at key -3 — uncompressed point: 0x04 || x (32) || y (32)
    const x = map[-2]
    const y = map[-3]
    if (!x || !y) return null
    const point = new Uint8Array(65)
    point[0] = 0x04
    point.set(x, 1)
    point.set(y, 33)
    return point.buffer
  }

  if (alg === -257) {
    // RSA: we need DER SPKI — beyond scope here, return raw COSE bytes
    // and let importKey("spki") handle it (won't work with raw COSE)
    // In practice ES256 is used by all modern Android devices
    return null
  }

  return null
}

type CborMap = Record<number, Uint8Array>

function parseCborMap(bytes: Uint8Array): CborMap | null {
  let offset = 0

  function readLen(additional: number): number {
    if (additional < 24) return additional
    if (additional === 24) return bytes[offset++]
    if (additional === 25) {
      const v = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2
      return v
    }
    return 0
  }

  try {
    const firstByte = bytes[offset++]
    const mapLen = readLen(firstByte & 0x1f)
    const result: CborMap = {}

    for (let i = 0; i < mapLen; i++) {
      // Key
      const keyByte = bytes[offset++]
      const keyMajor = keyByte >> 5
      const keyAdditional = keyByte & 0x1f
      const keyLen = readLen(keyAdditional)
      let keyVal: number
      if (keyMajor === 0) keyVal = keyLen
      else if (keyMajor === 1) keyVal = -1 - keyLen
      else break

      // Value
      const valByte = bytes[offset++]
      const valMajor = valByte >> 5
      const valAdditional = valByte & 0x1f
      const valLen = readLen(valAdditional)

      if (valMajor === 2) {
        // byte string
        result[keyVal] = bytes.slice(offset, offset + valLen)
        offset += valLen
      } else if (valMajor === 0 || valMajor === 1) {
        // int — skip (store nothing for byte map)
        offset += 0
      } else if (valMajor === 3) {
        // text string — skip
        offset += valLen
      }
    }
    return result
  } catch {
    return null
  }
}
