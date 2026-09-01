/**
 * Helpers for the recurring care domain:
 * - interval lookup (month → days)
 * - next_due_at recomputation after completion
 */

/** The intervals jsonb shape: keys are month numbers "1"–"12", values are days. */
export type MonthlyIntervals = Record<string, number>

/** Parse and validate a monthly intervals object. Returns null if invalid. */
export function parseIntervals(raw: unknown): MonthlyIntervals | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const result: MonthlyIntervals = {}
  for (let m = 1; m <= 12; m++) {
    const v = obj[String(m)]
    if (typeof v !== "number" || v < 1) return null
    result[String(m)] = v
  }
  return result
}

/** Return interval days for the calendar month of a given date-string (YYYY-MM-DD or ISO). */
export function intervalForMonth(intervals: MonthlyIntervals, dateStr: string): number {
  const month = new Date(dateStr).getUTCMonth() + 1 // 1-based
  return intervals[String(month)] ?? 7 // safe fallback
}

/** Compute next_due_at date string from a completion timestamp and intervals. */
export function computeNextDueAt(
  lastDoneAt: string,
  intervals: MonthlyIntervals,
): string {
  const days = intervalForMonth(intervals, lastDoneAt)
  const base = new Date(lastDoneAt)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().split("T")[0]
}

/** Compute an initial next_due_at when there is no last_done_at — use today. */
export function computeInitialNextDueAt(intervals: MonthlyIntervals): string {
  const today = new Date().toISOString().split("T")[0]
  return computeNextDueAt(today, intervals)
}

/** True when the plan is genuinely overdue (past next_due_at + overdue_days). */
export function isGenuinelyOverdue(
  nextDueAt: string,
  overdueDays: number,
  today: string,
): boolean {
  const due = new Date(nextDueAt)
  due.setUTCDate(due.getUTCDate() + overdueDays)
  return due.toISOString().split("T")[0] < today
}

/** Days until (or since) next_due_at. Negative means overdue. */
export function daysUntilDue(nextDueAt: string, today: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round(
    (new Date(nextDueAt).getTime() - new Date(today).getTime()) / msPerDay,
  )
}

/**
 * Build a human reason string for a care offer item.
 *
 * Design constraint (DESIGN.md §Offer): reasons must be "always true" and specific
 * when Caddie knows, null when it doesn't. Never invent urgency.
 * Only genuinely overdue plans (past next_due_at + overdue_days) get an overdue reason.
 * A plan that is merely due today is offered without a reason — the offer card will still
 * appear; null reason is not a failure state.
 */
export function buildCareReason(
  nextDueAt: string | null,
  lastDoneAt: string | null,
  overdueDays: number,
  today: string,
): string | null {
  if (!nextDueAt) return null

  if (isGenuinelyOverdue(nextDueAt, overdueDays, today)) {
    if (lastDoneAt) {
      const msPerDay = 24 * 60 * 60 * 1000
      const days = Math.round(
        (new Date(today).getTime() - new Date(lastDoneAt).getTime()) / msPerDay,
      )
      return `hasn't been done in ${days} day${days === 1 ? "" : "s"}`
    }
    return "hasn't been done in a while"
  }

  // Plan is due but not yet genuinely overdue — no reason line.
  // The design rule: "specific when Caddie knows, generic when it doesn't."
  // "due now" adds spurious urgency for something that merely became due today;
  // the card will still appear in the offer (it passed the due filter); reason = null.
  return null
}
