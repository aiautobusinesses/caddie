import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getSupabaseUrl } from "@/lib/env"

/**
 * Service-role Supabase client. Bypasses RLS — use only in server-side
 * routes that perform their own auth check (e.g. webhook endpoints).
 * Never expose to the browser.
 */
export function createClient<TDatabase = unknown>() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local.")
  }
  return createSupabaseClient<TDatabase>(getSupabaseUrl(), serviceKey, {
    auth: { persistSession: false },
  })
}
