export type RecurrenceAnchor = "completion" | "schedule"

export type FixedRecurrenceRule = {
  type: "fixed"
  days: number
  anchor: RecurrenceAnchor
}

export type SeasonalRecurrenceRule = {
  type: "seasonal"
  summerDays: number
  winterDays: number
  anchor: RecurrenceAnchor
}

export type AnnualRecurrenceRule = {
  type: "annual"
  month: number
  day: number
  anchor: "schedule"
}

export type RecurrenceRule =
  | FixedRecurrenceRule
  | SeasonalRecurrenceRule
  | AnnualRecurrenceRule

function toDateString(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateOnly(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day))
  }
  return new Date(value)
}

function getAnchorDate(
  anchor: RecurrenceAnchor,
  lastDoneAt: string,
  currentNextDue: string | null,
): Date {
  if (anchor === "completion") {
    return parseDateOnly(lastDoneAt)
  }

  if (currentNextDue) {
    return parseDateOnly(currentNextDue)
  }

  return parseDateOnly(lastDoneAt)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function isSummerMonth(month: number): boolean {
  return month >= 4 && month <= 9
}

function getCurrentSeason(): "summer" | "winter" {
  const month = new Date().getUTCMonth() + 1
  return isSummerMonth(month) ? "summer" : "winter"
}

function calculateFixedNextDue(
  rule: FixedRecurrenceRule,
  lastDoneAt: string,
  currentNextDue: string | null,
): string {
  const base = getAnchorDate(rule.anchor, lastDoneAt, currentNextDue)
  return toDateString(addDays(base, rule.days))
}

function calculateSeasonalNextDue(
  rule: SeasonalRecurrenceRule,
  lastDoneAt: string,
  currentNextDue: string | null,
): string {
  const base = getAnchorDate(rule.anchor, lastDoneAt, currentNextDue)
  const days = getCurrentSeason() === "summer" ? rule.summerDays : rule.winterDays
  return toDateString(addDays(base, days))
}

function calculateAnnualNextDue(rule: AnnualRecurrenceRule, lastDoneAt: string): string {
  const done = parseDateOnly(lastDoneAt)
  const doneYear = done.getUTCFullYear()
  const doneUtc = Date.UTC(doneYear, done.getUTCMonth(), done.getUTCDate())
  const thisYearUtc = Date.UTC(doneYear, rule.month - 1, rule.day)

  if (thisYearUtc > doneUtc) {
    return toDateString(new Date(thisYearUtc))
  }

  return toDateString(new Date(Date.UTC(doneYear + 1, rule.month - 1, rule.day)))
}

export function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const rule = value as Record<string, unknown>

  if (rule.type === "fixed") {
    if (
      typeof rule.days === "number" &&
      rule.days > 0 &&
      (rule.anchor === "completion" || rule.anchor === "schedule")
    ) {
      return { type: "fixed", days: rule.days, anchor: rule.anchor }
    }
    return null
  }

  if (rule.type === "seasonal") {
    if (
      typeof rule.summerDays === "number" &&
      rule.summerDays > 0 &&
      typeof rule.winterDays === "number" &&
      rule.winterDays > 0 &&
      (rule.anchor === "completion" || rule.anchor === "schedule")
    ) {
      return {
        type: "seasonal",
        summerDays: rule.summerDays,
        winterDays: rule.winterDays,
        anchor: rule.anchor,
      }
    }
    return null
  }

  if (rule.type === "annual") {
    if (
      typeof rule.month === "number" &&
      rule.month >= 1 &&
      rule.month <= 12 &&
      typeof rule.day === "number" &&
      rule.day >= 1 &&
      rule.day <= 31 &&
      rule.anchor === "schedule"
    ) {
      return { type: "annual", month: rule.month, day: rule.day, anchor: "schedule" }
    }
    return null
  }

  return null
}

export function calculateNextDue(
  rule: RecurrenceRule,
  lastDoneAt: string,
  currentNextDue: string | null,
): string {
  switch (rule.type) {
    case "fixed":
      return calculateFixedNextDue(rule, lastDoneAt, currentNextDue)
    case "seasonal":
      return calculateSeasonalNextDue(rule, lastDoneAt, currentNextDue)
    case "annual":
      return calculateAnnualNextDue(rule, lastDoneAt)
  }
}
