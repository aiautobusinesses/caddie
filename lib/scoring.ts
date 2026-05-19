export type ScoringContext = {
  energy: "sharp" | "steady" | "easy" | null
  time: "15" | "30" | "unlimited" | null
  today: string
}

export type ScorableTask = {
  priority: "high" | "medium" | "low"
  energy: "low" | "medium" | "high"
  estimated_minutes: number | null
  next_due: string | null
  notify_days_before: number
  created_at: string
}

const PRIORITY_BASE: Record<ScorableTask["priority"], number> = {
  high: 30,
  medium: 20,
  low: 10,
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("T")[0].split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = parseDateOnly(fromDate)
  const to = parseDateOnly(toDate)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / msPerDay)
}

function dueDateScore(task: ScorableTask, today: string): number {
  if (!task.next_due) {
    return 0
  }

  const daysUntil = daysBetween(today, task.next_due)

  if (daysUntil < 0) {
    return 30 + Math.abs(daysUntil) * 10
  }

  if (daysUntil === 0) {
    return 30
  }

  if (daysUntil > task.notify_days_before) {
    return 0
  }

  if (task.notify_days_before === 0) {
    return 0
  }

  if (daysUntil === 1) {
    return 25
  }

  const progress =
    (task.notify_days_before - daysUntil) / (task.notify_days_before - 1)
  return 5 + progress * 20
}

function energyMatches(
  contextEnergy: NonNullable<ScoringContext["energy"]>,
  taskEnergy: ScorableTask["energy"],
): boolean {
  if (contextEnergy === "sharp") {
    return true
  }
  if (contextEnergy === "steady") {
    return taskEnergy === "low" || taskEnergy === "medium"
  }
  return taskEnergy === "low"
}

function timeMatches(
  contextTime: NonNullable<ScoringContext["time"]>,
  estimatedMinutes: number | null,
): boolean {
  if (contextTime === "unlimited") {
    return true
  }
  if (estimatedMinutes == null) {
    return false
  }
  if (contextTime === "15") {
    return estimatedMinutes <= 15
  }
  return estimatedMinutes <= 30
}

function contextMatchScore(context: ScoringContext, task: ScorableTask): number {
  if (!context.energy && !context.time) {
    return 20
  }

  let dimensions = 0
  let matches = 0

  if (context.energy) {
    dimensions += 1
    if (energyMatches(context.energy, task.energy)) {
      matches += 1
    }
  }

  if (context.time) {
    dimensions += 1
    if (timeMatches(context.time, task.estimated_minutes)) {
      matches += 1
    }
  }

  if (matches === dimensions) {
    return 20
  }

  if (matches === 1) {
    return 10
  }

  return 0
}

function ageScore(task: ScorableTask, today: string): number {
  if (task.next_due) {
    return 0
  }

  const createdDate = task.created_at.split("T")[0]
  const weeks = Math.floor(daysBetween(createdDate, today) / 7)
  return Math.min(weeks, 20)
}

export function scoreTask(
  task: ScorableTask,
  context: ScoringContext,
  snoozeCount: number,
): number {
  return (
    PRIORITY_BASE[task.priority] +
    dueDateScore(task, context.today) +
    contextMatchScore(context, task) +
    snoozeCount * 5 +
    ageScore(task, context.today)
  )
}
