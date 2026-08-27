# Code Review Fixes Plan

## Overview

This plan addresses all findings from the architecture and code review, in priority order.
It covers two critical security issues, six high-severity correctness issues, nine medium
issues, and several low-priority duplication/quality improvements.

Each sub-task is scoped to be implementable independently in a single agent session.

---

## Sub-Task 1 — Mask integration bearer tokens (Critical)

**Status:** [x] done

**Intent:**
Bearer tokens are currently displayed in full on every settings page load. They must be
shown in full only once — immediately after creation — then permanently masked. Users who
need a new token must delete and recreate.

**Expected Outcomes:**
- Existing integrations render tokens as `••••••••` (masked string) with no way to reveal them
- After a new integration is created, a one-time creation modal/banner shows the full token
  with a copy-to-clipboard button
- Once the modal is dismissed or the page is navigated away from, the token is masked
  permanently in the list
- The API response from `POST /api/integrations` continues to return the full token (needed
  for the one-time display), but the `GET /api/integrations` response masks the token field

**Todo List:**
1. In `app/api/integrations/route.ts` — `GET` handler: replace `token` in the select with
   a static masked placeholder value (e.g. `"••••••••"`) in the returned JSON, OR omit
   `token` from the select entirely and add a separate `token_masked: true` flag
2. In `app/api/integrations/route.ts` — `POST` handler: keep returning the full token in
   the 201 response (this is the one-time display)
3. In `SettingsScreen.tsx`: add a `newlyCreatedToken: string | null` state field
4. After a successful POST, store the returned token in `newlyCreatedToken` and show a
   one-time banner/box above the integration list with the full token and a copy button
5. When `newlyCreatedToken` is set, the integration renders normally (masked) in the list —
   the banner is the only place the full value appears
6. Dismiss the banner on a close button click — set `newlyCreatedToken` to null
7. Render all existing integrations in the list with a masked token display
   (e.g. `••••••••` or `sk-…••••`)

**Relevant Context:**
- `app/api/integrations/route.ts` — GET and POST handlers
- `app/components/offer/SettingsScreen.tsx` — `handleCreateIntegration`, integration list render (~line 224–250)
- The `IntegrationRecord` type in `SettingsScreen.tsx` can gain an optional `token_once` field
  for the one-time display path, or the component can hold the token separately in state

---

## Sub-Task 2 — Anthropic API key encryption (Critical)

**Status:** [x] done

**Intent:**
Anthropic API keys are stored in plaintext in `profiles.anthropic_api_key`. A DB dump or
misconfigured access exposes every user's key. We encrypt at the application layer using
symmetric AES-256-GCM with a server-managed secret (`ENCRYPTION_KEY` env var), so the DB
only ever holds ciphertext.

**Decision:** Application-layer AES-256-GCM encryption using Node's built-in `crypto`
module. No new dependencies. The `ENCRYPTION_KEY` env var holds a 32-byte hex secret.
Existing stored keys (plaintext) will be migrated: on first read, if the value doesn't
parse as the encrypted format, treat it as plaintext and re-encrypt + re-save it.

**Expected Outcomes:**
- A new `lib/encryption.ts` module exports `encrypt(plaintext)` → base64 ciphertext string
  and `decrypt(ciphertext)` → plaintext string
- `app/api/ai-key/route.ts` encrypts before storing; `lib/ai-gateway.ts` decrypts before use
- `app/api/account/route.ts` continues to derive `ai_configured` correctly (any non-null
  value in the column means configured)
- A migration helper: if the stored value is not in the encrypted format, treat as legacy
  plaintext, decrypt returns it as-is and the gateway re-encrypts on next key save
- `ENCRYPTION_KEY` documented in `.env.local` example and `docs/deployment.md`
- Existing tests updated to mock the encryption layer

**Todo List:**
1. Add `ENCRYPTION_KEY` to `.env.local` (generate a random 32-byte hex value for local dev)
   and document it in `docs/deployment.md`
