import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

export async function acceptInvite(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null | undefined,
) {
  if (!email?.trim()) return null

  const { data: tier, error } = await supabase.rpc("accept_invite", {
    p_user_id: userId,
    p_email: email.trim(),
  })

  if (error || tier === null) {
    return null
  }

  return { account_tier: tier as Database["public"]["Enums"]["account_tier"] }
}
