# Design-sync plan

*Bring the codebase into alignment with DESIGN.md as revised through the research addendum conversation.*

---

## Top-level overview

The design document has been substantially updated. The code is behind in several places — some gaps are cosmetic, some are structural, one involves a schema decision already made in the design doc. This plan works through each gap in dependency order: schema and types first, then logic, then UI, then tests and validation.

**Decided: `notify_window` stays as-is.** The design doc mentions `notify_window_days` once inconsistently. The schema, all migrations, all application code, all types, and all tests use `notify_window`. The design doc will be treated as having a typo; the code name is correct and nothing changes.

**Decided: `due_date` belongs on `things`, not steps.** The date is a property of the obligation, not of any step. An MOT is due on 14 March whether the chain has one step or three. Storing it on the first step requires moving it every time the chain changes, and forces the offer query to join through steps to know whether a thing is inside its notify window — the wrong join for something that governs the thing. Steps carry no dates at all, on any class. That rule is simpler and easier to enforce than a per-class exception.

**Decided: stop note is post-tap, not pre-tap, and is non-blocking.** "Still going" records the stop event immediately on tap. The note and photo prompt appears after — dismissible without friction, never nagging. A note that blocks the exit gets avoided by closing the app, which loses both the event and the note.

---

## Sub-tasks

### 1. Schema migration — add `domain` to `things`, remove `recurrence_rule` and `next_due` from `steps`

**Intent**
Two schema changes are required by the design:
- `things` needs a `domain` column (coarse LLM-assigned category) for spread variety logic.
- `steps` carries `recurrence_rule` and `next_due` columns that the design has decided belong on `care_plans`, not steps. Both come off steps. The design also says `ends_cleanly` and `estimated_minutes` were already dropped — the schema.sql still shows them as the baseline, but migration 002 removes them. The migration here only needs to handle what hasn't been migrated yet.

Before writing the migration: query the live database to check whether any rows have non-null `recurrence_rule`. The migration strategy depends on the answer (see DESIGN.md, "Recurrence lives on care plans, not steps — decided"). If rows exist, they must be inspected and converted; if not, the columns can be dropped directly. Since this plan is for a single-author app still in early development, the migration assumes test data only and drops directly — but includes a safety check.

`last_done_at` on steps was used solely to support the old recurring-step reason line ("last done N days ago"). With recurring steps removed, it has no purpose. It comes off too.

**Expected outcomes**
- New migration file `supabase/migrations/009_domain_and_drop_recurrence.sql` that:
  - Adds `domain text` column to `things` (nullable, no enum — coarse and evolvable)
  - Drops `recurrence_rule`, `next_due`, and `last_done_at` from `steps`
  - Drops the `steps_user_next_due` index (indexed the now-removed column)
- `lib/database.types.ts` updated to reflect all changes
- `lib/tasks.ts` updated: `LifeWalkExtractedStep` loses `recurrence_rule` and `next_due`; `LifeWalkExtractedThing` gains `domain`
- `lib/offer.ts` types updated: `OfferStepRow` loses `recurrence_rule`, `next_due`, `last_done_at`; `OfferThingRow` gains `domain`
- `lib/recurrence.ts` — no changes; recurrence still needed for care plans
- `lib/thing-persistence.ts` updated to persist `domain` and no longer pass step-level recurrence fields

**Todo list**
1. Check `supabase/migrations/` numbering and write `009_domain_and_drop_recurrence.sql` — adds `domain text` to `things`, adds `due_date date` to `things` (obligations only, nullable), drops `recurrence_rule`, `next_due`, and `last_done_at` from `steps`, drops the `steps_user_next_due` index
2. Update `lib/database.types.ts` — remove dropped step columns, add `domain` and `due_date` to things
3. Update `lib/tasks.ts` — `LifeWalkExtractedStep` (remove recurrence/next_due), `LifeWalkExtractedThing` (add domain, add due_date)
4. Update `lib/offer.ts` — `OfferStepRow` (remove recurrence/next_due/last_done_at), `OfferThingRow` (add domain, add due_date)
5. Update `lib/thing-persistence.ts` — pass domain and due_date, remove step recurrence fields
6. Update `supabase/migrations/006_atomic_functions.sql` — `insert_thing_with_steps` accepts and persists `due_date` on things; no longer inserts `recurrence_rule` or `next_due` on steps
7. Update `supabase/schema.sql` to match (the schema.sql is the canonical baseline — keep it in sync)

