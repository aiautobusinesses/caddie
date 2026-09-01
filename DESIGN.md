# Caddie — design

*Written August 2026. Supersedes the May 2026 "home intelligence" concept.*
*Updated with ADHD-mechanisms and brain-research addendum findings.*

**Provenance note.** Most of this document comes from a long design conversation grounded in the research listed at the end. Two sections — `needs_know_how` / the familiarity accept-question, and the one-pass vs two-pass extraction test — originated in implementation work rather than in that conversation. They are marked *(implementation-derived)* where they appear. Not less trustworthy; differently sourced, and worth knowing when revisiting.

---

## What it is

Caddie keeps track of everything you've got on — the stuff that has to happen anyway, and the stuff you'd like to get round to — and never shows you the whole lot at once. It works out the steps for you without telling you how many there are, and when you turn up wanting something to do, it offers two or three things you could start now. It cares about you starting, not finishing. It keeps a record of what you actually did and shows it back as things you've done, not as how far through you are. And if you don't do it, nothing bad happens, and it tells you so.

---

## The problem

Decision and task paralysis against a large, varied pile: house jobs, side projects, obligations, family, work, hobbies.

Four separable parts:

1. **Things are chains, not things.** "Hang pictures" is buy kit, fill, sand, prep, paint, decide placement, hang — and the only step wanted is the last one. Multiply by dozens.
2. **Different economies got mixed.** Obligations (MOT, insurance) arrive whether or not you want them and should cost nothing. Recurring care (plants, bins, filters) repeats forever with no chain at all. Projects are discretionary — nothing breaks if they never happen, but not doing them is what feels like stagnation. They want different treatment.
3. **Seeing the pile is the injury.** Can't do them all, can't do only the interesting ones, so nothing gets done. Any tool that displays 75 items recreates the paralysis it's meant to solve.
4. **There's a loop with a sign on it.** Doing little feels bad, which makes doing less easier.

**What actually causes action**, from lived examples: something breaks and needs fixing; a puzzle presents itself; someone else is affected; irritation crosses a threshold after months. In every case the decision was made by circumstance, not by choosing well from a list. No breakthrough has ever come from surveying the pile and picking correctly.

---

## What the evidence says

Reliability tiers matter — the design leans on the top tier for what it *refuses* to do, and on weaker ground for what it *does*. Full citations in `caddie-references.md`.

### Reliable (meta-analytic, large samples, replicated)

| Finding | Source |
|---|---|
| Delay discounting elevated in ADHD, d = .43 (21 studies, N=3,913); hypothetical rewards demotivating vs real | Jackson & MacKillop 2016; Marx et al. 2021 |
| Procrastination predicted by task aversiveness, delay, self-efficacy, impulsiveness (691 correlations); Motivation = (Expectancy × Value) / (1 + Impulsiveness × Delay) | Steel 2007; Steel & König 2006 |
| Progress monitoring improves attainment, d+ = 0.40 (138 studies, N=19,951) — **larger when physically recorded or publicly visible** | Harkin et al. 2016 |
| Tangible task-contingent rewards undermine intrinsic motivation (128 studies); so do deadlines, directives, imposed goals | Deci, Koestner & Ryan 1999 |
| Choice overload moderated by set complexity, task difficulty, preference uncertainty, effort-minimising goal (99 observations, N=7,202) | Chernev et al. 2015 |
| Zeigarnik recall effect does not replicate; **Ovsiankina resumption tendency does** (~two-thirds resumption rate, unprompted) | 2025 meta-analysis |
| Stimulants and atomoxetine only interventions improving core symptoms on both rater types; **no efficacy on quality of life** | Ostinelli et al. 2025 |
| No convincing far transfer from working-memory training (87 publications, 145 comparisons) | Melby-Lervåg et al. 2016 |
| Time perception impaired across estimation, discrimination, reproduction (55 studies); temporal myopia — three weeks and three months occupy the same "not now" *(effect sizes cited are child/adolescent; adult direction consistent)* | Meta-analysis; Barkley |
| Working-memory deficits in adults with ADHD, phonological and visuospatial (38 studies); goal neglect the relevant construct | Meta-analysis |
| Emotion dysregulation in adults with ADHD: g = 1.17 general, g = 1.20 lability; r = 0.54 with symptom severity — larger than the WM or delay-discounting effects | Meta-analysis |
| Behavioural activation beats controls at SMD −0.74, medication at −0.42 (26 RCTs, N=1,524) | Meta-analysis |
| ADHD adults report lower perceived effectiveness of standard tools despite similar strategy use — design misalignment, not lack of use | Desrochers et al. 2019 |

