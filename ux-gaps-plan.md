# UX Gaps Plan

Fix eight identified dead-ends and missing interactions. All changes are minimal and additive — no rewrites, no new data model.

---

## Overview

Eight gaps, grouped into three themes:

- **Escape hatches** (3, 8): return screen "not now"; "not these" offer refresh
- **Thing lifecycle** (1, 2, 7): edit name; abandon/delete; end-of-thing signal
- **Offer quality** (4, 6): breakdown at offer time; empty state capture prompt
- **Capture reachability** (5): FAB confirmed wired, verify in context

The FAB and capture modal are already wired in `AppShell`. Sub-task 5 is a verification step only — no code change expected unless the check reveals a bug.

---

## Sub-Task 1 — Edit a thing's name from the in-progress screen

**Intent**
A user who sees a wrong name on the "You're doing this" card has no way to correct it. Correction must be reachable from the card itself, not from a separate list.

**Expected outcomes**
- Tapping the thing name on the in-progress card makes it inline-editable
- Saving calls a new `PATCH /api/things/[id]` endpoint that updates `name`
- Cancel restores the original value
- No new page or navigation

**Todo list**
1. Add `PATCH /api/things/[id]/route.ts` — accepts `{ name: string }`, updates `things.name`, returns `{ ok: true }`
2. In `OfferCard`, add `editingName` boolean state and `editedName` string state
3. When `screen === "in_progress"` or `"return"`, render the thing name as a tappable element; on tap switch to an `<input>` with save/cancel controls
4. On save: optimistically update local state, call PATCH in background, revert on error
5. Wire cancel to restore original name without API call

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — the `inProgress.thing_name` display is at line ~170
- [`lib/api/session.ts`](lib/api/session.ts) — auth pattern to copy
- [`app/api/things/[id]/start/route.ts`](app/api/things/%5Bid%5D/start/route.ts) — example of minimal route shape

**Status** — [ ] pending

---

## Sub-Task 2 — Abandon / delete a thing

**Intent**
Things that no longer apply (cancelled, decided against, duplicate) accumulate in the offer pool forever. "Letting things go" was an explicit open question in DESIGN.md — permanent undeletable debt is the worse option.

**Expected outcomes**
- On the in-progress / return screen, a "Let this go" affordance is available (tertiary, below the main actions — not prominent)
- Tapping it asks for a single confirmation ("Are you sure? This can't be undone")
- On confirm: deletes the thing (cascade deletes steps and step_events via FK), navigates back to offer screen
- No undo — the copy sets expectations

**Todo list**
1. Add `DELETE /api/things/[id]/route.ts` — hard-deletes `things` row (RLS ensures ownership); cascade on steps/step_events is already in schema
2. In `OfferCard`, add `confirmingAbandon` boolean state
3. Below the "Still going" button on the in-progress/return screen, add a "Let this go" text button (muted, `text-[#5a6070]`)
4. When tapped: render an inline confirmation with "Yes, let it go" (red-tinted) and "Keep it" buttons
5. On confirm: call DELETE, then `refreshOffer()`

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — button group starts at ~line 195
- [`app/api/things/[id]/done/route.ts`](app/api/things/%5Bid%5D/done/route.ts) — same route shape
- Schema cascade: `steps` has `ON DELETE CASCADE` from `things`; verify step_events does too in `supabase/migrations/001_things_and_steps.sql` before assuming

**Status** — [ ] pending

---

## Sub-Task 3 — "Not now" escape from the return screen

**Intent**
When a thing is in-progress and the user opens the app, they see the return screen ("Welcome back"). The only exits are "Done" and "Still going". If neither applies — they've not touched it, changed their mind — they're trapped. Leaving must always be free.

**Expected outcomes**
- A "Not now" link appears below the button group on the return screen only (not the in-progress screen — there, "Still going" serves this purpose)
- Tapping it calls the existing `still_going: true` path (clears `started_at`, returns to offer screen)
- No new API endpoint needed — the `still_going` path already does exactly this

