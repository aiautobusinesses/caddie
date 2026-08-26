-- Profiles (extends Supabase auth.users)
create table profiles (
  id              uuid primary key references auth.users on delete cascade,
  timezone        text not null default 'Europe/London',
  onboarding_done bool not null default false,
  created_at      timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles select own"
  on profiles for select
  using (auth.uid() = id);

create policy "Profiles insert own"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Profiles update own"
  on profiles for update
  using (auth.uid() = id);

create policy "Profiles delete own"
  on profiles for delete
  using (auth.uid() = id);

-- Private schema — not exposed via PostgREST, so not callable via /rest/v1/rpc/
create schema if not exists internal;

-- Auto-create profile on signup (in internal schema to prevent direct RPC calls)
create or replace function internal.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function internal.handle_new_user();


-- Enums
create type thing_class  as enum ('obligation', 'project');
create type event_type   as enum ('done', 'edited', 'notified');
create type task_source  as enum ('life_walk', 'manual', 'voice', 'photo');
create type notify_time_of_day as enum ('morning', 'afternoon', 'evening');


-- Things
-- live_step_id is set after steps are inserted; FK added below to avoid circular dependency.
create table things (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,

  name            text not null,
  class           thing_class not null default 'project',

  -- obligations only
  notify_window   int,               -- days before next_due to first notify
  notify_time_of_day notify_time_of_day,
  notify_escalate bool not null default false,

  source          task_source not null default 'life_walk',

  live_step_id    uuid,              -- FK constraint added after steps table exists

  started_at      timestamptz,       -- set when user taps to start; cleared on done/still-going

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table things enable row level security;
create policy "Users can manage their own things"
  on things for all
  using (auth.uid() = user_id);

create index things_user_id on things (user_id);


-- Steps
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

  needs_know_how    bool not null default false,

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


-- Add live_step_id FK now that steps exists
alter table things
  add constraint things_live_step_id_fkey
  foreign key (live_step_id) references steps (id)
  on delete set null
  deferrable initially deferred;


-- Step events
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


-- Push subscriptions (unchanged)
create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  subscription jsonb not null,
  endpoint     text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;
create policy "Users can manage their own push subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id);


-- updated_at trigger (shared)
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
