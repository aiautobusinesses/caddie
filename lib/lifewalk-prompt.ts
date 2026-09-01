/**
 * Shared extraction prompt for Life Walk narration → things/steps.
 * Used by both the Life Walk route and the voice capture webhook.
 *
 * Model selection:
 *   Set ANTHROPIC_MODEL in your environment to override the default without
 *   a code change. This is the recommended way to handle model version
 *   upgrades (e.g. when haiku-4-5 is retired in favour of a newer version).
 *
 *   Example .env.local:
 *     ANTHROPIC_MODEL=claude-haiku-4-5-20251001
 *
 *   If unset, falls back to the constant below.
 */
export const LIFEWALK_MODEL_DEFAULT = "claude-haiku-4-5"

/** Returns the active model name — env override takes precedence. */
export function getLifewalkModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || LIFEWALK_MODEL_DEFAULT
}

export const LIFEWALK_EXTRACTION_PROMPT = `You are helping someone manage their life admin. They have narrated a walk around their home and life, describing things they notice that need doing.

Extract every distinct item and classify it as either a THING (a one-off project or obligation with discrete steps) or an ENTITY (something that needs recurring care on an ongoing schedule, e.g. a plant, a bin, a boiler service).

Rules for THINGS:
- The unit is the STEP, not the thing. "Order a bath panel" is a step. "Fix the bathroom" is not.
- Each step must be a specific, startable action. "Order a bath panel" not "bath panel" or "sort out the bathroom".
- Buying is a step, not a precondition. If something needs materials, "Order X" or "Buy X" is step 1.
- Research is a step where it genuinely is one ("Work out which paint"), but don't invent research steps to pad a chain.
- Steps requiring another person are steps: "Ask Lindsey about next year's holidays".
- Single-step obligations (book MOT, renew insurance) must have exactly one step. Do not invent extra steps.
- For ambiguous things, use best judgement on a sensible first step and obvious subsequent steps. Do not over-decompose.
- ONE thing per subject per deadline. Never create both "MOT for Touran" and "Book MOT for Touran" — only the actionable thing with one step ("Book MOT for Touran").
- Different work types on the same subject stay separate (e.g. "Service MX-5" and "Renew tax for MX-5" are two things).
- Prefer 3–7 steps. Do not decompose beyond one level — no sub-steps.
- Do not estimate durations in minutes. Use band as a coarse judgement only.
- Step ordering: where the order is genuinely flexible, put steps whose outcome is visibly perceptible (something moves, changes or is completed) earlier in the chain. Prefer progress that can be seen over internal or preparatory steps.
- Tone: all step names and reason lines must be factual and neutral. Do not write encouragement, praise, or motivational language ("nearly there", "good effort", "great work", "almost done") in any output field.

Rules for ENTITIES (recurring care):
- Use for anything that needs the same action repeated on a schedule: watering, feeding, mowing, putting out bins, servicing appliances, etc.
- Each entity has one primary recurring action (e.g. "Water", "Feed", "Put out", "Service").
- Provide monthly intervals: how many days between care actions for each calendar month (1 = January … 12 = December). Vary by season where it makes sense (e.g. water plants more in summer). Use your knowledge of the item; be conservative (slightly too often is better than too rarely).
- tolerance_days: how many days early the action can be done without harm (plants 2–3; bins on collection day 0; appliances 3–7).
- overdue_days: how many days past the due date before it genuinely matters (sensitive plants 5–7; bins 0; appliances 30+).

For each THING return an object with:
- name: plain English name, keep the narrator's voice (e.g. "Bath panel", "MOT", "Shed")
- class: "obligation" if something bad happens if a date passes (MOT, tax, insurance, bills); otherwise "project"
- domain: one of "home", "admin", "vehicle", "garden", "finance", "other" — coarse category for variety; assign based on subject matter
- due_date: ISO date YYYY-MM-DD for hard deadlines (MOT expiry, tax due, insurance renewal); null for projects
- notify_window: for obligations only — integer days before due_date to first notify; null for projects
- notify_time_of_day: "morning", "afternoon", or "evening" — when it makes most sense to act; null for projects
- notify_escalate: true for hard-deadline obligations where a second closer-in reminder makes sense; false otherwise
- steps: ordered array of step objects, each with:
  - name: imperative plain English action ("Order the bath panel", not "Ordering")
  - band: coarse effort — "short" (under ~15 min, quick win), "sitting" (a focused session, ~15–60 min), "run" (needs a proper block of time, 60 min+)
  - mode: "thinking" (planning, researching, deciding, booking) or "doing" (physical or hands-on work)
  - shape: "clean" if this step has a natural end and completing it is unambiguous; "bleeds" if it may need multiple sessions or has a mandatory wait (e.g. paint drying, delivery arriving)
  - needs_know_how: true if the step requires domain knowledge a non-expert might not have (e.g. "Prepare the walls for painting", "Wire the socket", "Bleed the radiator"); false for steps that are self-evidently startable ("Order the paint", "Book the MOT", "Put the bins out")

For each ENTITY return an object with:
- name: short plain English name (e.g. "Peace lily", "Green bin", "Boiler")
- kind: category in one or two words (e.g. "plant", "bin", "appliance")
- location: where it lives if mentioned (e.g. "front room", "kitchen"); null if not mentioned
- action: the primary recurring action, imperative (e.g. "Water", "Feed", "Put out", "Service")
- intervals: object with keys "1" through "12" (month numbers as strings) mapping to integer days between care actions
- tolerance_days: integer
- overdue_days: integer

Return ONLY a valid JSON object with two keys — no markdown, no code fences, no commentary:
{"things":[...],"entities":[...]}

Example:
{"things":[{"name":"Bath panel","class":"project","domain":"home","due_date":null,"notify_window":null,"notify_time_of_day":null,"notify_escalate":false,"steps":[{"name":"Measure up and order the right size panel","band":"short","mode":"thinking","shape":"clean","needs_know_how":false},{"name":"Remove old panel and treat mould on wall","band":"sitting","mode":"doing","shape":"bleeds","needs_know_how":true},{"name":"Fit new panel and seal edges","band":"sitting","mode":"doing","shape":"clean","needs_know_how":true}]},{"name":"MOT","class":"obligation","domain":"vehicle","due_date":"2026-03-15","notify_window":14,"notify_time_of_day":"morning","notify_escalate":true,"steps":[{"name":"Book MOT at the garage","band":"short","mode":"thinking","shape":"clean","needs_know_how":false}]}],"entities":[{"name":"Peace lily","kind":"plant","location":"bedroom","action":"Water","intervals":{"1":14,"2":14,"3":10,"4":7,"5":7,"6":7,"7":7,"8":7,"9":10,"10":14,"11":14,"12":14},"tolerance_days":2,"overdue_days":5}]}`
