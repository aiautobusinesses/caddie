-- Fix: "Database error saving new user" on magic-link signup
-- Run once in Supabase SQL Editor.

-- 1. Ensure profiles exists
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  timezone        text not null default 'Europe/London',
  onboarding_done boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. RLS: separate policies (FOR ALL + only USING breaks INSERT)
drop policy if exists "Users can manage their own profile" on public.profiles;
drop policy if exists "Profiles select own" on public.profiles;
drop policy if exists "Profiles insert own" on public.profiles;
drop policy if exists "Profiles update own" on public.profiles;
drop policy if exists "Profiles delete own" on public.profiles;

create policy "Profiles select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles update own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Profiles delete own"
  on public.profiles for delete
  using (auth.uid() = id);

-- 3. Trigger function (security definer + search_path so RLS bypass works)
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
