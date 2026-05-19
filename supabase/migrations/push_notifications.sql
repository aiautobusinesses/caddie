-- Push notifications (run in Supabase SQL editor)

create type notify_time_of_day as enum ('morning', 'afternoon', 'evening');

alter type event_type add value if not exists 'notified';

alter table tasks
  add column if not exists notify_days_before int not null default 0,
  add column if not exists notify_time_of_day notify_time_of_day not null default 'morning',
  add column if not exists notify_escalate boolean not null default false;

create table if not exists push_subscriptions (
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

create index if not exists push_subscriptions_user_id on push_subscriptions (user_id);