2. Create `lib/encryption.ts` with `encrypt(text: string): string` and
   `decrypt(ciphertext: string): string` using `crypto.createCipheriv` / `createDecipheriv`
   (AES-256-GCM, random IV prepended to output, base64-encoded)
3. Add a helper `isEncrypted(value: string): boolean` — checks for the expected format prefix
   or length to distinguish ciphertext from a legacy plaintext key
4. In `app/api/ai-key/route.ts` POST: call `encrypt(key)` before writing to DB
5. In `lib/ai-gateway.ts`: call `decrypt(storedValue)` on the retrieved key; if the value is
   not in encrypted format (legacy), use it as-is (migration path — next save will encrypt it)
6. In `lib/env.ts`: add a `getEncryptionKey()` getter that throws clearly if the env var is missing
7. Update `test/lib-ai-gateway.test.ts` to mock `lib/encryption.ts`

**Relevant Context:**
- `lib/ai-gateway.ts` — `resolveAiGateway()`, the only place the raw key is read
- `app/api/ai-key/route.ts` — the only place the key is written
- `app/api/account/route.ts` — only checks presence (`Boolean(data.anthropic_api_key?.trim())`);
  this continues to work as ciphertext is also non-empty
- `lib/env.ts` — existing pattern for env var getters

---

## Sub-Task 3 — Production guard in auth middleware (High)

**Status:** [x] done

**Intent:**
`lib/supabase/proxy.ts` silently returns `NextResponse.next()` (unauthenticated pass-through)
when Supabase env vars are absent. In development this is useful; in production it would
expose every route without auth. Add a guard that hard-errors in production.

**Expected Outcomes:**
- In development (`NODE_ENV !== 'production'`), the existing behaviour is preserved
- In production with missing env vars, the middleware throws a clear startup error rather
  than silently bypassing auth
- No change to the happy path

**Todo List:**
1. In `lib/supabase/proxy.ts`, change the `!hasSupabaseEnv` early-return block:
   if `process.env.NODE_ENV === 'production'`, throw an `Error` with a clear message
   (`"NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in production"`);
   otherwise keep the existing `return supabaseResponse` pass-through

**Relevant Context:**
- `lib/supabase/proxy.ts:16–18`
- `lib/env.ts` — `hasSupabaseEnv` boolean

---

## Sub-Task 4 — Atomise multi-step DB workflows via Postgres functions (High)

**Status:** [x] done

**Intent:**
Five workflows span multiple independent DB calls with no transaction boundary:
`persistThings`, `markThingDone`, `recordStepEvent` (non-recurring path), `prepend-lookup`,
and the entity+care-plan insert in `entities/route.ts`. Each is vulnerable to partial
failure leaving inconsistent state.

The fix is Postgres stored procedures (in the `public` schema so they are callable via
`supabase.rpc()`) wrapping each multi-step workflow. The TypeScript callers are updated to
call `supabase.rpc()` and the old sequential call chains are removed.

**Decision:** Write a new migration `supabase/migrations/006_atomic_functions.sql`.
All functions use `SECURITY DEFINER` only where needed for the voice webhook (service role
context); session-authenticated callers pass `user_id` as a parameter. Functions in the
`public` schema are callable from the app via `supabase.rpc()`.

**Expected Outcomes:**
- New migration file with five Postgres functions:
  1. `insert_thing_with_steps(user_id, thing_json, steps_json[])` → returns thing_id
  2. `mark_thing_done(p_thing_id, p_user_id)` → returns `{thing_complete, thing_name}`
  3. `record_step_event_done(p_step_id, p_user_id, p_metadata)` → returns `ok`
  4. `prepend_lookup_step(p_thing_id, p_user_id)` → returns `{step_id}`
  5. `insert_entity_with_care_plan(user_id, entity_json, plan_json)` → returns `{entity_id, plan_id}`
- `lib/thing-persistence.ts` calls `supabase.rpc('insert_thing_with_steps', …)` — the manual
  rollback block is removed
- `lib/things-service.ts` — `markThingDone` and the non-recurring path of `recordStepEvent`
  call the corresponding RPCs; the recurring path (update only, no thing advance) is two
  parallel writes and is acceptable without a transaction
