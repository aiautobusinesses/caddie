# Refactor Continuation Notes

## Goal
Complete the substantial refactor so the codebase looks intentionally engineered rather than organically accreted. The target state is:
- shared domain logic centralized in [`lib`](lib)
- thin route handlers in [`app/api`](app/api)
- large UI workflows broken into smaller focused components/hooks
- test setup aligned with the refactored architecture
- all relevant validation passing

## What is already done

### Shared offer logic extracted
A shared offer engine now exists in [`lib/offer.ts`](lib/offer.ts).

It is already wired into:
- [`app/page.tsx`](app/page.tsx)
- [`app/api/offer/route.ts`](app/api/offer/route.ts)

This removed the biggest duplication point between the page render path and the API route.

### Shared thing persistence helper created
A persistence helper exists in [`lib/thing-persistence.ts`](lib/thing-persistence.ts).

It has **not** yet been adopted everywhere it should be.

### Test bootstrap exists
Current bootstrap file is [`test/setup.tsx`](test/setup.tsx).

Note: the external changes list reported deletion of [`test/setup.ts`](test/setup.ts), but the current active setup file is [`test/setup.tsx`](test/setup.tsx).

## What still needs to be done

### 1. Adopt [`persistThings()`](lib/thing-persistence.ts:15)
Refactor these routes to use the helper instead of duplicating insert logic:
- [`app/api/things/route.ts`](app/api/things/route.ts:6)
- [`app/api/capture/voice/route.ts`](app/api/capture/voice/route.ts:50)

Expected result:
- request parsing and auth remain in routes
- persistence lives in [`persistThings()`](lib/thing-persistence.ts:15)
- route handlers only translate thrown errors into HTTP responses

### 2. Extract step/thing completion services
There is still duplicated completion/advance logic across:
- [`app/api/things/[id]/done/route.ts`](app/api/things/[id]/done/route.ts:7)
- [`app/api/steps/[id]/event/route.ts`](app/api/steps/[id]/event/route.ts:9)

Create shared domain helpers in something like:
- [`lib/things-service.ts`](lib/things-service.ts)
- or [`lib/steps-service.ts`](lib/steps-service.ts)

Likely responsibilities:
- mark thing started
- mark thing done / still going
- advance live step
- record step event
- handle recurring vs non-recurring done semantics

### 3. Split [`OfferCard`](app/components/OfferCard.tsx:17)
[`app/components/OfferCard.tsx`](app/components/OfferCard.tsx:17) is still the largest UI hotspot.

It should be broken into smaller units, for example:
- [`app/components/offer/OfferScreen.tsx`](app/components/offer/OfferScreen.tsx)
- [`app/components/offer/FocusScreen.tsx`](app/components/offer/FocusScreen.tsx)
- [`app/components/offer/SettingsScreen.tsx`](app/components/offer/SettingsScreen.tsx)
- optionally [`app/components/offer/useOfferCardState.ts`](app/components/offer/useOfferCardState.ts)

Keep behavior unchanged. The goal is readability and separation, not feature work.

### 4. Clean test setup
Review [`test/setup.tsx`](test/setup.tsx).

Current issues:
- too many global mocks
- component mock for [`CaptureModal`](app/components/capture/CaptureModal.tsx) is globally applied
- fetch and browser globals are broadly mocked

Prefer:
- keep universal environment shims global
- move feature-specific mocks into test files where possible

### 5. Validation
When refactor is complete, run at minimum:
- [`npm run test`](package.json:14)
- [`npm run typecheck`](package.json:9)
- [`npm run lint`](package.json:10)

If the broader test/coverage work is resumed later, also run:
- [`npm run test:coverage`](package.json:16)

## Current status summary
This refactor is **partially complete**.

Completed:
- offer logic extraction

Not completed:
- persistence adoption
- completion/event service extraction
- OfferCard decomposition
- test architecture cleanup
- final validation
