/**
 * Supabase public env (browser-safe publishable key only).
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local.",
    )
  }
  return url
}

export function getSupabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add it to .env.local.",
    )
  }
  return key
}

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      "Missing ENCRYPTION_KEY. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and add it to .env.local.",
    )
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes).",
    )
  }
  return key
}

/** True when both URL and publishable key are set (safe for proxy skip in dev). */
/* v8 ignore next 3 */
export const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)
