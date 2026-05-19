-- Profiles (extends Supabase auth.users)
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  timezone      text not null default 'Europe/London',
  onboarding_done bool not null default false,
  created_at    timestamptz not null default now()
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

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
  for each row execute function public.handle_new_user();


-- Enums
create type task_priority as enum ('high', 'medium', 'low');
create type task_energy   as enum ('low', 'medium', 'high');
create type task_source   as enum ('life_walk', 'manual', 'voice', 'photo');
create type task_status   as enum ('active', 'snoozed', 'archived');
create type task_visibility as enum ('personal', 'family');
create type event_type    as enum ('done', 'skipped', 'snoozed', 'edited');


-- Tasks
create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,

  title               text not null,
  category            text not null,
  space               text,

  priority            task_priority not null default 'medium',
  energy              task_energy   not null default 'medium',
  estimated_minutes   int,

  due_date            date,
  next_due            date,
  last_done_at        timestamptz,

  recurrence_text     text,
  recurrence_rule     jsonb,
  context_tags        jsonb,

  source              task_source     not null default 'manual',
  status              task_status     not null default 'active',
  visibility          task_visibility not null default 'personal',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table tasks enable row level security;
create policy "Users can manage their own tasks"
  on tasks for all
  using (auth.uid() = user_id);

create index tasks_user_status_next_due on tasks (user_id, status, next_due);

-- Auto-update updated_at
create function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on tasks
  for each row execute procedure touch_updated_at();


-- Task events (the "getting to know you" layer)
create table task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  event_type  event_type not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table task_events enable row level security;
create policy "Users can manage their own events"
  on task_events for all
  using (auth.uid() = user_id);

create index task_events_user_created on task_events (user_id, created_at desc);
create index task_events_task_id      on task_events (task_id);
