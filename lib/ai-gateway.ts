/**
 * Server-side AI gateway.
 *
 * Resolves the current user's Anthropic API key from their profile and
 * constructs an Anthropic client bound to that key. All AI-powered routes
 * go through this module — no route reads process.env.ANTHROPIC_API_KEY
 * directly for per-user features.
 *
 * The key is never returned to the client; this module only runs server-side.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { decrypt, isEncrypted } from "@/lib/encryption"

export type AiGatewayResult =
  | { client: Anthropic; error: null }
  | { client: null; error: string }

/**
 * Resolves the Anthropic client for `userId` by reading the stored key from
 * the `profiles` table. Returns an error descriptor when the user has not
 * configured their key.
 */
export async function resolveAiGateway(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AiGatewayResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("anthropic_api_key")
    .eq("id", userId)
    .single()

  if (error) {
    return { client: null, error: "Could not retrieve AI configuration." }
  }

  const storedValue = data?.anthropic_api_key?.trim()
  if (!storedValue) {
    return { client: null, error: "No Anthropic API key configured. Add your key in Settings." }
  }

  // Decrypt if stored in encrypted format; fall through for legacy plaintext keys
  // (legacy keys will be re-encrypted the next time the user saves their key).
  const key = isEncrypted(storedValue) ? decrypt(storedValue) : storedValue

  return { client: new Anthropic({ apiKey: key }), error: null }
}
