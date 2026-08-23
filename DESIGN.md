# Caddie — design

*Written August 2026. Supersedes the May 2026 "home intelligence" concept.*

---

## What it is

Caddie keeps track of everything you've got on — the stuff that has to happen anyway, and the stuff you'd like to get round to — and never shows you the whole lot at once. It works out the steps for you without telling you how many there are, and when you turn up wanting something to do, it offers two or three things you could start now. It cares about you starting, not finishing. It keeps a record of what you actually did and shows it back as things you've done, not as how far through you are. And if you don't do it, nothing bad happens, and it tells you so.

---

## The problem

Decision and task paralysis against a large, varied pile: house jobs, side projects, obligations, family, work, hobbies.

Four separable parts:

1. **Things are chains, not things.** "Hang pictures" is buy kit, fill, sand, prep, paint, decide placement, hang — and the only step wanted is the last one. Multiply by dozens.
2. **Two economies got mixed.** Obligations (MOT, insurance, watering) arrive whether or not you want them and should cost nothing. Projects are discretionary — nothing breaks if they never happen, but not doing them is what feels like stagnation. They want opposite treatment.
3. **Seeing the pile is the injury.** Can't do them all, can't do only the interesting ones, so nothing gets done. Any tool that displays 75 items recreates the paralysis it's meant to solve.
4. **There's a loop with a sign on it.** Doing little feels bad, which makes doing less easier.

**What actually causes action**, from lived examples: something breaks and needs fixing; a puzzle presents itself; someone else is affected; irritation crosses a threshold after months. In every case the decision was made by circumstance, not by choosing well from a list. No breakthrough has ever come from surveying the pile and picking correctly.

---

## What the evidence says

Reliability tiers matter — the design leans on the top tier for what it *refuses* to do, and on weaker ground for what it *does*.

### Reliable (meta-analytic, large samples, replicated)

| Finding | Source |
|---|---|
| Delay discounting elevated in ADHD, d = .43 (21 studies, N=3,913); hypothetical rewards demotivating vs real | Jackson & MacKillop 2016; Marx et al. 2021 |
| Procrastination predicted by task aversiveness, delay, self-efficacy, impulsiveness (691 correlations); Motivation = (Expectancy × Value) / (1 + Impulsiveness × Delay) | Steel 2007; Steel & König 2006 |
| Progress monitoring improves attainment, d+ = 0.40 (138 studies, N=19,951) — **larger when physically recorded or publicly visible** | Harkin et al. 2016 |
| Tangible task-contingent rewards undermine intrinsic motivation (128 studies); so do deadlines, directives, imposed goals | Deci, Koestner & Ryan 1999 |
| Choice overload moderated by set complexity, task difficulty, preference uncertainty, effort-minimising goal (99 observations, N=7,202) | Chernev et al. 2015 |
| Zeigarnik recall effect does not replicate; **Ovsiankina resumption tendency does** (~two-thirds resumption rate, unprompted) | 2025 meta-analysis |
| Stimulants and atomoxetine only interventions improving core symptoms on both rater types; **no efficacy on quality of life** | Ostinelli et al., Lancet Psychiatry 2025 |

### Moderate (lab-based, smaller, or different setting)

- Unpacking improves duration estimates by making tasks look *bigger*; segmentation effect (Kruger & Evans; Forsyth & Burt)
- Resumption cues reduce resumption lag; the **interruption lag** — the moment before stopping — does the work; environmental position markers beat text (Altmann & Trafton; CHI 2024 AR study; Sci Rep 2025)
- Prospective memory: focal cues trigger spontaneous retrieval, nonfocal require active monitoring; time-based more demanding than event-based (McDaniel & Einstein)
- Habits form from repetition in consistent contexts, 18–254 days, missing one day doesn't matter; instigation habits suffice for complex actions (Lally 2010; Gardner)
- Sub-goal completion licenses stopping; progress framing vs commitment framing (Fishbach & Dhar 2005)
- Self-forgiveness for procrastinating reduces subsequent procrastination, mediated by mood (Wohl et al.; Sirois)
- Progress principle — small wins drive inner work life (Amabile & Kramer, ~12,000 diary entries, correlational, workplace)

### Weak (hypothesis only)

- CSCW 2026 speed-dating study of 13 AI concepts — speculative mock-ups, self-selected sample, no working systems
- Boice on short regular sessions beating binges — 1980s, methods dated, has critics
- CHI 2026 Reddit analysis (147 threads): AI helps because **reacting to a draft costs less executive function than generating one** — observational but the best articulation available of why the core move works
- JITAI effect sizes; body doubling

### Discarded

- Ariely & Wertenbroch commitment devices — direct replication failed; field experiment null; one study found interim deadlines *halved* completion
- Zeigarnik recall
- Gamification

### Genuine gaps, unfillable by search

- Nobody has tested one-at-a-time offering against a list in a deployed system
- No RCT on any task-management tool for ADHD adults (the five existing digital-intervention RCTs are CBT and psychoeducation)
- Nothing on multi-step self-directed projects at domestic scale — four seams searched, absent

