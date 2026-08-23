-- Migration: replace tasks/task_events with things/steps/step_events.
-- Safe to run against a database with no meaningful task data.
-- profiles and push_subscriptions are untouched.

-- ── Drop old tables ──────────────────────────────────────────────────────────

drop table if exists task_events cascade;
drop table if exists tasks cascade;

-- Drop old enums that are no longer used
drop type if exists task_priority cascade;
drop type if exists task_energy cascade;
drop type if exists task_status cascade;
drop type if exists task_visibility cascade;
-- task_source, event_type, notify_time_of_day are recreated below

drop type if exists task_source cascade;
drop type if exists event_type cascade;
drop type if exists notify_time_of_day cascade;


-- ── New enums ────────────────────────────────────────────────────────────────

create type thing_class        as enum ('obligation', 'project');
create type task_source        as enum ('life_walk', 'manual', 'voice', 'photo');
create type event_type         as enum ('done', 'edited', 'notified');
create type notify_time_of_day as enum ('morning', 'afternoon', 'evening');


-- ── Things ───────────────────────────────────────────────────────────────────

create table things (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,

  name               text not null,
  class              thing_class not null default 'project',

  notify_window      int,
  notify_time_of_day notify_time_of_day,
  notify_escalate    bool not null default false,

  source             task_source not null default 'life_walk',

  live_step_id       uuid,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table things enable row level security;
create policy "Users can manage their own things"
  on things for all
  using (auth.uid() = user_id);

create index things_user_id on things (user_id);


-- ── Steps ────────────────────────────────────────────────────────────────────

create table steps (
  id                uuid primary key default gen_random_uuid(),
  thing_id          uuid not null references things on delete cascade,
  user_id           uuid not null references auth.users on delete cascade,

  name              text not null,
  step_order        int not null,

  done              bool not null default false,
  done_at           timestamptz,

  ends_cleanly      bool not null default true,
  estimated_minutes int,

  recurrence_rule   jsonb,
  next_due          date,
  last_done_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table steps enable row level security;
create policy "Users can manage their own steps"
  on steps for all
  using (auth.uid() = user_id);

create index steps_thing_id       on steps (thing_id);
create index steps_user_next_due  on steps (user_id, next_due);


-- ── Add live_step_id FK (deferred to avoid circular dependency) ───────────────

alter table things
  add constraint things_live_step_id_fkey
  foreign key (live_step_id) references steps (id)
  on delete set null
  deferrable initially deferred;


-- ── Step events ──────────────────────────────────────────────────────────────

create table step_events (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references steps on delete cascade,
  thing_id    uuid not null references things on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  event_type  event_type not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table step_events enable row level security;
create policy "Users can manage their own step events"
  on step_events for all
  using (auth.uid() = user_id);

create index step_events_step_id       on step_events (step_id);
create index step_events_user_created  on step_events (user_id, created_at desc);


-- ── updated_at trigger ───────────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger things_updated_at
  before update on things
  for each row execute procedure touch_updated_at();

create trigger steps_updated_at
  before update on steps
  for each row execute procedure touch_updated_at();
