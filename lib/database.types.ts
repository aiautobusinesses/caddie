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
          created_at: string
        }
        Insert: {
          id: string
          timezone?: string
          onboarding_done?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          timezone?: string
          onboarding_done?: boolean
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          title: string
          category: string
          space: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          energy: Database["public"]["Enums"]["task_energy"]
          estimated_minutes: number | null
          due_date: string | null
          next_due: string | null
          last_done_at: string | null
          recurrence_text: string | null
          recurrence_rule: Json | null
          context_tags: Json | null
          source: Database["public"]["Enums"]["task_source"]
          status: Database["public"]["Enums"]["task_status"]
          visibility: Database["public"]["Enums"]["task_visibility"]
          chunked: boolean
          snooze_budget: number
          notify_days_before: number
          notify_time_of_day: Database["public"]["Enums"]["notify_time_of_day"]
          notify_escalate: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          category: string
          space?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          energy?: Database["public"]["Enums"]["task_energy"]
          estimated_minutes?: number | null
          due_date?: string | null
          next_due?: string | null
          last_done_at?: string | null
          recurrence_text?: string | null
          recurrence_rule?: Json | null
          context_tags?: Json | null
          source?: Database["public"]["Enums"]["task_source"]
          status?: Database["public"]["Enums"]["task_status"]
          visibility?: Database["public"]["Enums"]["task_visibility"]
          chunked?: boolean
          snooze_budget?: number
          notify_days_before?: number
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"]
          notify_escalate?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          category?: string
          space?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          energy?: Database["public"]["Enums"]["task_energy"]
          estimated_minutes?: number | null
          due_date?: string | null
          next_due?: string | null
          last_done_at?: string | null
          recurrence_text?: string | null
          recurrence_rule?: Json | null
          context_tags?: Json | null
          source?: Database["public"]["Enums"]["task_source"]
          status?: Database["public"]["Enums"]["task_status"]
          visibility?: Database["public"]["Enums"]["task_visibility"]
          chunked?: boolean
          snooze_budget?: number
          notify_days_before?: number
          notify_time_of_day?: Database["public"]["Enums"]["notify_time_of_day"]
          notify_escalate?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_events: {
        Row: {
          id: string
          task_id: string
          user_id: string
          event_type: Database["public"]["Enums"]["event_type"]
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          event_type: Database["public"]["Enums"]["event_type"]
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      task_priority: "high" | "medium" | "low"
      task_energy: "low" | "medium" | "high"
      task_source: "life_walk" | "manual" | "voice" | "photo"
      task_status: "active" | "snoozed" | "archived"
      task_visibility: "personal" | "family"
      event_type: "done" | "skipped" | "snoozed" | "edited" | "notified"
      notify_time_of_day: "morning" | "afternoon" | "evening"
    }
    CompositeTypes: Record<string, never>
  }
}