- `app/api/things/[id]/prepend-lookup/route.ts` calls `supabase.rpc('prepend_lookup_step', …)`
- `app/api/entities/route.ts` calls `supabase.rpc('insert_entity_with_care_plan', …)` — the
  orphan-cleanup block is removed
- The `database.types.ts` `Functions` map is updated with the new function signatures
- Existing unit tests updated to mock `supabase.rpc` where they previously mocked the
  individual table calls

**Relevant Context:**
- `lib/thing-persistence.ts` — three sequential inserts; manual rollback on line 68
- `lib/things-service.ts` — `markThingDone` (lines 56–118), `recordStepEvent` non-recurring
  path (lines 205–239)
- `app/api/things/[id]/prepend-lookup/route.ts` — insert + update (lines 44–73)
- `app/api/entities/route.ts` — two inserts + orphan cleanup (lines 67–112)
- `supabase/migrations/005_multi_user_advanced.sql` — reference for migration style

---

## Sub-Task 5 — Atomic invite acceptance (High)

**Status:** [x] done

**Intent:**
`lib/invites.ts` accepts an invite and upgrades the profile tier in two separate DB calls.
If the profile update fails, the invite is consumed but the tier is never set. Fix by
wrapping both operations in a single Postgres function.

**Expected Outcomes:**
- New Postgres function `accept_invite(p_user_id uuid, p_email text)` added to the migration
  from Sub-Task 4 (or a separate `007` migration if 4 is already applied)
- Function: looks up invite by normalised email, guards `accepted_by IS NULL`, sets
  `accepted_by` and `accepted_at`, updates `profiles.account_tier` — all in one transaction
- Returns the `account_tier` that was granted, or NULL if no valid invite found
- `lib/invites.ts` `acceptInvite()` is rewritten to call `supabase.rpc('accept_invite', …)`
- All existing tests for `lib/invites.ts` updated

**Relevant Context:**
- `lib/invites.ts` — current two-query implementation
- `app/auth/confirm/route.ts` — calls `acceptInvite()`
- The RLS `"Invitees can read their invite"` policy can be removed once only the RPC is used
  (function runs as `SECURITY DEFINER`)

---

## Sub-Task 6 — Extract shared LLM extraction function (High)

**Status:** [x] done

**Intent:**
`app/api/lifewalk/route.ts` and `app/api/capture/voice/route.ts` both contain an identical
15-line block: create the Anthropic message, find the text block, call
`parseLifeWalkThingsFromModelText`. They have already diverged (lifewalk has better error
handling). Extracting this into a shared function prevents further drift.

**Expected Outcomes:**
- `lib/lifewalk-parse.ts` exports a new async function
  `extractThingsFromNarration(client: Anthropic, text: string): Promise<LifeWalkExtractedThing[]>`
  that encapsulates the `client.messages.create` call, text block extraction, parse, and
  Anthropic-specific error handling (the superior logic from `lifewalk/route.ts`)
- `app/api/lifewalk/route.ts` replaces its try/catch block with a call to this function
- `app/api/capture/voice/route.ts` replaces its try/catch block with a call to this function
- Both routes' error handling is now identical (the extracted function's)
- Existing tests for `lib/lifewalk-parse.ts` extended to cover the new function

**Relevant Context:**
- `app/api/lifewalk/route.ts:31–72`
- `app/api/capture/voice/route.ts:66–84`
- `lib/lifewalk-prompt.ts` — exports `LIFEWALK_MODEL` and `LIFEWALK_EXTRACTION_PROMPT`
- `lib/lifewalk-parse.ts` — already exports `parseLifeWalkThingsFromModelText`

---

## Sub-Task 7 — Add timeouts to all Anthropic API calls (Medium)

**Status:** [x] done

**Intent:**
Anthropic API calls have no timeout. A slow or hung response keeps the user waiting
indefinitely. Wrap all calls with a 30-second `AbortSignal` timeout, returning a 504 to
the client if exceeded.