### Moderate (lab-based, smaller, or different setting)

- Mastery experiences are the strongest source of self-efficacy; efficacy is domain-specific; failures cost most before efficacy is established; verbal persuasion is the weakest source (Bandura)
- Mere urgency effect — spurious urgency wins over importance across five experiments (Zhu, Yang & Hsee 2018)
- Focal goal activation inhibits alternatives; lessened when the alternative *facilitates* the focal goal; moderated by commitment (Shah, Friedman & Kruglanski 2002)
- Cognitive offloading reduces memory errors by an order of magnitude; driven by metacognitive belief about one's memory, not actual ability (Risko & Gilbert 2016). Counter-finding: AI assistance reduces persistence and independent performance
- Implementation intentions work; fail when the cue is too vague to fire, or the behaviour too small to move the goal (Gollwitzer; Toli et al. 2016)
- Prospective memory: focal cues retrieve spontaneously, nonfocal require monitoring; time-based more demanding than event-based (McDaniel & Einstein)
- Habits form 18–254 days in consistent contexts; missing one day doesn't matter; instigation habits suffice for complex actions (Lally 2010; Gardner)
- Unpacking improves duration estimates by making tasks look *bigger*; segmentation effect (Kruger & Evans; Forsyth & Burt)
- Resumption cues reduce resumption lag; the **interruption lag** does the work; environmental position markers beat text; flexibility in *when* to resume independently improves performance (Altmann & Trafton; CHI 2024; Sci Rep 2025)
- More than two intervening activities before interrupted work resumes; sometimes never resumed (Mark, González & Harris 2005)
- Sub-goal completion licenses stopping; progress vs commitment framing (Fishbach & Dhar 2005)
- Self-forgiveness for procrastinating reduces subsequent procrastination via mood (Wohl et al.; Sirois)
- Progress principle — small wins drive inner work life; the load-bearing word is *meaningful* (Amabile & Kramer)
- fMRI: striatal response to reward-predicting *cues* reduced in ADHD; response to *delivery* intact or heightened (n ≈ 14–15; mechanism not settled)
- Satisficing over maximising — direction safe, magnitude contested
- Ego depletion near-null in preregistered multilab work (d = 0.04, 0.08) — energy is not a budget
- Hyperfocus is real but not flow, outside the person's control, correlated with perseveration and anxiety

### Weak (hypothesis only)

- CSCW 2026 speed-dating study — speculative mock-ups, self-selected sample, no working systems
- CHI 2026 Reddit analysis: **reacting to a draft costs less executive function than generating one** — observational, but the best articulation of why the core move works
- Boice on short regular sessions beating binges — dated, has critics
- JITAI effect sizes; body doubling

### Discarded

Ariely & Wertenbroch commitment devices (replication failed; one study halved completion). Zeigarnik recall. Gamification. Brain training. The Eisenhower matrix (no controlled evidence). RSD as a construct. DMN/TPN "failure to deactivate".

### Genuine gaps, unfillable by search

- Nobody has tested one-at-a-time offering against a list in a deployed system
- No RCT on any task-management tool for ADHD adults
- Nothing on multi-step self-directed projects at domestic scale — four literatures searched, absent

---

## Three classes

Everything Caddie holds falls into one of three classes. They share the offer surface and almost nothing else.

| | **Obligation** | **Project** | **Recurring care** |
|---|---|---|---|
| Test | Something bad happens if the date passes | Nothing breaks if it never happens | Repeats forever, attached to an entity |
| Structure | Usually one step | Ordered chain, one live step | No chain — one action that resets |
| Trigger | Date, inside an inferred window | Pull only — user turns up | Interval, varying by month |
| Notified? | Yes | No | Yes, batched into groups |
| Clock slot | Yes | **Never** | Yes — counts against the same cap |

---

## The mechanic

### Capture
Voice or one-by-one, any surface, no fields. One gesture, one sentence, and a router works out what kind it is. Four types:

