-- Passkey (WebAuthn) credential storage
-- Each user can have one platform passkey credential.
create table passkey_credentials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  credential_id   text not null unique,
  public_key_spki text not null,   -- base64url-encoded SubjectPublicKeyInfo
  sign_count      bigint not null default 0,
  aaguid          text,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz
);

-- Only the service-role key may read/write passkey credentials
-- (all API routes that touch this table use the service-role client)
alter table passkey_credentials enable row level security;

create policy "No direct client access"
  on passkey_credentials for all
  using (false);

-- Pending challenges: short-lived, stored server-side between GET and POST
create table passkey_challenges (
  id          uuid primary key default gen_random_uuid(),
  challenge   text not null,
  user_id     uuid references auth.users on delete cascade,
  credential_id text,              -- null for registration challenges
  expires_at  timestamptz not null default (now() + interval '2 minutes'),
  created_at  timestamptz not null default now()
);

alter table passkey_challenges enable row level security;

create policy "No direct client access"
  on passkey_challenges for all
  using (false);