**Relevant context**
- [`supabase/schema.sql`](supabase/schema.sql)
- [`supabase/migrations/`](supabase/migrations/)
- [`lib/database.types.ts`](lib/database.types.ts)
- [`lib/tasks.ts`](lib/tasks.ts)
- [`lib/offer.ts`](lib/offer.ts)
- [`lib/thing-persistence.ts`](lib/thing-persistence.ts)
- [`supabase/migrations/006_atomic_functions.sql`](supabase/migrations/006_atomic_functions.sql)

**Status** — [ ] pending

---

### 2. Offer logic — urgency cap, domain spread, no urgency on project steps

**Intent**
Four design rules are not enforced in the current offer logic:

1. **One clock-bearing slot per spread.** Currently obligations take one slot and care groups take a separate slot — both carry clock signals. The design says they compete for the same one slot; obligations win when both are due.

2. **No urgency language on project steps.** `buildReason` currently falls through to a `next_due` branch that applies "due now / due tomorrow / due in N days" to any step with a `next_due`, regardless of thing class. With `next_due` removed from steps, this branch disappears entirely — but the intent still needs to be explicit in what remains.

3. **Domain spread axis.** `pickWithSpread` currently spreads only on `band`. The design adds `domain` as a third axis: avoid picking two items from the same domain when alternatives exist. Domain must come through the offer query.

4. **`OfferItem` must expose `mode` and `domain`.** The spread varies on band, mode, and domain. `OfferItem` currently exposes `band` and `needs_know_how` but not `mode` or `domain`. Add both — they are available on the thing/step at mapping time and are needed for spread logic and future card rendering.

Additionally: `buildReason` has a `last_done_at` branch for recurring steps that will be dead code once step-level recurrence is removed. Remove it cleanly.

**Expected outcomes**
- `computeOffer` enforces: obligation present → care group suppressed (obligation wins the one clock slot)
- `pickWithSpread` receives `domain` on each item and uses it as a third spread axis (band first, then mode, then domain)
- `buildReason` no longer has the `next_due` fallback branch (removed with the column); the `last_done_at` branch also removed; obligation due-date reason reads from `thing.due_date`
- `OfferItem` includes `mode: "thinking" | "doing"` and `domain: string`; `computeOffer` populates both
- `OfferComputationInput` gains `completionCount: number` (for tenure, next sub-task)
- `lib/offer-data.ts` query includes `domain` and `due_date` in the things select and passes them through

**Todo list**
1. Update `computeOffer` — obligation present suppresses care group; they share the one clock slot
2. Update `buildReason` — remove the `next_due` project branch and the `last_done_at`/recurrence branch; obligation due-date reason reads from `thing.due_date`
3. Update `pickWithSpread` — add domain as third spread axis
4. Add `mode` and `domain` to `OfferItem` type; populate them in `computeOffer`'s mapping step
5. Update `lib/offer-data.ts` — add `domain` and `due_date` to things select query; add `completionCount` query (count of `done` step_events for the user); pass both into `computeOffer`
6. Update `OfferComputationInput` and related types to include `domain`/`due_date` on things and `completionCount`

**Relevant context**
- [`lib/offer.ts`](lib/offer.ts)
- [`lib/offer-data.ts`](lib/offer-data.ts)
- DESIGN.md: "One clock-bearing slot per spread, maximum", "At least one item per spread carries no time signal at all", "The spread varies on band, mode and domain"

**Status** — [ ] pending

---

### 3. Tenure gate — conservative early phase

**Intent**
New users should get a conservative offer until they have enough completions for the efficacy loop to be established. The design specifies: below ten completions (working assumption), degrade to generic reason lines sooner and skip `needs_know_how` steps whose know-how question hasn't been answered. Floor rule: never return fewer than one offer — fall back to generic if filtering would empty the pool.

