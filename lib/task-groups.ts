import type { TaskRow } from "@/lib/tasks"

export type WhenGroupKey =
  | "overdue"
  | "today"
  | "this_week"
  | "this_month"
  | "later"
  | "no_date"

export const WHEN_GROUP_ORDER: WhenGroupKey[] = [
  "overdue",
  "today",
  "this_week",
  "this_month",
  "later",
  "no_date",
]

export const WHEN_GROUP_LABELS: Record<WhenGroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  later: "Later",
  no_date: "No date",
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("T")[0].split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function endOfWeekSunday(today: Date): Date {
  const end = new Date(today)
  const day = end.getUTCDay()
  const daysUntilSunday = day === 0 ? 0 : 7 - day
  end.setUTCDate(end.getUTCDate() + daysUntilSunday)
  return end
}

function endOfMonth(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
}

export function getWhenGroup(nextDue: string | null, today: string): WhenGroupKey {
  if (!nextDue) {
    return "no_date"
  }

  if (nextDue < today) {
    return "overdue"
  }

  if (nextDue === today) {
    return "today"
  }

  const todayDate = parseDateOnly(today)
  const dueDate = parseDateOnly(nextDue)
  const weekEnd = endOfWeekSunday(todayDate)
  const monthEnd = endOfMonth(todayDate)

  if (dueDate <= weekEnd) {
    return "this_week"
  }

  if (dueDate <= monthEnd) {
    return "this_month"
  }

  return "later"
}

export function groupTasksByWhen(tasks: TaskRow[], today: string): Map<WhenGroupKey, TaskRow[]> {
  const groups = new Map<WhenGroupKey, TaskRow[]>()
  for (const key of WHEN_GROUP_ORDER) {
    groups.set(key, [])
  }

  for (const task of tasks) {
    const key = getWhenGroup(task.next_due, today)
    groups.get(key)?.push(task)
  }

  return groups
}

export function groupTasksByCategory(tasks: TaskRow[]): Map<string, TaskRow[]> {
  const groups = new Map<string, TaskRow[]>()

  for (const task of tasks) {
    const list = groups.get(task.category) ?? []
    list.push(task)
    groups.set(task.category, list)
  }

  const sorted = new Map(
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)),
  )

  for (const [, list] of sorted) {
    list.sort((a, b) => {
      const aDue = a.next_due ?? "9999-99-99"
      const bDue = b.next_due ?? "9999-99-99"
      return aDue.localeCompare(bDue)
    })
  }

  return sorted
}

export function formatDueDate(nextDue: string | null, today: string): string {
  if (!nextDue) {
    return "No date"
  }
  if (nextDue === today) {
    return "Today"
  }
  if (nextDue < today) {
    return `Overdue · ${formatShortDate(nextDue)}`
  }
  return formatShortDate(nextDue)
}

function formatShortDate(dateStr: string): string {
  const date = parseDateOnly(dateStr)
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}