**Todo list**
1. In `OfferCard`, in the `isReturn` branch of the button group, add a tertiary "Not now" button below "Still going"
2. Wire it to `handleDone(true)` — same as "Still going" but different label for the return context
3. Optionally: differentiate the label from "Still going" by framing ("Not now" = haven't started; "Still going" = started but not done). Both do the same thing.

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — `isReturn` is computed at ~line 167; button group is ~lines 195–215
- No API change needed

**Status** — [ ] pending

---

## Sub-Task 4 — Breakdown at offer time (next step only)

**Intent**
Steel's procrastination meta-analysis: ambiguity kills expectancy. A user who sees a thing on the offer screen but isn't sure what the first move is should be able to peek. Currently breakdown is only available after starting. The peek should show only the next 1–2 steps — not the full chain (that's the unpacking problem: Kruger & Evans show it inflates perceived cost).

**Expected outcomes**
- Each offer card has a small inline "Where to start?" affordance (below the reason label, above the card border)
- Tapping it fetches `/api/things/[id]/breakdown` and shows only the first 2 steps inline on that card
- The "Break it into steps" link remains available on the in-progress screen as-is (it shows more steps)
- Starting the thing dismisses the peek inline; the full breakdown on the in-progress screen remains unchanged

**Todo list**
1. In `OfferCard`, add per-item state: `peekBreakdown: Record<string, string[] | null>` and `peekLoading: Record<string, boolean>`
2. Below the `reason` label on each offer card button, add a small "Where to start?" text link
3. On tap: fetch `/api/things/${item.thing_id}/breakdown` (POST, existing endpoint), store first 2 items in `peekBreakdown[item.thing_id]`
4. If peek is loaded, render the 2 steps inline inside the card (below reason, before the user taps to start)
5. Clicking the card itself (start) still works as normal — the peek is just display

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — offer card render at ~line 145
- [`app/api/things/[id]/breakdown/route.ts`](app/api/things/%5Bid%5D/breakdown/route.ts) — returns `{ steps: string[] }`, already truncates at 3–6; client takes first 2
- The breakdown endpoint is already POST; no change needed

**Status** — [ ] pending

---

## Sub-Task 5 — Verify FAB / post-onboarding capture is reachable

**Intent**
The FAB and capture modal exist in code, but this interaction has not been manually verified end-to-end. If the FAB is hidden or the modal fails to open, users have no way to add things after onboarding.

**Expected outcomes**
- FAB renders on `/` (main offer page) and is tappable
- Opens the capture modal (`CaptureModal` → `TaskCaptureFlow` with `variant="capture"`)
- After saving, `notifyTasksUpdated()` fires and a page refresh picks up the new things
- The empty state on the offer screen also includes a direct capture prompt (sub-task 6 handles this)

**Todo list**
1. Read `AppShell.tsx`, `AddTaskButton.tsx`, `CaptureModal.tsx`, `CaptureContext.tsx` to confirm the wiring is correct end-to-end
2. Confirm `notifyTasksUpdated()` is called in `CaptureModal.onSaved` and that the main page responds to it (currently `page.tsx` is SSR — a full page refresh may be needed; check if `OfferCard` listens for `TASKS_UPDATED_EVENT`)
3. If `OfferCard` does not listen for `TASKS_UPDATED_EVENT`, add a `useEffect` that calls `refreshOffer()` on that event
4. If the wiring is already correct, no change needed — mark done

**Relevant context**
- [`app/components/AppShell.tsx`](app/components/AppShell.tsx) — wraps children with FAB and modal
- [`app/components/capture/CaptureModal.tsx`](app/components/capture/CaptureModal.tsx) — calls `notifyTasksUpdated` on save
- [`lib/capture.ts`](lib/capture.ts) — `TASKS_UPDATED_EVENT` is `"caddie:tasks-updated"`
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — currently has no event listener for `TASKS_UPDATED_EVENT`; `refreshOffer` exists and would do the job

**Status** — [ ] pending

---

## Sub-Task 6 — Empty state capture prompt

**Intent**
When all things are done and the offer screen shows "Nothing needs doing right now", there is no prompt to add more. A user who has genuinely cleared their list hits a wall. The empty state should invite capture without pressure.

**Expected outcomes**
- Below "Nothing needs doing right now." and the "Check again" link, a quiet secondary prompt appears: "Add something?" with a tap target that opens the capture modal
- Uses the existing `useCapture()` context — no new wiring needed
- Styling matches the muted `text-[#5a6070]` register of the empty state

**Todo list**
1. In `OfferCard`, the empty state render is the `offer.length === 0` branch (~line 121)
2. Convert this component to also accept `useCapture()` — note `OfferCard` is already a `"use client"` component
3. Add `const { openCapture } = useCapture()` inside the component
4. Below the "Check again" button, add a `<button>` with copy "Add something?" styled as a muted link, wired to `openCapture`

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — empty state at ~line 121
- [`app/components/capture/CaptureContext.tsx`](app/components/capture/CaptureContext.tsx) — `useCapture()` hook
- `OfferCard` is already `"use client"` — no wrapper change needed
- `CaptureProvider` is in `AppShell` which wraps the whole app — `useCapture()` will always be in context on `/`

**Status** — [ ] pending

---

## Sub-Task 7 — End-of-thing acknowledgement

**Intent**
When the last step of a thing is marked done, the user gets no signal. The thing silently drops out of the offer pool. Fishbach & Dhar's sub-goal concern applies to forward progress, not to finishing a whole chain. A factual acknowledgement is appropriate — not celebratory, not tying to what's next.

**Expected outcomes**
- After marking done, if `live_step_id` becomes null (no more steps), the API response signals this
- The UI briefly shows a factual message: "[thing name] done." — then transitions to the offer screen after a short pause (1.5s) or a tap
- No confetti, no "great job", no prompt to add another task

**Todo list**
1. In `POST /api/things/[id]/done`, after advancing `live_step_id`: if `nextStep` is null (nothing left), include `{ ok: true, thing_complete: true, thing_name: thing.name }` in the response
2. In `OfferCard.handleDone`: read `thing_complete` and `thing_name` from the response
3. Add a `thingComplete` state: `{ name: string } | null`
4. If `thing_complete` is true: set `thingComplete`, delay `refreshOffer()` by 1500ms
5. Render a simple full-screen acknowledgement while `thingComplete` is set: "[name] done." with a tap-to-continue affordance that calls `refreshOffer()` immediately

**Relevant context**
- [`app/api/things/[id]/done/route.ts`](app/api/things/%5Bid%5D/done/route.ts) — `nextStep` is already queried; null means thing is complete (~line 50)
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — `handleDone` at ~line 77; `refreshOffer` is already called immediately after

**Status** — [ ] pending

---

## Sub-Task 8 — "Not these" offer refresh (replaces missing skip)

**Intent**
A user who sees three offers and doesn't want any of them can only close the app. "Skip" was identified as missing, but the design decision is to rename and reframe it: "Not these" refreshes the spread without framing any individual step as skipped or failed. The event is still logged (best signal that offer logic is wrong) but logged as a spread-level skip, not a step-level failure.

**Expected outcomes**
- Below the offer cards, a quiet "Not these" link appears
- Tapping it logs a `skipped` event against each offered step, then calls `refreshOffer()`
- If the new offer is identical (nothing else available), the list refreshes to the same items — no special handling needed
- Copy: "Not these" — not "Skip", not "None of these work for me"

**Todo list**
1. In `OfferCard`, add a `handleNotThese` async function
2. It fires `POST /api/steps/[id]/event` with `{ event_type: "skipped" }` for each step_id in the current `offer` array (fire-and-forget, don't await all)
3. Then calls `refreshOffer()`
4. In the offer screen render, below the card list, add a centered "Not these" text button (muted styling)
5. Confirm `OfferItem` already has `step_id` — it does (from `app/api/offer/route.ts`)

**Relevant context**
- [`app/components/OfferCard.tsx`](app/components/OfferCard.tsx) — offer screen render ~line 130
- [`app/api/steps/[id]/event/route.ts`](app/api/steps/%5Bid%5D/event/route.ts) — `skipped` is a valid `event_type`
- [`lib/tasks.ts`](lib/tasks.ts) — `STEP_EVENT_INPUTS` includes `"skipped"`

**Status** — [ ] pending

---

## Implementation order

Sub-tasks are independent of each other except:
- Sub-task 5 (FAB verification) should run before sub-task 6 (empty state) in case there's a wiring issue to resolve first
- Sub-tasks 1 and 2 both touch `OfferCard` — implement sequentially, not in parallel, to avoid merge conflicts

Suggested order: **3 → 8 → 6 → 5 → 4 → 7 → 1 → 2**

Rationale: escape hatches first (low risk, high value), then offer quality, then the more surgical edits to in-progress state, then the new API endpoints.
