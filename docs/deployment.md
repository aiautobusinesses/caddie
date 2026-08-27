# Caddie — Deployment & Operations Checklist

This document covers what you need to deploy Caddie to Vercel for standard and Advanced account usage.

---

## Standard deployment (all users)

### Required environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key — safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server-side only; never exposed to clients |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes) used for AES-256-GCM encryption of stored Anthropic API keys. **Required in production.** Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Set these in your Vercel project dashboard under **Settings → Environment Variables**. Mark `SUPABASE_SERVICE_ROLE_KEY` as **Server** (not Preview/Production edge functions) to prevent accidental exposure.

### Database

Run all migrations in `supabase/migrations/` against your Supabase project in order:

```
001_things_and_steps.sql
002_band_mode_shape.sql
003_recurring_care.sql
004_needs_know_how.sql
005_multi_user_advanced.sql
```

The `005` migration adds:
- `profiles.anthropic_api_key` — stores each user's Anthropic key (never returned to clients)
- `user_integrations` table — stores per-user integration tokens for Advanced accounts

### User accounts

Caddie is **invite-only**. Users must have a matching row in the `invites` table before their first sign-in will fully activate their account. The `internal.handle_new_user()` trigger creates a profile automatically on first auth; `acceptInvite()` (called in `/auth/confirm`) promotes their `account_tier` from the invite record.

To invite someone, insert a row into `invites` directly:

```sql
insert into invites (email, invited_by, account_tier)
values ('user@example.com', '<your-user-id>', 'standard');
```

### AI provider

Each user must supply their own Anthropic API key via the **Settings → Anthropic API key** screen or the `/setup` page. Keys are stored in `profiles.anthropic_api_key` server-side only. There is no global `ANTHROPIC_API_KEY` environment variable for per-user AI features.

### Push notifications

The Supabase Edge Function (`supabase/functions/notify/index.ts`) handles scheduled push notifications. Deploy it with:

```bash
supabase functions deploy notify
```

Push notification sending requires `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` environment variables on the Edge Function. These are separate from the Next.js app environment.

---

## Advanced deployment (integration users)

Advanced users have `account_tier = 'advanced'` on their profile. This tier unlocks the **Integrations** section in Settings, where users can generate per-account bearer tokens for external integrations.

### Environment variables

No additional server-side environment variables are needed for the Advanced tier beyond those listed above. `VOICE_WEBHOOK_SECRET` is **no longer used** — each Advanced user's integration is authenticated via their own token from the `user_integrations` table.

### Home Assistant integration

See [`docs/home-assistant.md`](./home-assistant.md) for the updated setup guide. The key difference from the previous model:

- The request body no longer includes a `user_id` field
- The bearer token is the integration token from the Settings → Integrations screen (not a shared `VOICE_WEBHOOK_SECRET`)
- Each Advanced user generates their own token and configures their own HA instance

### Promoting a user to Advanced

Update the `account_tier` on the user's profile:

```sql
update profiles
set account_tier = 'advanced'
where id = '<user-id>';
```

Or update the existing invite so future sign-ins use the Advanced tier automatically:

```sql
update invites
set account_tier = 'advanced'
where email = 'user@example.com';
```

---

## Mobile PWA

Caddie is a PWA. On iOS, users can add it to the Home Screen from Safari. On Android, Chrome prompts for installation automatically.

Push notifications use the Web Push API. The service worker (`public/sw.js`) must be served at the root. Vercel handles this automatically via the `public/` directory — no special configuration needed.

---

## Checklist before going live

- [ ] All migration files applied to the production Supabase project
- [ ] Supabase RLS enabled on all tables (enabled by `schema.sql`)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as a server-only variable in Vercel
- [ ] `ENCRYPTION_KEY` set as a server-only variable in Vercel (generate fresh for production)
- [ ] At least one invite row inserted for each expected user
- [ ] PWA icons present in `public/icons/` (run `npm run generate:icons` if not)
- [ ] Edge Function `notify` deployed (optional — only needed for push notifications)