- **New thing** — "the bath panel's cracked"
- **Completion** — "done the seals"
- **Correction** — "actually the woodwork's finished", "I'm not at that step yet"
- **Focus declaration** — "I want to focus on the back bedroom", "forget the back bedroom for now" (see Focus, v1.5)

No modes, no separate screens. The router decides; the user just talks.

Wanted and enjoyable things — things you'd actually like to do — should be capturable and offerable. A project with no obligation attached is already a project in the schema; whether they need any additional structure is open until proven by use.

### Hold
Everything, out of your head. Chains stored whole, never shown whole.

### Offer
You arrive wanting something to do; Caddie answers.

- **The unit is the live step, not the thing.** "Order a bath panel", never "bath panel". This is the finding the whole design turns on.
- Two or three offers of **deliberately different shapes** — ends inside ten minutes / already started / wants a proper run — so the right one is obvious without Caddie asking how long you've got or how you feel.
- **One clock-bearing slot per spread, maximum.** Obligations and care groups both carry real consequence and compete for that one slot; obligations win when both are due. Project steps never get urgency language even if a date is attached — manufactured urgency on a project step is spurious by definition, and the mere urgency effect means it crowds out things that genuinely matter.
- **At least one item per spread carries no time signal at all.** Deliberately protected. Prefer a true non-clock reason ("you started this", "quick one"); fall back to no reason only if none applies.
- Reason attached, always true. **Specific when Caddie knows, generic when it doesn't** ("next thing on the bath panel"). Never invents a fact to justify an offer. Concrete gaps: "MOT's due in 12 days", never "due soon".
- Buying is a step like any other, not a blocker.
- The spread varies on **band, mode and domain** — avoid clustering two items on the same axis when alternatives exist.

The shape spread is a consequence of picking across varied things, not a filter. A step is already a decomposed unit — "order the bath panel" is inherently short, "sand the wall" is a proper run. The LLM assigns the step attributes at extraction; the offer uses them to prefer variety without ever asking the user.

**How the step attributes are consumed:**

- `band` (short / sitting / run) — the primary spread axis. Never converted to minutes, never displayed.
- `mode` (thinking / doing) — second spread axis. "Decide where the pictures go" and "sand the wall" are different work; three thinking steps is a bad spread even if the bands vary.
- `shape` (clean / bleeds) — whether the step has a natural end. Two consumers: a `short` slot prefers `clean` steps, since a step that bleeds can't be finished in a gap; and the stopping ritual matters most on `bleeds` steps, where there's no natural stopping point to remember.

### Accept
One question, only when the answer changes what Caddie would offer. Two cases: **materials** ("got the paint?") and **familiarity** ("know how to prep walls?") *(implementation-derived)*. A "no" never blocks — it either moves the live step to buying the material, or prepends a short lookup step. The correction is persisted; the question fires at most once per step.

### Stop
The stopping ritual is structural, not polish. Without it, "leave you mid-thing" is just an unfinished job — field data shows more than two intervening activities before interrupted work resumes, and sometimes it never does.

When stopping: say where you got to (spoken or typed), plus a photo where it makes sense. The spoken note *is* the brief rehearsal that makes the interruption lag work. The photo is an environmental position marker; those beat text for reducing resumption lag.

**Stops are events, not fields on the step.** A step gets stopped mid-way more than once — painting the woodwork over three evenings means three notes and three photos. A field holds one, so the second overwrites the first and you lose the cue from last time, which is the thing that makes resumption work. An event carries its own timestamp ("where you got to on Tuesday" beats an undated note), keeps every previous cue available, and feeds the difficulty derivation in Reflect — repeated stops on one step *is* one of the patterns that marks a step as hard. Surfacing the current cue means reading the most recent `stopped` event for that step.

Resumption is always the user's choice and timing. **Never nag back to an unfinished thing.** No "you left this half done", no resumption prompts, no pressure to finish before starting something else. Flexibility in when to resume independently improves performance; removing the choice removes the benefit.

### Repair
Nudge back when Caddie is ahead of you. Voice when it's behind. Chain shown after the fact, framed as what you did.

### Reflect
The reflection is a record of **mastery experiences** — the material self-efficacy is built from. Not kindness, and not merely evidence of movement. Looking back at what was done is delivery; anything pointing forward is anticipation.

