// To regenerate: supabase gen types typescript --local > lib/database.types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      passkey_credentials: {
        Row: {
          id: string
          user_id: string
          credential_id: string
          public_key_spki: string
          sign_count: number
          aaguid: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          credential_id: string
          public_key_spki: string
          sign_count?: number
          aaguid?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          credential_id?: string
          public_key_spki?: string
          sign_count?: number
          aaguid?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      passkey_challenges: {
        Row: {
          id: string
          challenge: string
          user_id: string | null
          credential_id: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          challenge: string
          user_id?: string | null
          credential_id?: string | null
          expires_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          challenge?: string
          user_id?: string | null
          credential_id?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          timezone: string
          onboarding_done: boolean
          account_tier: Database["public"]["Enums"]["account_tier"]
          /** Raw key — server-side only; never returned to clients. */
          anthropic_api_key: string | null
          last_care_offer_date: string | null
          created_at: string
        }
        Insert: {
          id: string
          timezone?: string
          onboarding_done?: boolean
          account_tier?: Database["public"]["Enums"]["account_tier"]
          anthropic_api_key?: string | null
          last_care_offer_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          timezone?: string
          onboarding_done?: boolean
          account_tier?: Database["public"]["Enums"]["account_tier"]
          anthropic_api_key?: string | null
          last_care_offer_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          id: string
          user_id: string
          provider: string
          token: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          token?: string
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          token?: string
          label?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          id: string
          email: string
          invited_by: string | null
          account_tier: Database["public"]["Enums"]["account_tier"]
          accepted_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          invited_by?: string | null
          account_tier?: Database["public"]["Enums"]["account_tier"]
          accepted_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          invited_by?: string | null
          account_tier?: Database["public"]["Enums"]["account_tier"]
          accepted_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      things: {
        Row: {
          id: string
          user_id: string
          name: string
          class: Database["public"]["Enums"]["thing_class"]
          domain: string | null
          notify_window: number | null
          notify_time_of_day: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate: boolean
          due_date: string | null
          source: Database["public"]["Enums"]["task_source"]
          live_step_id: string | null
          started_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          class?: Database["public"]["Enums"]["thing_class"]
          domain?: string | null
          notify_window?: number | null
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate?: boolean
          due_date?: string | null
          source?: Database["public"]["Enums"]["task_source"]
          live_step_id?: string | null
          started_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          class?: Database["public"]["Enums"]["thing_class"]
          domain?: string | null
          notify_window?: number | null
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate?: boolean
          due_date?: string | null
          source?: Database["public"]["Enums"]["task_source"]
          live_step_id?: string | null
          started_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      steps: {
        Row: {
          id: string
          thing_id: string
          user_id: string
          name: string
          step_order: number
          done: boolean
          done_at: string | null
          band: Database["public"]["Enums"]["step_band"]
          mode: Database["public"]["Enums"]["step_mode"]
          shape: Database["public"]["Enums"]["step_shape"]
          needs_know_how: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          thing_id: string
          user_id: string
          name: string
          step_order: number
          done?: boolean
          done_at?: string | null
          band?: Database["public"]["Enums"]["step_band"]
          mode?: Database["public"]["Enums"]["step_mode"]
          shape?: Database["public"]["Enums"]["step_shape"]
          needs_know_how?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          thing_id?: string
          user_id?: string
          name?: string
          step_order?: number
          done?: boolean
          done_at?: string | null
          band?: Database["public"]["Enums"]["step_band"]
          mode?: Database["public"]["Enums"]["step_mode"]
          shape?: Database["public"]["Enums"]["step_shape"]
          needs_know_how?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      step_events: {
        Row: {
          id: string
          step_id: string
          thing_id: string
          user_id: string
          event_type: Database["public"]["Enums"]["event_type"]
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          step_id: string
          thing_id: string
          user_id: string
          event_type: Database["public"]["Enums"]["event_type"]
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          step_id?: string
          thing_id?: string
          user_id?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          subscription: Json
          endpoint: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscription: Json
          endpoint: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscription?: Json
          endpoint?: string
          created_at?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          id: string
          user_id: string
          created_at: string
          name: string
          kind: string
          location: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          name: string
          kind: string
          location?: string | null
          archived_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          name?: string
          kind?: string
          location?: string | null
          archived_at?: string | null
        }
        Relationships: []
      }
      care_plans: {
        Row: {
          id: string
          entity_id: string
          user_id: string
          created_at: string
          action: string
          intervals: Json
          tolerance_days: number
          overdue_days: number
          last_done_at: string | null
          next_due_at: string | null
          source: Database["public"]["Enums"]["care_plan_source"]
          archived_at: string | null
        }
        Insert: {
          id?: string
          entity_id: string
          user_id: string
          created_at?: string
          action: string
          intervals: Json
          tolerance_days?: number
          overdue_days?: number
          last_done_at?: string | null
          next_due_at?: string | null
          source?: Database["public"]["Enums"]["care_plan_source"]
          archived_at?: string | null
        }
        Update: {
          id?: string
          entity_id?: string
          user_id?: string
          created_at?: string
          action?: string
          intervals?: Json
          tolerance_days?: number
          overdue_days?: number
          last_done_at?: string | null
          next_due_at?: string | null
          source?: Database["public"]["Enums"]["care_plan_source"]
          archived_at?: string | null
        }
        Relationships: []
      }
      care_events: {
        Row: {
          id: string
          care_plan_id: string
          user_id: string
          created_at: string
          type: Database["public"]["Enums"]["care_event_type"]
        }
        Insert: {
          id?: string
          care_plan_id: string
          user_id: string
          created_at?: string
          type: Database["public"]["Enums"]["care_event_type"]
        }
        Update: {
          id?: string
          care_plan_id?: string
          user_id?: string
          created_at?: string
          type?: Database["public"]["Enums"]["care_event_type"]
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      insert_thing_with_steps: {
        Args: { p_user_id: string; p_name: string; p_class: string; p_domain: string | null; p_due_date: string | null; p_notify_window: number | null; p_notify_time_of_day: string | null; p_notify_escalate: boolean; p_source: string; p_steps: Json }
        Returns: string  // uuid
      }
      mark_thing_done: {
        Args: { p_thing_id: string; p_user_id: string }
        Returns: Json  // { thing_complete: boolean; thing_name: string | null }
      }
      record_step_event_done: {
        Args: { p_step_id: string; p_user_id: string; p_metadata: Json }
        Returns: Json  // { ok: true }
      }
      prepend_lookup_step: {
        Args: { p_thing_id: string; p_user_id: string }
        Returns: Json  // { step_id: string }
      }
      insert_entity_with_care_plan: {
        Args: { p_user_id: string; p_name: string; p_kind: string; p_location: string | null; p_action: string; p_intervals: Json; p_tolerance_days: number; p_overdue_days: number; p_next_due_at: string }
        Returns: Json  // { entity_id: string; plan_id: string }
      }
      accept_invite: {
        Args: { p_user_id: string; p_email: string }
        Returns: string | null  // account_tier or null
      }
      report_care_group: {
        Args: { p_user_id: string; p_plan_ids: string[]; p_done_ids: string[] }
        Returns: Json  // { ok: true }
      }
    }
    Enums: {
      account_tier: "standard" | "advanced"
      thing_class: "obligation" | "project"
      task_source: "life_walk" | "manual" | "voice" | "photo"
      event_type: "done" | "edited" | "notified" | "offered" | "accepted" | "skipped" | "nudged_back" | "nudged_forward" | "stopped" | "why"
      notify_time_of_day: "morning" | "afternoon" | "evening"
      step_band: "short" | "sitting" | "run"
      step_mode: "thinking" | "doing"
      step_shape: "clean" | "bleeds"
      care_plan_source: "generated" | "user"
      care_event_type: "offered" | "done" | "not_done" | "plan_edited"
    }
    CompositeTypes: Record<string, never>
  }
}