Tenure is not stored; it is derived from `completionCount` passed into `computeOffer` (computed in sub-task 2).

**Expected outcomes**
- `computeOffer` accepts `completionCount` and applies conservative logic below the threshold
- Early-phase logic: skip unconfirmed `needs_know_how` steps; degrade to generic reason lines
- Floor rule: if filtering would empty the pool, fall back to generic step names ("Next thing on X") rather than returning an empty offer
- Threshold constant is named and documented as a working assumption

**Todo list**
1. Add `TENURE_THRESHOLD` constant to `lib/offer.ts` with a comment marking it as a working assumption
2. Add `isEarlyPhase(completionCount: number): boolean` helper
3. In `computeOffer`, filter out `needs_know_how` steps from the project pool when early phase is active
4. Apply floor rule: if filtering produces an empty pool, use unfiltered pool with generic step names
5. In `buildReason`, return `null` (generic fallback) for early-phase items rather than generating specific reasons

**Relevant context**
- [`lib/offer.ts`](lib/offer.ts)
- DESIGN.md: "Tenure and the early phase"

**Status** — [ ] pending

---

### 4. Extraction prompt — domain, perceptible-end ordering, encouragement ban, no step-level recurrence

**Intent**
The extraction prompt needs four changes:
1. Each extracted thing must include a `domain` field (home / admin / vehicle / garden / finance / other).
2. Step ordering heuristic: where chain order is genuinely flexible, prefer steps where something visibly changes early.
3. Explicit ban on encouragement language in step names and reason lines.
4. Remove the `recurrence_rule` and `next_due` fields from the step output schema — recurring care things now produce entities + care plans via a separate path, not thing + steps.

**Expected outcomes**
- `LIFEWALK_EXTRACTION_PROMPT` includes `domain` in the per-thing output spec with the six valid values
- Prompt instructs the model to front-load steps with perceptible outcomes where order is flexible
- Prompt explicitly bans encouragement language ("nearly there", "good effort") in any output
- `recurrence_rule` and `next_due` are removed from the step field spec in the prompt
- The example JSON in the prompt is updated to reflect the new schema
- `LifeWalkExtractedStep` type in `lib/tasks.ts` (updated in sub-task 1) matches the prompt

**Todo list**
1. Add `domain` field to per-thing output in `LIFEWALK_EXTRACTION_PROMPT` with allowed values and guidance
2. Add ordering heuristic rule to the step extraction rules
3. Add explicit tone rule: no encouragement language in any output field
4. Remove `recurrence_rule` and `next_due` from step field spec; add a note that recurring care is a separate extraction path (not covered by this prompt)
5. Update the example JSON at the end of the prompt
6. Verify `LifeWalkExtractedThing` and `LifeWalkExtractedStep` types match the updated prompt

**Relevant context**
- [`lib/lifewalk-prompt.ts`](lib/lifewalk-prompt.ts)
- [`lib/tasks.ts`](lib/tasks.ts)
- [`lib/lifewalk-parse.ts`](lib/lifewalk-parse.ts)

**Status** — [ ] pending

---

### 5. Stop ritual — note and photo capture on the FocusScreen

**Intent**
The stopping ritual is structural per the design: the spoken/typed note and photo are what make mid-stop resumable. Currently `FocusScreen` has Done / Still Going / Let this go, with no way to record where you got to.

The flow is post-tap, not pre-tap: tapping "Still going" records the stop event immediately, then presents the note and photo prompt on a new screen. The prompt is dismissible without friction — skipping it costs nothing. A note that blocks the exit gets avoided by closing the app, which loses both the event and the note.

The `stopped` event type is referenced in DESIGN.md's event type list but not yet present in `StepEventInput`. The note and photo URL go into metadata on the `stopped` event.