Things done, no percentages, no penalty for gaps. **Difficulty survives into the view** — not as a score, but as a visible distinction: a step that took multiple sittings, required nudging back, or was accepted and then sat should look different from one done in a single go. Derived from `step_events`, never asked. A flat list that makes "rewired the shed" look identical to "put the bins out" discards the part doing the work.

Possibly a display in the house — which hits both of Harkin's amplifying moderators without asking anyone to hold you accountable.

**Note on Fishbach & Dhar**: the no-progress-display rule applies to *forward-looking* progress (percentage complete, steps remaining), which licenses stopping mid-chain. Retrospective displays — what you actually did, after the fact — are a different case and the concern doesn't apply. A list of completed things is fine; a progress bar on an open chain is not.

---

## Recurring care

Houseplants, bins, filters, gutters, car checks. Not obligations (no single deadline) and not projects (no chain).

**Why it needs its own model.** A plant wants watering every 7 days in July and every 21 in January, and every plant differs. Twenty plants on individual schedules would produce ~100 events a month, all competing for the single clock slot and crowding out everything else. **Grouping is what makes this viable, not a nicety.** And the user doesn't know the care plan and doesn't want to look it up — they want to say "fiddle-leaf fig, north window" and have a plan appear.

**Entities and care plans.** An entity has a name, a kind, and a **location**. A care plan belongs to an entity and carries an **action**, twelve monthly intervals, a **tolerance** (how early it can be done without harm), an **overdue threshold** (how late before it genuinely matters), and a next-due date.

- Twelve monthly intervals rather than a season enum — seasons vary by species and it's no more storage.
- **Tolerance is what makes grouping legitimate.** Watering two days early is harmless; putting the bin out two days early is not. It's a real property of the action, not a fudge.
- **Overdue threshold is what makes honesty possible.** "Nothing bad happens if you skip" is true for painting woodwork and false for a plant.

**Grouping — assembled at offer time, never stored.** No groups table. The most overdue plan anchors; every other plan sharing its **action and location**, due inside the anchor's tolerance, joins. One offer: *Water the front room plants — fiddle-leaf fig, monstera, ferns*. A new plant joins automatically, a dead one drops out, and there's nothing to maintain. Same action in a different room stays a separate offer — it's a different trip.

**Reporting reuses the chain checklist.** Offered five, did three: tick three, those reset, two stay due. Same framing rules — what was done, no percentage.

**Seeding plans.** The LLM generates a starting plan on capture. This brushes the never-invent-a-fact rule and clears it *only if presented as correctable*: a watering interval is a plan the plant itself will disprove, unlike an invented MOT date you can't check. Present it for adjustment, never assert it, and once the user edits, never regenerate over it.

**Overdue handling.** Past the threshold, say so plainly — "hasn't been watered in a month". No guilt, no red, no count of failures. Overdue items anchor groups preferentially.

**Not in this class:** any dashboard of entities, any browsable list of care plans. The never-show-the-pile rule applies here too — plans are reachable from an offer, not from an index.

---

## Tenure and the early phase

Tenure is not a stored field. It's the count of `done` events for this user — a query against existing data.

Below a threshold (working assumption: **ten completions** — a starting point, not a derived finding), the offer is conservative:

- Degrade to generic reason lines sooner rather than inventing a specific one
- Don't offer steps where `needs_know_how` is true and the question hasn't been answered
- Prefer certain outcomes over uncertain ones when the choice exists

**Floor rule: tenure gating must never return fewer than one offer.** If filtering would empty the pool, fall back to generic ("next thing on X") rather than to nothing. A brand new user has everything unconfirmed; the early phase protects against early failures, it must not produce them.

Rationale: failures undermine efficacy especially before a sense of efficacy is established. The early phase is asymmetric — protect it.

---

## Domain

Each thing carries a coarse `domain` assigned by the LLM at extraction (home / admin / vehicle / garden / finance / other).

Used **only** for spread variety — avoid two items from the same domain when alternatives exist. It must be selected in the offer query and passed through to the spread logic. It never appears in the UI, and **must never become browsable**: a browsable domain tag becomes a pile, and showing the pile is the injury the whole design exists to avoid.

Rationale: self-efficacy is domain-specific. Without this, Caddie optimises for easy wins in one corner while the area you feel worst about stays untouched and un-improved.

---

## Enjoyable things