---

## The mechanic

### Capture
Voice or one-by-one, any surface, no fields. One gesture handles new things, completions and corrections — a sentence router works out which.

### Hold
Everything, out of your head. Chains stored whole, never shown whole. Two classes, split on a single question: **does something bad happen if this date passes?**

### Offer
You arrive wanting something to do; Caddie answers.

- **The unit is the live step, not the thing.** "Order a bath panel", never "bath panel". This is the finding the whole design turns on.
- Two or three offers of **deliberately different shapes** — ends inside ten minutes / already started / wants a proper run — so the right one is obvious without Caddie asking how long you've got or how you feel.
- One slot goes to an obligation if any is inside its window; the rest are project steps.
- Reason attached, always true. **Specific when Caddie knows, generic when it doesn't** ("next thing on the bath panel"). Never invents a fact to justify an offer.
- Buying is a step like any other, not a blocker.

The shape spread is a consequence of picking across varied things, not a filter. A step is already a decomposed unit — "order the bath panel" is inherently short, "sand the wall" is a proper run. Claude sets `estimated_minutes` on each step at extraction time; the offer uses this to prefer variety across the three slots without ever asking the user. No separate shape field is needed.

### Accept
One question, only when the answer changes what Caddie would offer ("got the paint?"). A "no" never blocks — it moves the live step to buying the paint.

### Stop
A moment before you stop where you say where you got to, plus a photo where it makes sense. The interruption lag is what makes returning cheap.

### Repair
Nudge back when Caddie is ahead of you. Voice when it's behind. Chain shown after the fact, framed as what you did.

### Reflect
Things done, no percentages, no penalty for gaps. Possibly a display in the house — which hits both of Harkin's amplifying moderators without asking anyone to hold you accountable.

**Note on Fishbach & Dhar**: the "no progress displays" rule applies to forward-looking progress (percentage complete, steps remaining) which licenses stopping mid-chain. Retrospective displays — what you actually did, shown after the fact — are a different thing and the concern does not apply to them. This distinction matters when the Reflect view is built: a list of completed things is fine; a progress bar on an open chain is not.

---

## Deliberately excluded, and why

| Excluded | Reason |
|---|---|
| Ranking as the core mechanism | No evidence selection is the broken part; four rounds of testing found the unit was wrong, not the order |
| Anything trying to make you want something | Nothing reliably does this from inside |
| Points, badges, rewards for completion | Deci — undermines intrinsic motivation, worst on things already found interesting |
| Streaks that break, snooze budgets, penalties for the dip | Against Deci, Lally, and the self-forgiveness work simultaneously |
| Progress bars and percentages | Fishbach & Dhar — licenses stopping (see note in Reflect section for the retrospective display distinction) |
| Celebrating sub-step completion | Treated as a substitute for the next step |
| Manufactured deadlines | Failed replication; one result halved completion |
| Showing the honest total cost of a chain | Unpacking corrects optimism by revealing true cost — wrong medicine for initiation |
| Asking energy/time before offering | The shape spread does this job without the friction |
| Ambient or subtle cues | Participants said they'd miss them entirely |
| Emotional check-ins before capture | Friction at the worst moment |
| The full list, ever | Chernev |

---

## Architecture

A **small API with several clients**, not a web app with features. Voice forces this: if a sentence can arrive from a speaker as well as a screen, capture, completion and offer must exist as endpoints before they exist as UI.

- Next.js PWA on Vercel — installable, so laptop and Android are one build
- Supabase for data, auth, RLS
- Server-side LLM for extraction, chain breakdown, sentence routing
- Cron + edge function for obligation notifications only
- Offline capture queued and synced — cheap now, painful retrofitted
- Stable API contract before clients multiply

**Voice into the house is unresolved.** Google shut down Conversational Actions in 2023; whether anything replaces it for custom actions needs checking. Routing through Home Assistant's assistant to a Caddie endpoint is likely the shorter path, and would give the household display for free.

---

## Data model

Two tables, not one self-referencing table — because the fields barely intersect and half the columns would be null.

- **`things`** — name, class (obligation | project), `live_step_id` (FK → steps.id, updated on each step completion), notify window (obligations only, inferred, nudgeable)
- **`steps`** — thing_id, name, order, done, ends-cleanly-or-bleeds, estimated_minutes (set by Claude at extraction, never asked of the user), photo
- **`step_events`** — step_id, user_id, event_type, metadata

`live_step_id` is a stored FK rather than a derived query. The offer needs to fetch things and their live step title together in one join; a derived approach would require a lateral subquery per thing. The two-write cost per completion (mark step done + update `live_step_id`) is negligible and matches the existing event route pattern.

Depth beyond one level isn't wanted: the whole design is one live step at a time.

### Migration

The existing `tasks` and `task_events` tables will be dropped. There is no meaningful data in the current database. Users do a fresh Life Walk after migration. `push_subscriptions` and `profiles` survive unchanged.