**Expected Outcomes:**
- All three LLM call sites (`extractThingsFromNarration` in `lib/lifewalk-parse.ts`, and
  `seedCarePlan` in `lib/seed-care-plan.ts`) use `AbortSignal.timeout(30_000)` passed as
  the `signal` option to `client.messages.create`
- If the signal fires, the error is caught and returns a user-friendly message
  (`"AI request timed out. Try again."`) with HTTP 504
- The validation call in `app/api/ai-key/route.ts` (`client.models.list()`) also gets a
  10-second timeout
- `lib/lifewalk-parse.ts` after Sub-Task 6 is the primary place to update

**Relevant Context:**
- `lib/lifewalk-parse.ts` — `extractThingsFromNarration` (post Sub-Task 6)
- `lib/seed-care-plan.ts` — `seedCarePlan`
- `app/api/ai-key/route.ts` — `validateAnthropicKey`
- Anthropic SDK accepts `{ signal: AbortSignal }` in the request options

---

## Sub-Task 8 — Batch care-groups/report queries (Medium)

**Status:** [x] done

**Intent:**
`app/api/care-groups/report/route.ts` issues 2 sequential DB calls per plan (UPDATE +
INSERT) inside a `for` loop, plus a final profile update — O(n) round-trips. Replace with
a single bulk UPDATE and a single batch INSERT.