Wanted things belong in the pool. Behavioural activation evidence (26 RCTs, SMD −0.74) supports scheduling activities you'd actually want to do; the mechanism is the same as delivery density — contact with environmental reinforcement.

The pool is currently all duty. That matters most when motivation is lowest, which is exactly when Caddie needs to be easiest to use.

Whether this needs schema changes is open. A project with no obligation attached is already a project. Confirm by use before touching the schema.

---

## Versioning

**v1 — the core loop.**
Offer mechanic. Stopping ritual. Per-thing degradation to generic. Recurring care.

- *Per-thing degradation* is not a feature — it's the safety valve for wrong chains becoming a correction chore. Count nudge-backs per thing; a thing being corrected repeatedly drops to a generic step line rather than showing something specific that keeps being wrong. Needed **while** specific-by-default is being proven, not after.
- *Recurring care* is an existing class of thing, not a pattern feature. Without it the clock slot has nothing sensible in it for anyone with plants or bins.

**v1.5 — focus and the self-healing pair.**
Focus (declared, scoped to a fixed set of thing IDs). Band self-calibration — adjust a step's band when actual session patterns consistently differ from the assigned one. Care plan correction — adjust a seeded interval when repeated not-done or plan edits show it was wrong. Both need a few weeks of event data before they mean anything.

**v2 — pattern-based behaviours.** All read the events tables; none asks anything.

*Governing rule: patterns silently change what Caddie offers, and are never shown back as insight about the user.* A screen reporting completion rates is a percentage, a judgement and self-surveillance. Nothing should ever be phrased as Caddie having noticed something about you.

