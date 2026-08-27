import { createClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

export type AuthenticatedContext = {
  supabase: SupabaseClient<Database>
  user: User
  /** @deprecated Use getProfile() instead — eagerly null, fetched lazily. */
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null
  getProfile: () => Promise<Database["public"]["Tables"]["profiles"]["Row"] | null>
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const userId = user.id

  let cachedProfile: Database["public"]["Tables"]["profiles"]["Row"] | null | undefined =
    undefined

  async function getProfile(): Promise<Database["public"]["Tables"]["profiles"]["Row"] | null> {
    if (cachedProfile !== undefined) return cachedProfile
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
    cachedProfile = data ?? null
    return cachedProfile
  }

  return { supabase, user, profile: null, getProfile }
}