**Expected outcomes**
- Tapping "Still going" immediately records a `stopped` event and transitions to a lightweight "where did you get to?" screen
- The note screen has a text input and an optional photo, both dismissible — "Skip" or equivalent exits cleanly with no stored note
- If a note is entered and/or a photo taken, a second `stopped` event is recorded with the metadata, or the original event is updated — prefer recording a second event to avoid a read-modify-write
- `stopped` is added to `StepEventInput` in `lib/tasks.ts` and maps to `edited` in DB with `{ kind: "stopped", note?, photo_url? }` metadata
- The note screen is a new `StopNoteScreen` component in `app/components/offer/`
- `FocusScreen` UI and the new screen are clean, Tailwind-compliant, factual copy ("Where did you get to?" not "Good work!")
- The prompt is not shown again on the next offer — it is a one-time post-stop screen, dismissed automatically when the user returns to the offer

**Todo list**
1. Add `"stopped"` to `StepEventInput` in `lib/tasks.ts`; ensure `resolveEventTypeForDb` maps it to `"edited"` with `{ kind: "stopped" }` metadata convention
2. Add `"stop_note"` screen to the `Screen` union in `app/components/offer/types.ts`
3. Create `app/components/offer/StopNoteScreen.tsx` — text input, optional photo (file input for now; camera API is a future concern), skip button, save button; no blocking, no encouragement copy
4. Update `handleDone(stillGoing: true)` in `useOfferCardState.ts` — record the `stopped` event client-side via `POST /api/steps/{step_id}/event`, then call the still-going route, then transition to `"stop_note"` screen
5. After note/photo submission or skip, record a second `stopped` event if note or photo is present, then transition to `"offer"` screen
6. Update `app/components/OfferCard.tsx` (or wherever screen routing lives) to render `StopNoteScreen` when screen === `"stop_note"`

**Relevant context**
- [`app/components/offer/FocusScreen.tsx`](app/components/offer/FocusScreen.tsx)
- [`app/components/offer/useOfferCardState.ts`](app/components/offer/useOfferCardState.ts)
- [`lib/tasks.ts`](lib/tasks.ts)
- [`app/api/things/[id]/done/route.ts`](app/api/things/[id]/done/route.ts)
- DESIGN.md: "Stop", "Stops are events, not fields on the step"

**Status** — [ ] pending

### 6. Per-thing degradation to generic (safety valve for wrong chains)

**Intent**
The design specifies that a thing whose chain is being corrected repeatedly should drop to a generic step line ("Next thing on X") rather than showing something specific that keeps being wrong. This is the safety valve for specific-by-default while it is being proven. The signal is `nudged_back` events per thing — count them from `step_events`.

Per-thing degradation is distinct from tenure (global completion count). Tenure gates early users globally. Per-thing degradation gates specific things whose chains are proving wrong.

**Expected outcomes**
- `lib/offer-data.ts` fetches per-thing nudge-back counts from `step_events` and passes them into `computeOffer`
- `computeOffer` / offer item mapping: if a thing has >= threshold `nudged_back` events, the step_name falls back to "Next thing on X" regardless of whether a live step exists
- Threshold is a named constant, documented as a working assumption (suggest: 3 nudges back)
- The generic fallback is already used in the step_name field — this extends that logic conditionally

**Todo list**
1. Add per-thing nudge-back count query to `lib/offer-data.ts` (count `nudged_back` events grouped by `thing_id`)
2. Pass the map into `computeOffer` as `nudgeBackCounts: Record<string, number>`
3. Add `NUDGE_BACK_THRESHOLD` constant to `lib/offer.ts`
4. In offer item mapping, check nudge-back count against threshold; use generic fallback if exceeded
5. Update `OfferComputationInput` type to include `nudgeBackCounts`

**Relevant context**
- [`lib/offer.ts`](lib/offer.ts)
- [`lib/offer-data.ts`](lib/offer-data.ts)
- DESIGN.md: "Versioning — v1 — Per-thing degradation"

**Status** — [ ] pending

---

### 7. Update all tests to match new types and behaviour