- **Buying cluster** — when several unrelated things all sit on an "order X" step, offer them as one sitting. Highest leverage item in v2: it unblocks several chains at once and collapses Steel's delay term across all of them.
- **Stuck-step breakdown** — accepted three times, never done, means the step is too big. Offer to break it down rather than waiting to be asked.
- **Never-accepted park** — offered repeatedly, accepted never. **Offer to park it; never suppress silently.** Phrase about the thing, not the person: "still want this on the list?", never "this keeps coming up and never lands." Ask once; if declined, don't ask again.
- **Learned spread weighting** — if accepted shapes cluster by time of day, weight the spread accordingly.
- **Habit stacking, recurring care only.** "After [existing habit], I will [care action]" is an implementation intention with a focal cue. Caddie detects *times*, not habits — so it must ask ("you usually do these Sunday mornings — is there something you already do then this could ride on?") and never suggest an anchor, because a wrong anchor is a confidently-wrong fact. Offer once; if declined, never again. **Once stacked, stop offering it** — habit stacking is the *exit route from the offer pool*, freeing the slot for things that can't be automated. Resume quietly if it doesn't take (Lally's range is 18–254 days), and say nothing about consistency.

**Explicitly dropped from v2:** offering a second thing immediately after a completion. Tempting, but it's the licensing scenario engineered — a completed sub-goal is treated as a substitute for further effort. Also dropped: anything predicting mood or state; any dashboard, streak, heatmap or consistency commentary.

---

## Focus

*(v1.5)*

Sometimes the user wants to concentrate on one area — decorating a room, getting the car admin sorted. This is the user supplying the judgement and Caddie executing it, which is the right side of the autonomy evidence. A focus Caddie *inferred* would not be — and would be useless anyway, since shielding is moderated by commitment.

**Declaring.** Same sentence router as capture. "I want to focus on the back bedroom." Dropping it is the same. No settings screen, no picker. A persistent indicator that a focus is active is required, or the user won't know why offers narrowed.

**Scoping.** A focus is a **fixed set of thing IDs**, not a rule re-evaluated at offer time. On declaration the LLM matches the phrase against existing things and shows what it picked; the user confirms or corrects. This handles "the back bedroom" (several things) and "car stuff" (a category, not a place) equally, and puts the one confirmation at a moment the user is already deciding something. New things captured later don't silently join — ask.

**Rules:**

- Project slots scope to the focus set. Band, mode and domain variety preserved inside it.
- **A focus may shrink the offer to one or two items. That's correct, not a failure state** — padding from the wider pool defeats the purpose.
- Clock slot untouched. Real consequence doesn't pause. The one-clock-bearing-item cap still applies.
- **Facilitative exception:** a buying cluster may include items outside the focus if at least one item is inside it. Every other apparently-facilitative case is either already in the focus set or genuinely irrelevant. (Inhibition of alternatives is lessened when the alternative facilitates the focal goal.)
- **Fallback must be stated, never silent.** "Nothing startable in the back bedroom" — then offer from the wider pool. Silent reversion loses the user's grip on whether the focus is still on.
- **Revocable at zero cost.** No duration, no end date, no stored record of having dropped one. The moment a focus is something you can fail at, it's a self-imposed commitment device — and those don't replicate.
- Overrides the domain-variety default. Caddie shouldn't concentrate in one domain by itself; the user may. Since efficacy is domain-specific, deliberate concentration is the faster route to building it there.

---

## Engineering constraints

Checks every future feature must pass. These are the constraints most likely to be undone by a well-meaning change.

| Check | Reason |
|---|---|
| Does it add a clock-bearing item beyond the one allowed? | Mere urgency effect — spurious deadlines crowd out what matters |
| Does it add urgency language to a project step? | Project steps have no real deadline; attached urgency is spurious by definition |
| Does it nag the user back to an unfinished thing? | Flexibility in resumption timing independently improves performance |
| Does it add encouragement copy? | Verbal persuasion is the weakest efficacy source; also controlling under Deci |
| Does it batch acknowledgement rather than acknowledge in the moment? | The delivery response is time-locked |
| Does it build anticipation — countdowns, previews, forward-looking bars? | The reward deficit is at anticipation, not delivery |
| Does it store or display skips and non-completions as failures? | Structural protection for the efficacy loop |
| Does it rank things by importance? | Offloading that judgement removes the one decision the user must supply |
| Does it make any list browsable? | Chernev — showing the pile is the injury |

---

## Deliberately excluded, and why

| Excluded | Reason |
|---|---|
| Ranking as the core mechanism | No evidence selection is the broken part; testing found the *unit* was wrong, not the order |
| Importance ranking of any kind | Offloading judgement about worth removes the one decision the user must supply; suggest, never decide |
| Anything trying to make you want something | Nothing reliably does this from inside |
| Points, badges, rewards for completion | Deci — worst on things already found interesting |
| Streaks that break, snooze budgets, penalties for the dip | Against Deci, Lally and the self-forgiveness work simultaneously |
| Progress bars and percentages | Fishbach & Dhar — licenses stopping (see the retrospective distinction in Reflect) |
| Celebrating sub-step completion | Treated as a substitute for the next step |
| Encouragement and pep talk | Verbal persuasion is the weakest efficacy source; controlling under Deci |
| Manufactured deadlines | Failed replication; one result halved completion |
| Urgency language on project steps | No real deadline exists; the urgency is spurious and triggers the mere urgency effect |
| Countdowns, previews of the finished result, anticipatory features | The reward deficit is specifically at anticipation |
| Nagging resumption | Removing the choice of when to resume removes the benefit |
| Batched acknowledgement replacing in-the-moment | The delivery response is time-locked |
| Skips or non-completions stored or shown as failures | Failures undermine the efficacy the whole loop depends on |
| Brain training, focus games, attention exercises | No convincing far transfer across any population tested |
| Urgent/important matrix | No controlled evidence; a heuristic with a good story |
| Showing the honest total cost of a chain | Unpacking reveals true cost — wrong medicine for initiation |
| Asking energy or time before offering | The shape spread does this job without the friction; energy isn't a budget anyway |
| Ambient or subtle cues | Participants said they'd miss them entirely |
| Emotional check-ins before capture | Friction at the worst moment |
| The full list, ever | Chernev |

---

## UI decisions

**Offer card.** Thing name as headline ("Bath panel"), live step name beneath ("Order the bath panel"). The thing gives context; the step says what to do. Both visible by default — the step was decomposed at capture, so there's no reason to hide it. In the generic case, the step line shows the fallback ("Next thing on the bath panel"), never a fabricated step name; the accept-question still fires if `needs_know_how` is set.

The earlier design hid the step name to avoid friction at the moment of starting. Right instinct, wrong target — the friction was a step that might be *wrong*, and the accept-question handles that at a better moment, after commitment rather than before.

**"What do you fancy?" not "Pick something to start."** The offer is not a menu. Framing it as a pick recreates the paralysis Caddie exists to dissolve. Caddie has already done the selecting; the user only decides whether to start.

**Focus screen.** Once committed, the thing name shrinks to a label and the step name becomes the headline. The question is no longer *what am I doing* but *what am I doing now*.

**FAB bottom-right** (`bottom-6 right-6`). Top-right conflicts with the iOS back-gesture zone and standalone-PWA system UI.

**`min-h-dvh` not `min-h-screen`.** `min-h-screen` doesn't account for collapsible mobile browser chrome.

**Empty state:** "Nothing needs doing right now." Factual, not reassuring. Earlier copy implied notifications that don't exist yet.

**Colour — Deep Ink.** Background `#16181c`, cards `#1e2128`, border `#2c3040`, muted `#5a6070`, primary text `#e8eaf0`, secondary `#9aa0b0`. Primary button inverted (`#e8eaf0` on dark) — high contrast without colour.

---

## Architecture

A **small API with several clients**, not a web app with features. Voice forces this: if a sentence can arrive from a speaker as well as a screen, capture, completion and offer must exist as endpoints before they exist as UI.

- Next.js PWA on Vercel — installable, so laptop and Android are one build
- Supabase for data, auth, RLS
- Server-side LLM for extraction and sentence routing
- Cron + edge function for obligation and care notifications only
- Offline capture queued and synced — cheap now, painful retrofitted
- Stable API contract before clients multiply

**Voice into the house is unresolved.** Google shut down Conversational Actions in 2023; whether anything replaces it for custom actions needs checking. Routing through Home Assistant's assistant to a Caddie endpoint is likely shorter, and would give the household display for free.

---

## Data model

- **`things`** — name, class (obligation | project), `domain`, `live_step_id` (FK → steps.id, updated on each completion), `due_date` (obligations only — the single date something is due; not recurrence, which lives on care plans), `notify_window_days` (obligations only, inferred at capture, nudgeable; **default shorter than feels sensible** — temporal myopia means a window opening a month out is still imperceptible)
- **`steps`** — thing_id, name, order, done, `band` (short | sitting | run), `mode` (thinking | doing), `shape` (clean | bleeds), `needs_know_how` *(implementation-derived)*. **No recurrence, no due date, no photo, no stop note.**
- **`entities`** — name, kind, `location` (grouping key, not decoration)
- **`care_plans`** — entity_id, `action` (grouping key), twelve monthly intervals, `tolerance_days`, `overdue_days`, `next_due_at`, source (generated | user)
- **`step_events`** — step_id, user_id, event_type, metadata. Event types include `offered`, `accepted`, `done`, `skipped`, `stopped`, `nudged_back`, `nudged_forward`, `edited`. A `stopped` event carries the note and photo URL in metadata — see Stop for why these are events rather than columns.
- **`care_events`** — care_plan_id, type

**Deliberately absent: no minutes, no energy, no difficulty field.** Duration estimates are ~25% accurate and unpacking makes them longer rather than righter, so a stored number would silently drive offers and be invisibly wrong. Energy isn't a property of a task — ego depletion is near-null in preregistered multilab work, and aversiveness is momentary rather than fixed. Difficulty is derived at read time from event patterns, never stored and never asked.

`live_step_id` is a stored FK rather than derived. The offer fetches things and their live step title in one join; deriving would need a lateral subquery per thing. Two writes per completion is negligible.

Depth beyond one level isn't wanted: one live step at a time.

### Recurrence lives on care plans, not steps — decided

The current codebase has `recurrence_rule` and `next_due` on `steps`. **Both come off.** This is a structural decision, not a preference: grouping matches on **action plus location** across entities, and a step belongs to a thing, which has no location. Intervals, tolerance and overdue thresholds have nowhere sensible to sit on a step either.

After the change:

- **Obligations** keep a due date on `things`. A due date is not recurrence.
- **Anything recurring** becomes an entity with a care plan. Plants, bins, filters, gutters, car checks.
- **Steps carry no dates at all.**

**Migration.** Dropping a populated column loses data. Check how many rows have a non-null `recurrence_rule` and whether any are real rather than test extractions. If they're all test data, drop and recapture. If any are real, migrate them into `entities` + `care_plans` first — name and action are recoverable from the step, but location and tolerance are not, so those rows need confirming rather than inferring.

**Extraction consequence.** One-pass extraction must now branch: a recurring care item produces **entity + care plan**, not thing + steps. That's a different output shape and it isn't in the current prompt. The peace lily test case passed under the old model and needs re-running under the new one.

---

## Extraction: one-pass vs two-pass

*(implementation-derived — this test was run during implementation, not in the design conversation.)*

Life Walk extraction must output a nested structure (thing + ordered steps) rather than a flat task list. Both approaches were tested against four synthetic narrations via `scripts/test-extraction.mjs` (results in `scripts/test-extraction-results.json`).

**Cases:** multi-step project (cracked bath panel); single-step obligation (MOT due 14 March); recurring maintenance (peace lily, seasonal watering); ambiguous ("the garage is a complete state").

**Results.** Multi-step: one-pass produced 6 steps in correct order including a waiting step correctly flagged `bleeds`; two-pass produced 5, collapsing measure-and-order and mis-flagging the mould treatment as `clean`. Obligation: one-pass set the due date correctly; two-pass produced a malformed recurrence rule with null fields and lost the date. Recurring: the original result is stale — both passes produced a recurrence rule on the step, which has since been removed from the schema. The extraction pipeline now produces entity + care plan for recurring items (migration 009, prompt updated accordingly). The peace-lily test case has not been re-run against the new output shape; that remains outstanding. Ambiguous: one-pass produced 3 restrained steps; two-pass produced 6, inventing a spurious monthly maintenance obligation not present in the narration.

**Decision: one-pass.** Matched or beat two-pass on all four. Both observed failure modes were two-pass — a malformed rule, and spurious step invention. One-pass is also simpler, faster and cheaper.

---

## What to watch once it's running

- Do the offers land at the rate they did in testing?
- Does the live step drift faster than it can be corrected?
- Do you open it at all, unprompted?
- Does domain variety make offers feel varied, or noticeably constrain the pool?
- Does the tenure gate protect early users, or produce thin spreads at the wrong moment?
- Do care groups stay a sensible size across the seasons?

---

## Open questions

- **Whether pull-only holds for projects.** Notifications dropped on judgement; the CSCW participants wanted the opposite. Weak evidence either way — revisit after a fortnight of real use.
- **The long-run slot.** Boice says short regular beats long infrequent, cutting against biasing long windows toward a proper run at a chain. Weak evidence; watch it.
- **Showing the chain after the fact.** The one place the design might actively hurt. The framing argument is an argument, not a finding.
- **Routing through a real person.** The only remaining route to genuine externality; divisive in the one study. Current instinct: passive visibility in the house rather than reporting to anyone.
- **Whether some things should be let go** rather than held as permanent debt. The v2 park offer is the honest route to this.
- **Behavioural activation and mood monitoring.** BA teaches noticing mood in relation to activity; the design excluded emotional check-ins as friction. Both have evidence. Likely resolution is timing — BA monitors *after*, the exclusion was about asking *before*. Recorded so a future change neither reintroduces it blindly nor dismisses it as settled.
- **Enjoyable things and schema.** Does capturing wanted things as plain projects work, or does something about how they're offered need to differ?
- **The ten-completion tenure threshold.** Working assumption only.
- **Whether the care plan should be shown for adjustment at capture**, or applied silently and corrected when obviously wrong. Showing it is honest but adds friction to a one-sentence flow.
- ~~**Whether any live `recurrence_rule` rows are real data.**~~ *Resolved: migration 009 asserts zero non-null rows before dropping the column; the assertion passed, confirming all rows were test data. Drop-and-recapture was the correct path.*

---

## Honest position

Everything Caddie **refuses to do** rests on solid ground. Everything it **does** rests on moderate ground or on a five-round test with one person. The offer — two or three live steps of deliberately different shapes, reasons attached — is the thing at the centre, and it is unevidenced by anyone.

That's defensible for a v1 built for its author. It would not be defensible for a product sold as evidence-based. Worth remembering if Caddie ever leaves the house.

**The one honest positive claim:** Caddie cannot train the brain. What it can do is produce repeated small successes, which raise domain-specific self-efficacy, which is the expectancy term in Steel's equation, which makes the next thing easier to start. That's a genuine compounding loop, and it's fragile in exactly one place — early failures cost more than later ones. Protect the first few weeks.

---

## References

See `caddie-references.md` for the full annotated list: what each source found, what it supports, and how much weight it bears. Entries marked *(verify)* there came through search snippets without complete bibliographic detail and should be checked before being quoted outside this project.