"use client"

/**
 * WebAuthn / Passkey helpers (client-side only).
 *
 * Architecture:
 *  - On first login the user is offered to enroll a passkey (biometric).
 *  - Registration stores the credential public key on the server.
 *  - On subsequent app opens, if the Supabase session is absent/expired, the
 *    client calls authenticate() which triggers the native biometric prompt.
 *  - On success the server verifies the assertion and returns a new Supabase
 *    session via a short-lived exchange token.
 */

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  )
}

/** Returns the stored credential id (base64url) if one has been enrolled. */
export function getStoredCredentialId(): string | null {
  try {
    return localStorage.getItem("caddie:passkey-id")
  } catch {
    return null
  }
}

export function storeCredentialId(id: string) {
  try {
    localStorage.setItem("caddie:passkey-id", id)
  } catch {
    // ignore — storage blocked
  }
}

export function clearCredentialId() {
  try {
    localStorage.removeItem("caddie:passkey-id")
  } catch {
    // ignore
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// ── Registration ─────────────────────────────────────────────────────────────

interface RegisterResult {
  ok: true
  credentialId: string
}
interface RegisterError {
  ok: false
  error: string
}

/**
 * Register a passkey for the currently signed-in user.
 * Calls /api/auth/passkey/register to get a challenge, then creates a
 * credential and sends the attestation back for storage.
 */
export async function registerPasskey(): Promise<
  RegisterResult | RegisterError
> {
  try {
    // 1. Get challenge from server
    const challengeRes = await fetch("/api/auth/passkey/register", {
      method: "GET",
      credentials: "include",
    })
    if (!challengeRes.ok) {
      const { error } = await challengeRes.json().catch(() => ({}))
      return { ok: false, error: error ?? "Failed to get registration challenge" }
    }
    const { challenge, userId, userName, rpId } = await challengeRes.json()

    // 2. Create credential (triggers biometric prompt)
    const credential = await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId, name: "Caddie" },
        user: {
          id: base64urlToBuffer(userId),
          name: userName,
          displayName: userName,
        },
        challenge: base64urlToBuffer(challenge),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },  // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        timeout: 60000,
        attestation: "none",
      },
    }) as PublicKeyCredential | null

    if (!credential) return { ok: false, error: "No credential returned" }

    const response = credential.response as AuthenticatorAttestationResponse
    const credentialId = bufferToBase64url(credential.rawId)

    // 3. Send attestation to server for storage
    const storeRes = await fetch("/api/auth/passkey/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentialId,
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        attestationObject: bufferToBase64url(response.attestationObject),
      }),
    })

    if (!storeRes.ok) {
      const { error } = await storeRes.json().catch(() => ({}))
      return { ok: false, error: error ?? "Failed to store credential" }
    }

    storeCredentialId(credentialId)
    return { ok: true, credentialId }
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      return { ok: false, error: "Biometric prompt was cancelled" }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Registration failed",
    }
  }
}

// ── Authentication ────────────────────────────────────────────────────────────

interface AuthResult {
  ok: true
  accessToken: string
  refreshToken: string
}
interface AuthError {
  ok: false
  error: string
}

/**
 * Authenticate with a passkey (biometric prompt).
 * On success the server returns a Supabase access + refresh token pair.
 */
export async function authenticateWithPasskey(): Promise<
  AuthResult | AuthError
> {
  const credentialId = getStoredCredentialId()
  if (!credentialId) return { ok: false, error: "No passkey enrolled" }

  try {
    // 1. Get challenge from server
    const challengeRes = await fetch(
      `/api/auth/passkey/authenticate?credentialId=${encodeURIComponent(credentialId)}`,
      { credentials: "include" },
    )
    if (!challengeRes.ok) {
      const { error } = await challengeRes.json().catch(() => ({}))
      return {
        ok: false,
        error: error ?? "Failed to get authentication challenge",
      }
    }
    const { challenge, rpId } = await challengeRes.json()

    // 2. Get assertion (triggers biometric prompt)
    const credential = await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: base64urlToBuffer(challenge),
        allowCredentials: [
          { type: "public-key", id: base64urlToBuffer(credentialId) },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!credential) return { ok: false, error: "No credential returned" }

    const response = credential.response as AuthenticatorAssertionResponse
    const assertionCredentialId = bufferToBase64url(credential.rawId)

    // 3. Send assertion to server for verification
    const verifyRes = await fetch("/api/auth/passkey/authenticate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentialId: assertionCredentialId,
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        authenticatorData: bufferToBase64url(response.authenticatorData),
        signature: bufferToBase64url(response.signature),
      }),
    })

    if (!verifyRes.ok) {
      const { error } = await verifyRes.json().catch(() => ({}))
      return { ok: false, error: error ?? "Authentication failed" }
    }

    const { accessToken, refreshToken } = await verifyRes.json()
    return { ok: true, accessToken, refreshToken }
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      return { ok: false, error: "Biometric prompt was cancelled" }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Authentication failed",
    }
  }
}
