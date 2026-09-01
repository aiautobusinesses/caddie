---
name: design-bug-check
description: Use when the user wants to check for bugs against the design doc, audit the codebase vs DESIGN.md, or verify the implementation matches the spec.
---

# Design Bug Check

Walk through every section of `DESIGN.md` and verify the implementation matches. Fix each
discrepancy found, write invariant tests, and leave design-constraint comments at decision points.

## Step 1 — Read the spec

Read `DESIGN.md` in full. The August 2026 revision supersedes any earlier one. Note every
behavioural rule, constraint, and invariant stated in the doc.

## Step 2 — Audit the implementation

For each rule found in Step 1, locate the code that implements it using `grep` and `read_file`.
Check:

- **Logic correctness** — does the code do what the spec says?
- **Edge cases** — does the code handle null / missing fields as the spec intends?
- **Copy rules** — no encouragement copy, urgency language on projects, progress bars, or
  percentages anywhere in the UI (check all `app/components/` files).
- **DB / RPC sync** — run `node scripts/generate-functions-sql.mjs` to regenerate
  `supabase/functions.sql` from the migrations before comparing anything against it.

When code and spec disagree, determine which one is wrong before fixing anything:

- **Code is wrong** — fix the code (the normal case).
- **Doc is wrong** — do not fix the code to match a wrong spec. Instead, report the
  discrepancy as a doc error: quote the offending sentence, state what the code actually
  does and why that is correct, and propose the corrected wording. Do not silently update
  `DESIGN.md`; surface it to the user for a conscious decision.
- **Doc is ambiguous** — state the ambiguity explicitly. If two defensible readings lead
  to different implementations, say so. Do not pick one silently.

The doc can be wrong. It has been wrong before (recurrence model conflict, orphaned shape
field). Treating it as infallible makes it unfalsifiable; the point of this audit is to
find gaps in both directions.

## Step 3 — For each bug found, write a failing test first

Before fixing any bug, write the test that would catch it:

1. Add the test to the appropriate file in `test/`.
2. Run the suite and confirm the new test **fails** (it should, because the bug still exists).
   If the test passes before the fix, the branch is unreachable — remove the test and the
   proposed fix.
3. Only then apply the fix and confirm the test turns green.

This is the dead-code guard: a test that passes before the fix exists reveals dead/unreachable
code, not a real bug.

## Step 4 — Add INV: invariant tests for design rules

For every sentence in `DESIGN.md` that states a hard invariant (a rule that must hold for every
spread, every offer, every call), add a dedicated test with the `INV:` prefix:

```ts
// INV: "Exact quote from DESIGN.md."
// DESIGN.md §Section, line N
it("INV: short description of the invariant", () => { … })
```

Place these in a `"design invariants"` describe block in the relevant test file:

- Offer-assembly rules → `test/lib-offer.test.ts`
- Care-grouping rules → `test/lib.test.ts` (inside the `care grouping` describe block)
- Other `lib/**` rules → closest matching test file

Each `INV:` test must be written against the design sentence, not against the current
implementation. If the implementation changes, the test should catch the regression.

## Step 5 — Add design-constraint comments at decision points

At every branch or filter in `lib/` and `app/api/` that enforces a design rule, add a short
comment citing the rule. Examples:

```ts
// DESIGN: obligations missing due_date or notify_window are excluded from the offer entirely
// DESIGN: no-reason guarantee — at least one project item must have reason: null
// DESIGN: "due now" is only for genuinely overdue plans, not merely-due ones
```

## Step 6 — Add copy-rule comment blocks to UI components

At the top of every `app/components/offer/` component, add (or verify) a copy-rule block:

```tsx
{/*
  COPY RULES (DESIGN.md §Copy):
  – No encouragement copy ("great work", "you're on a roll", "welcome back", etc.)
  – No urgency language on project steps
  – No progress bars or percentages
*/}
```

## Step 7 — Run the full test suite

```
node node_modules/vitest/vitest.mjs run
```

All tests must pass. Exit code 1 from coverage thresholds is pre-existing and acceptable; test
failures are not. Fix any failures before reporting done.

## Step 8 — Report

List every bug found with:
- The DESIGN.md sentence it violated
- The file and line where the bug was
- What was changed to fix it

Then list every new `INV:` test added, citing the design sentence each one pins.

---

## Project conventions

- `supabase/functions.sql` — generated from migrations, not maintained by hand. Run
  `node scripts/generate-functions-sql.mjs` to rebuild it. The script concatenates every
  `CREATE OR REPLACE FUNCTION` block from `supabase/migrations/*.sql` in order, keeping
  the last definition of each function name. Do not edit `functions.sql` directly; edit
  the migration and regenerate.
- `schema.sql` — documentation only, not used to bootstrap anything (Supabase runs migrations).
  Keep it in sync with migrations so it isn't misleading.
- Coverage: 100% enforced on `lib/**` and `app/api/**`; `app/components/**` is reported but not
  enforced.
- `vitest.config.mts` — check for stale entries in the coverage include list (files that no
  longer exist).
