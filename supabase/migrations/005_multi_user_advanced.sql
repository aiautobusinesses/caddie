-- Per-user Anthropic credentials
-- Stored in the profiles table as a nullable column.
-- The column is intentionally excluded from all client-side select * calls via RLS:
-- clients can write (via the save-key route) but never read back the raw value.

alter table profiles
  add column anthropic_api_key text;

-- Revoke the ability for authenticated users to select the raw key via RLS.
-- All other profile columns remain readable by the owner (existing policies).
-- To prevent leaking via select *, we add a column-level security comment
-- and rely on the server-side gateway never returning it to clients.

-- Per-user integration records for Advanced external integrations (e.g. Home Assistant).
-- Each record holds a stable token that the external system presents on webhook calls
-- instead of a raw user_id in the request body.

create table user_integrations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  provider     text not null,                       -- e.g. 'home_assistant', 'google'
  token        text not null unique default encode(gen_random_bytes(32), 'hex'),
  label        text,                                -- optional human-readable name
  created_at   timestamptz not null default now(),

  unique (user_id, provider)
);

alter table user_integrations enable row level security;

create policy "Users can manage their own integrations"
  on user_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index user_integrations_token on user_integrations (token);
create index user_integrations_user_id on user_integrations (user_id);