**Intent**
All existing tests must continue to pass after the type and logic changes above. Some will need updating because the types changed (recurrence fields removed, domain added, completionCount added). New tests are needed for:
- Domain spread axis in `pickWithSpread`
- One-clock-slot cap (care group suppressed when obligation present — this already has a test; verify it still captures the right behaviour after the restructure)
- Tenure gate (early phase conservatism, floor rule)
- Per-thing degradation (generic fallback on repeated nudge-back)
- `buildReason` no longer having the project `next_due` branch
- Stop event recording (stopped event type, metadata shape)
- Extraction prompt includes domain field

Tests must use the project's established patterns: `describe` / `it` / `expect`, factory helpers (`makeThing`, `makePlan`), no mocking of internal logic.

**Expected outcomes**
- `npm test` passes with zero failures
- No test exercises removed behaviour (recurrence on steps, `next_due` on steps)
- New tests cover all behaviour added in sub-tasks 1–7
- `test/lib-offer.test.ts` updated for new types and new logic
- `test/lib-lifewalk-parse.test.ts` updated for new extraction shape (no recurrence on steps, domain present)
- `test/lib-thing-persistence.test.ts` updated for new persistence shape

**Todo list**
1. Update `test/lib-offer.test.ts` — remove tests for step `next_due` project reason branch; update `makeThing` factory to remove recurrence fields from steps; add domain to things; add domain spread tests; add tenure gate tests; add per-thing degradation tests
2. Update `test/lib-lifewalk-parse.test.ts` — update expected extraction shape (domain present, no recurrence on steps)
3. Update `test/lib-thing-persistence.test.ts` — update for new fields
4. Update `test/api-routes.test.ts` and `test/api-routes-2.test.ts` if they reference removed fields
5. Add new test file `test/lib-offer-tenure.test.ts` for tenure and degradation logic (or add to existing offer test file if it stays manageable)

**Relevant context**
- [`test/lib-offer.test.ts`](test/lib-offer.test.ts)
- [`test/lib-lifewalk-parse.test.ts`](test/lib-lifewalk-parse.test.ts)
- All test files in `test/`

**Status** — [ ] pending

---

### 8. Final validation — lint, typecheck, build

**Intent**
All changes across sub-tasks 1–8 must produce a clean codebase with no lint errors, no TypeScript errors, and a successful build.

**Expected outcomes**
- `npm run typecheck` exits 0
- `npm run lint` exits 0 with no warnings
- `npm run build` exits 0
- `npm test` exits 0

**Todo list**
1. Run `npm run typecheck` and fix all type errors
2. Run `npm run lint` and fix all lint warnings and errors
3. Run `npm run build` and fix any build failures
4. Run `npm test` and confirm all tests pass

**Relevant context**
- [`package.json`](package.json) for script names

**Status** — [ ] pending

---

## Dependency order

```
Sub-task 1 (schema + types)
  └── Sub-task 2 (offer logic — domain, due_date, OfferItem type, urgency cap)
        └── Sub-task 3 (tenure — depends on completionCount in offer input)
              └── Sub-task 6 (per-thing degradation — depends on offer input shape)
Sub-task 4 (prompt — depends on type changes from 1, independent of 2–6)
Sub-task 5 (stop ritual — depends on task type change from 1, independent of 2–4)
Sub-task 7 (tests — depends on all of 1–6)
Sub-task 8 (validation — depends on 7)
```

Sub-tasks 4 and 5 can be worked on in parallel with 2–3 once sub-task 1 is complete.

## Notes for implementation

- **`notify_window` naming is correct.** Do not rename. The design doc's mention of `notify_window_days` was a one-off inconsistency; the code name is authoritative.
- **`due_date` on `things` for obligations.** The migration in sub-task 1 must add `due_date date` to `things` alongside the domain addition. `buildReason` in offer logic reads from this field, not from a step field. The `insert_thing_with_steps` RPC must be updated to accept and persist `due_date`.
- **Schema.sql is the canonical baseline.** Keep it in sync with migrations; do not let schema.sql diverge.
- **Tailwind v4.** The project uses Tailwind v4 (`@tailwindcss/postcss`). Use only documented v4 utility classes. Do not use v3-only syntax.
- **All copy must be factual, not encouraging.** Any new UI text added in sub-task 5 (stop ritual) must be neutral: "Where did you get to?" not "Great work — where did you get to?".
