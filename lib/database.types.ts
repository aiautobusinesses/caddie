/**
 * Hand-written types aligned with supabase/schema.sql.
 * Replace with generated types (`supabase gen types`) when the CLI is wired up.
 */
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
      profiles: {
        Row: {
          id: string
          timezone: string
          onboarding_done: boolean
          last_care_offer_date: string | null
          created_at: string
        }
        Insert: {
          id: string
          timezone?: string
          onboarding_done?: boolean
          last_care_offer_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          timezone?: string
          onboarding_done?: boolean
          last_care_offer_date?: string | null
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
          notify_window: number | null
          notify_time_of_day: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate: boolean
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
          notify_window?: number | null
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate?: boolean
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
          notify_window?: number | null
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"] | null
          notify_escalate?: boolean
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
          recurrence_rule: Json | null
          next_due: string | null
          last_done_at: string | null
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
          recurrence_rule?: Json | null
          next_due?: string | null
          last_done_at?: string | null
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
          recurrence_rule?: Json | null
          next_due?: string | null
          last_done_at?: string | null
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
    Functions: Record<string, never>
    Enums: {
      thing_class: "obligation" | "project"
      task_source: "life_walk" | "manual" | "voice" | "photo"
      event_type: "done" | "edited" | "notified" | "offered" | "accepted" | "skipped" | "nudged_back" | "nudged_forward"
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