---

## Extraction: one-pass vs two-pass

The Life Walk extraction must now output a nested structure (thing + ordered steps array) rather than the current flat task list. Tested both approaches against four synthetic narrations using `scripts/test-extraction.mjs` (results in `scripts/test-extraction-results.json`).

### Test cases

- **Multi-step project**: cracked bath panel — measure, order, prep wall (mould), dry, fit, seal
- **Single-step obligation**: MOT due 14 March, ten-minute phone call to book
- **Recurring maintenance**: peace lily, seasonal watering (every 3–4 days summer / 2 weeks winter)
- **Ambiguous**: "The garage is a complete state. Never quite know where to start."

### Results

**Multi-step project**

One-pass produced 6 steps in correct order including a "Allow treated wall to dry completely" waiting step with `estimated_minutes: null` and `ends_cleanly: true`. Two-pass produced 5 steps — collapsed the "measure up" and "order" into one ("Order replacement bath panel"), and marked the mould treatment as `ends_cleanly: true` where one-pass correctly flagged it `false`. One-pass was more faithful to the narration.

**Single-step obligation**

Both produced a single step. One-pass correctly set `next_due` on the step (`2025-03-14`) and left `recurrence_rule: null`. Two-pass set `recurrence_rule: { type: "annual", month: null, day: null }` — a malformed rule with null fields — and left `next_due: null`, losing the date. One-pass was correct; two-pass introduced a structured error.

**Recurring maintenance**

Identical output. Both: one step, `recurrence_rule: { type: "seasonal", summerDays: 3, winterDays: 14, anchor: "completion" }`, correct. Two-pass estimated 2 min vs one-pass 5 min — negligible difference.

**Ambiguous**

One-pass: 3 steps (sort into piles / remove donations+discards / organise). Two-pass: 6 steps, including a spurious "Maintain garage organization" step with a monthly recurrence rule. Two-pass over-decomposed and invented a recurring maintenance obligation that wasn't in the narration. One-pass was more restrained and more useful.

### Decision

**Use one-pass.** It matched or outperformed two-pass on all four cases. The two failure modes observed were both in two-pass: a malformed recurrence rule on the obligation case, and spurious step invention on the ambiguous case. One-pass is also simpler, faster, and cheaper.

---

## From the existing repo

**Keep:** the Next.js PWA shell, manifest, service worker, icons. Supabase auth, RLS, profiles. Life Walk end to end (record → transcribe → extract → review → save). The capture flow and API routes. Push subscription plumbing and the notify edge function — narrower job, but it survives.

**Rewrite:** schema (flat → chained). Extraction prompt (flat tasks → ordered steps). `lib/lifewalk-parse.ts` (new parser for the nested thing/steps shape; existing dedup logic was written for the flat model and does not carry over). The offer logic (new). The card (thing → step with reason).

**Delete:** `ContextCheck`. `lib/scoring.ts`. `lib/energy-labels.ts`. The snooze budget. The `/tasks` list page. `priority`, `energy` as offer inputs.

Roughly 60% of the code survives. The deleted parts are the ones that took longest to write.

---

## Build order

1. Schema: `things` / `steps` / `step_events`, drop `tasks` / `task_events`
2. Test one-pass vs two-pass extraction (see section above), then rewrite extraction prompt and `lib/lifewalk-parse.ts` for the nested shape
3. Offer logic — three, different shapes, reason attached, degrade to generic when unknown
4. Strip ContextCheck, scoring, energy labels, snooze, list page
5. Rework the card (thing → live step with reason)
6. Post-accept question

**Not in v1:** notifications and the obligation class, voice from the house, photos, the stopping ritual, the household display, nudge back/forward. All designed; none needed to find out whether the offer works.

---

## What to watch once it's running

- Do the offers land at the rate they did in testing?
- Does the live step drift faster than it can be corrected?
- Do you open it at all, unprompted?

---

## Open questions

- **Whether pull-only holds for projects.** Dropped notifications on judgement; the CSCW participants wanted the opposite. Weak evidence either way — revisit after a fortnight of real use.
- **The long-run slot.** Boice says short regular beats long infrequent, which cuts against biasing three-hour windows toward a proper run at a chain. Weak evidence; watch it.
- **Showing the chain after the fact.** The one place the design might actively hurt — Fishbach & Dhar is moderate-tier and says sub-goal completion licenses stopping. The framing argument is an argument, not a finding. See note in Reflect section.
- **Routing through a real person.** The only remaining route to genuine externality. Divisive in the one study. Current instinct: passive visibility in the house rather than reporting to anyone.
- **Whether some things should be let go** rather than held as permanent debt.

---

## Honest position

Everything Caddie **refuses to do** rests on solid ground. Everything it **does** rests on moderate ground or on a five-round test with one person. The offer — three, different shapes, reasons attached — is the thing at the centre and it is unevidenced by anyone.

That's defensible for a v1 built for its author. It would not be defensible for a product sold as evidence-based. Worth remembering if Caddie ever leaves the house.
