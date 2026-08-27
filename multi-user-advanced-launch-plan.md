# Multi-user Advanced Launch Plan

## Overview
Build Caddie as an invite-only multi-user app where each user has a private account and private data by default. Every user must provide their own Anthropic API key to use AI-powered capture. Standard users interact with Caddie through the authenticated app on their phone, including life walk and voice-to-task capture. Selected users can be activated as Advanced users, which unlocks optional external integrations such as Home Assistant and Google for that specific user account. The implementation should preserve Supabase Auth plus RLS as the default security model, centralize AI provider resolution server-side, and isolate privileged integration paths from normal user flows.

## Sub-tasks

### 1. Add account capability and invite foundations
- **Intent** — Introduce the product-level account model for invite-only access and per-user capability flags without changing private-by-default data ownership.
- **Expected Outcomes** — The system can represent who is invited, who has accepted, and whether a user is Standard or Advanced. Existing user data remains owned by a single `user_id` and current RLS behavior stays intact.
- **Todo List**
  1. Add invite persistence for issuing and accepting invite-only access.
  2. Add per-user account capability metadata for Standard versus Advanced features.
  3. Define acceptance flow behavior so accepted users land in the existing Supabase auth flow cleanly.
  4. Ensure capability data is readable in server-side auth context for route gating and UI gating.
- **Relevant Context** — [`profiles`](supabase/schema.sql:2), [`internal.handle_new_user()`](supabase/schema.sql:31), [`getAuthenticatedContext()`](lib/api/session.ts:11), [`app/auth/page.tsx`](app/auth/page.tsx:22), [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts:4)
- **Status** — [ ] pending

### 2. Introduce a server-only AI provider layer with mandatory BYO Anthropic keys
- **Intent** — Move AI key resolution and Anthropic client creation into a dedicated server-side boundary so every AI feature uses the same per-user configuration model.
- **Expected Outcomes** — A signed-in user can save their own Anthropic key securely, AI routes resolve that user key server-side, and AI-powered features fail with a clear configuration state when no valid user key exists.
- **Todo List**
  1. Add a private storage model for per-user Anthropic credentials and provider status.
  2. Define how user keys are stored securely and never returned to the client after save.
  3. Add a central server-side AI gateway that resolves the current user's provider configuration.
  4. Update existing Anthropic call sites to use the shared gateway instead of reading global env directly.
  5. Add settings UX and route gating so users can configure and validate their own key before using AI capture.
- **Relevant Context** — [`app/api/lifewalk/route.ts`](app/api/lifewalk/route.ts:6), [`app/api/capture/voice/route.ts`](app/api/capture/voice/route.ts:10), [`lib/seed-care-plan.ts`](lib/seed-care-plan.ts:56), [`profiles`](supabase/schema.sql:2)
- **Status** — [ ] pending

### 3. Make authenticated in-app voice and life walk the standard user capture path
- **Intent** — Establish the phone app as the default interaction surface for all users by routing capture through authenticated user flows rather than privileged webhook writes.
- **Expected Outcomes** — Signed-in users can run life walk and voice capture from their phone, AI extraction runs under their own provider configuration, and persistence uses the authenticated user context with current RLS protections.
- **Todo List**
  1. Define the end-to-end authenticated capture flow for life walk and voice input on mobile.
  2. Reuse the existing parsing and persistence pipeline where it already matches the desired behavior.
  3. Ensure save operations derive ownership from the signed-in session rather than request-supplied user identifiers.
  4. Update mobile-facing UI and capture entry points so the authenticated path is the canonical experience.
- **Relevant Context** — [`app/api/lifewalk/route.ts`](app/api/lifewalk/route.ts:6), [`app/api/things/route.ts`](app/api/things/route.ts), [`persistThings()`](lib/thing-persistence.ts:15), [`LifeWalkCapture`](app/components/LifeWalkCapture.tsx), [`AppShell`](app/components/AppShell.tsx)
- **Status** — [ ] pending

### 4. Reframe external voice integrations as Advanced-only, per-user integration paths
- **Intent** — Keep Home Assistant and future Google integrations, but make them explicit Advanced features tied to a specific user account and isolated from standard app behavior.
- **Expected Outcomes** — Advanced users can configure external integrations for their own account, external voice ingestion is linked server-side to the correct user, and privileged routes are clearly separated from normal app flows.
- **Todo List**
  1. Define a per-user integration model for Advanced external integrations.
  2. Replace the current trust model that depends on request-supplied `user_id` in privileged ingestion flows.
  3. Gate Advanced integration setup, routes, and UI behind capability checks.
  4. Preserve Home Assistant support and design the Google path within the same Advanced integration boundary.
  5. Document the supported setup model for Advanced users.
- **Relevant Context** — [`app/api/capture/voice/route.ts`](app/api/capture/voice/route.ts:10), [`createClient()`](lib/supabase/server-service.ts:9), [`docs/home-assistant.md`](docs/home-assistant.md), [`VOICE_WEBHOOK_SECRET`](.env.local:5)
- **Status** — [ ] pending

### 5. Add product and route enforcement for invite-only access, AI readiness, and Advanced feature gating
- **Intent** — Ensure the application behaves coherently as a product by enforcing who can enter, who can use AI features, and who can access Advanced integrations.
- **Expected Outcomes** — Non-invited users cannot complete signup into the product, users without a configured Anthropic key are directed to setup before AI flows, and Advanced-only routes and UI are blocked for Standard users.
- **Todo List**
  1. Add invite enforcement to signup and first-session onboarding.
  2. Add route and server-side guards for AI-required features.
  3. Add capability-aware UI and route guards for Advanced-only integration surfaces.
  4. Ensure the default home and onboarding flow communicate the current account state clearly.
- **Relevant Context** — [`updateSession()`](lib/supabase/proxy.ts:13), [`app/auth/page.tsx`](app/auth/page.tsx:22), [`app/page.tsx`](app/page.tsx:6), [`profiles`](supabase/schema.sql:2)
- **Status** — [ ] pending

### 6. Validate production readiness for mobile testing, push, and deployment configuration
- **Intent** — Make the long-term architecture deployable and testable on phones through Vercel without hidden environment or integration gaps.
- **Expected Outcomes** — The Vercel deployment has the correct server-side secrets and public settings, phone-based testing works for authenticated capture and push, and Advanced integration prerequisites are clearly separated from standard deployment requirements.
- **Todo List**
  1. Define the required Vercel environment configuration for standard user flows.
  2. Separate optional Advanced integration secrets and setup from core app deployment.
  3. Verify the mobile PWA and push path still align with the new account and AI model.
  4. Produce a deployment and operations checklist for Standard and Advanced features.
- **Relevant Context** — [`package.json`](package.json), [`app/layout.tsx`](app/layout.tsx:25), [`app/api/push/subscribe/route.ts`](app/api/push/subscribe/route.ts), [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts:70), [`.env.local`](.env.local)
- **Status** — [ ] pending