**Expected Outcomes:**
- A single `UPDATE care_plans SET last_done_at=…, next_due_at=… WHERE id = ANY(done_ids)`
  with per-row computed `next_due_at` replaces the per-plan UPDATE loop. Because
  `next_due_at` varies by plan (based on each plan's intervals), use a Postgres function
  `report_care_group(p_user_id, p_plan_ids[], p_done_ids[])` that handles the computation
  and returns `ok`. Add this to the migration from Sub-Task 4/5.
- The function handles: UPDATE done plans, INSERT care_events for all plans, UPDATE
  profiles.last_care_offer_date — all in one transaction
- The route handler is reduced to: auth check → parse body → single `supabase.rpc()` call
- All existing behaviour is preserved (done vs not_done event types, offer date cap)

**Relevant Context:**
- `app/api/care-groups/report/route.ts` — full file
- `lib/care.ts` — `computeNextDueAt`, `parseIntervals` — logic to port into the SQL function

---

## Sub-Task 9 — Generate database types from schema (Medium)

**Status:** [x] done

**Intent:**
`lib/database.types.ts` is hand-maintained and has already drifted from `schema.sql` —
notably the `event_type` enum has 8 values in types but 3 in schema. The authoritative
source of truth is the schema. Regenerate the types file from the schema and document how
to keep them in sync.

**Decision:** Since the Supabase CLI may not be wired up in CI, the immediate fix is to
manually reconcile the types file with the actual schema (including all migrations), add
a comment at the top explaining how to regenerate, and note the discrepancies found.
Setting up automated generation is out of scope for this plan but documented as a follow-up.

**Expected Outcomes:**
- `lib/database.types.ts` accurately reflects all columns and enums in `schema.sql` plus
  all applied migrations (`001`–`006`/`007`)
- The `event_type` enum in types matches what is actually in the DB
- The `Functions` map is populated with all new RPC signatures added in Sub-Tasks 4 and 5
- `steps` table Row type includes `band`, `mode`, `shape` columns
- A comment at the top of the file explains: "To regenerate: `supabase gen types typescript
  --local > lib/database.types.ts`"
- All TypeScript compilation errors introduced by the reconciliation are fixed

**Relevant Context:**
- `lib/database.types.ts` — full file
- `supabase/schema.sql` — authoritative base schema
- `supabase/migrations/` — all migrations that add columns/enums

---

## Sub-Task 10 — Lazy-load profile in getAuthenticatedContext (Medium)

**Status:** [x] done

**Intent:**
Every API request that calls `getAuthenticatedContext()` issues a `SELECT *` on `profiles`
even if the route only needs the `User` object. Routes like `things/route.ts`,
`things/[id]/route.ts`, and `steps/[id]/event/route.ts` never use `auth.profile`. This is
an unnecessary DB round-trip per request.

**Expected Outcomes:**
- `lib/api/session.ts` `getAuthenticatedContext()` no longer fetches the profile
- The return type gains a `getProfile()` async accessor:
  `getProfile: () => Promise<ProfileRow | null>`
- All existing callers that read `auth.profile` are updated to `await auth.getProfile()`
- Routes that never use the profile get the performance benefit automatically
- The `AuthenticatedContext` type is updated accordingly
- All tests updated

**Relevant Context:**
- `lib/api/session.ts` — full file
- Callers that access `auth.profile`:
  - `app/api/integrations/route.ts` (tier check — all three methods)
  - `app/api/ai-key/route.ts` (indirectly via `resolveAiGateway`)
  - `lib/ai-gateway.ts` (takes `supabase` + `userId`, no profile access)
  - `app/page.tsx` (server component, passes data to `loadOfferData`)
- Callers that do NOT use `auth.profile` and will benefit:
  - All `things/*` routes, `steps/*` routes, `lifewalk`, `offer`, `care-*` routes

---

## Sub-Task 11 — Fix silent update results and missing 404s (Medium)

**Status:** [x] done

**Intent:**
Several UPDATE and DELETE operations return 200 even when no row was matched (wrong ID,
wrong user, already deleted). The caller cannot distinguish "updated" from "nothing
matched". Return 404 where appropriate. This also fixes the information-leakage note from
the review — currently a DELETE on another user's resource returns 200, giving the caller
timing information.

**Expected Outcomes:**
- `app/api/things/[id]/route.ts` PATCH: add `.select("id").single()` to the update; if no
  row returned, respond 404
- `app/api/things/[id]/route.ts` DELETE: add `.select("id")` to the delete; if `data` is
  empty array, respond 404
- `app/api/things/[id]/start/route.ts`: same pattern — check rowcount, return 404 if zero
- `lib/things-service.ts` `markThingStillGoing`: add count check, throw `ServiceError(404)`
  if no rows updated

**Relevant Context:**
- `app/api/things/[id]/route.ts`
- `app/api/things/[id]/start/route.ts`
- `lib/things-service.ts:38–44`

---

## Sub-Task 12 — Add provider allowlist to integrations API (Low)

**Status:** [x] done

**Intent:**
`POST /api/integrations` accepts any string for `provider` and stores it verbatim. The UI
offers three options but the API has no server-side allowlist. Add validation.

**Expected Outcomes:**
- `app/api/integrations/route.ts` POST handler defines an allowed providers constant:
  `const ALLOWED_PROVIDERS = ["home_assistant", "google", "other"] as const`
- Validates that `provider` is in this list; returns 400 if not
- Type exported so the UI `<select>` options can be derived from the same constant
  (optional, but ensures they stay in sync)

**Relevant Context:**
- `app/api/integrations/route.ts:45–53`
- `app/components/offer/SettingsScreen.tsx` — select options

---

## Sub-Task 13 — Extract duplicated constants and helpers (Low)

**Status:** [x] done

**Intent:**
Several constants and small helpers are duplicated across files. Consolidate them.

**Expected Outcomes:**
1. **Month names**: create `lib/months.ts` exporting `MONTH_LABELS: string[]`
   (`["Jan","Feb",…,"Dec"]`). Update `EntityCaptureFlow.tsx` and `CarePlanEditor.tsx` to
   import from it.
2. **Account tier guard**: add a `requireAdvanced(auth: AuthenticatedContext): NextResponse | null`
   helper in `lib/api/session.ts` (or a new `lib/api/guards.ts`). Update all three methods
   in `integrations/route.ts` to use it.
3. **`buildCareReason` deduplication**: `lib/care-grouping.ts` has an inline reason-string
   block that duplicates logic from `lib/care.ts:buildCareReason`. Replace it with a call
   to `buildCareReason`.
4. **Input class string**: extract the common Tailwind input class string into a constant
   in `lib/styles.ts` or a Tailwind `@layer components` block. Update `auth/page.tsx`,
   `setup/page.tsx`, `SettingsScreen.tsx`, and `CarePlanEditor.tsx`.

**Relevant Context:**
- `app/components/capture/EntityCaptureFlow.tsx:6` — `MONTHS` array
- `app/components/CarePlanEditor.tsx` — `MONTHS` array (verify it exists here)
- `app/api/integrations/route.ts:16,37,73` — tier checks
- `lib/care-grouping.ts` — reason string logic
- `lib/care.ts:buildCareReason`

---

## Sub-Task 14 — Fix optimistic update rollback in commitStart (Medium)

**Status:** [x] done

**Intent:**
`useOfferCardState.ts` `commitStart()` immediately transitions the screen to "focus" and
sets `inProgress` state before the API call succeeds. If the API call fails, the UI is
stuck on the focus screen with stale state and only a generic error message — there is no
rollback path. Fix with a proper rollback.

**Expected Outcomes:**
- `commitStart` saves the previous `inProgress` and `screen` values before mutation
- On API failure, restores `inProgress` to its previous value and `screen` to `"offer"`
- The `actionError` is still set so the user sees what went wrong
- The optimistic UI update is kept (good UX) but the rollback makes it correct

**Relevant Context:**
- `app/components/offer/useOfferCardState.ts:51–68`

---

## Sub-Task 15 — Fix care plan entity archive filtering (Low)

**Status:** [x] done

**Intent:**
`lib/offer-data.ts` filters archived care plans server-side but relies on the client-side
grouping algorithm to filter out plans belonging to archived entities. Move the entity
archive filter to the DB query.

**Expected Outcomes:**
- The `care_plans` query in `lib/offer-data.ts` adds `.not("entities.archived_at", "is", null)`
  — wait, this filters OUT non-null archived_at, meaning we want `.is("entities.archived_at", null)`.
  Use the correct Supabase filter syntax for a joined column.
- The redundant `!p.entities.archived_at` check in `lib/care-grouping.ts:70–71` can be
  removed (or kept as a belt-and-braces guard with a comment)
- Verify the Supabase query syntax for filtering on a joined table column

**Relevant Context:**
- `lib/offer-data.ts:36–45`
- `lib/care-grouping.ts:69–75`

---

## Sub-Task 16 — Fix handleSkipAll error handling (Low)

**Status:** [x] done

**Intent:**
`handleSkipAll` fires all skip event requests in parallel and calls `refreshOffer()` without
checking whether any failed. Failures are silently dropped.

**Expected Outcomes:**
- `handleSkipAll` uses `Promise.allSettled` instead of `Promise.all` (already implicit, but
  currently there is no error check at all)
- If any request fails, `setActionError` is called with a brief message before refresh
- `refreshOffer` is still called regardless (the offer should refresh even on partial failure)

**Relevant Context:**
- `app/components/offer/useOfferCardState.ts:161–172`

---

## Dependency Order

```
Sub-Task 3  (middleware guard)     — no dependencies
Sub-Task 6  (extract LLM fn)      — no dependencies
Sub-Task 7  (timeouts)            — depends on Sub-Task 6
Sub-Task 12 (provider allowlist)  — no dependencies
Sub-Task 16 (skipAll errors)      — no dependencies
Sub-Task 14 (commitStart rollback)— no dependencies
Sub-Task 15 (entity archive filter)—no dependencies
Sub-Task 1  (mask tokens)         — no dependencies
Sub-Task 2  (encrypt keys)        — no dependencies
Sub-Task 4  (atomic DB functions) — no dependencies, but types updated in Sub-Task 9
Sub-Task 5  (atomic invites)      — can be bundled with Sub-Task 4 migration
Sub-Task 8  (batch report)        — can be bundled with Sub-Task 4/5 migration
Sub-Task 9  (types reconciliation)— should run after Sub-Tasks 4, 5, 8
Sub-Task 10 (lazy profile)        — no dependencies
Sub-Task 11 (404s on updates)     — no dependencies
Sub-Task 13 (dedup constants)     — no dependencies
```

**Recommended execution order:**
3 → 6 → 7 → 1 → 2 → 4+5+8 (bundled migration) → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16
