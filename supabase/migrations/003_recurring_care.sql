-- Migration 003: recurring care — entities, care_plans, care_events.
-- Adds the third class alongside obligations and projects.
-- Safe to run against existing data — no existing tables are modified.

-- ── Enums ─────────────────────────────────────────────────────────────────────

create type care_plan_source as enum ('generated', 'user');

create type care_event_type as enum ('offered', 'done', 'not_done', 'plan_edited');

-- ── Entities ──────────────────────────────────────────────────────────────────

create table entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),

  name        text not null,           -- "Fiddle-leaf fig", "Green bin"
  kind        text not null,           -- "plant", "bin", "appliance" — display only
  location    text,                    -- "front room", "kitchen" — grouping key

  archived_at timestamptz
);

alter table entities enable row level security;
create policy "Users can manage their own entities"
  on entities for all
  using (auth.uid() = user_id);

create index entities_user_id on entities (user_id);
create index entities_user_location on entities (user_id, location);


-- ── Care plans ────────────────────────────────────────────────────────────────

create table care_plans (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references entities on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  created_at      timestamptz not null default now(),

  action          text not null,        -- "Water", "Feed", "Put out" — grouping key
  -- intervals: month number (1–12) → days between care actions
  -- e.g. {"1": 21, "2": 21, "3": 14, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 7, "10": 14, "11": 21, "12": 21}
  intervals       jsonb not null,

  tolerance_days  int not null default 2,   -- how early this can be done without harm
  overdue_days    int not null default 7,   -- days past next_due before genuinely overdue

  last_done_at    timestamptz,
  next_due_at     date,                     -- derived; recomputed on completion

  source          care_plan_source not null default 'generated',
  archived_at     timestamptz
);

alter table care_plans enable row level security;
create policy "Users can manage their own care plans"
  on care_plans for all
  using (auth.uid() = user_id);

create index care_plans_entity_id   on care_plans (entity_id);
create index care_plans_user_due    on care_plans (user_id, next_due_at);
create index care_plans_user_action on care_plans (user_id, action);


-- ── Care events ───────────────────────────────────────────────────────────────

create table care_events (
  id            uuid primary key default gen_random_uuid(),
  care_plan_id  uuid not null references care_plans on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  created_at    timestamptz not null default now(),

  type          care_event_type not null
);

alter table care_events enable row level security;
create policy "Users can manage their own care events"
  on care_events for all
  using (auth.uid() = user_id);

create index care_events_plan_id    on care_events (care_plan_id);
create index care_events_user_date  on care_events (user_id, created_at desc);


-- ── Once-daily cap: track last care offer date ────────────────────────────────
-- Stored in profiles as a date column so no extra table is needed.

alter table profiles
  add column if not exists last_care_offer_date date;
