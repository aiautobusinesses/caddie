import { normalizeDateOnly, parseRecurrenceRule } from "@/lib/recurrence"
import type { LifeWalkExtractedTask, TaskUrgency } from "@/lib/tasks"
import { isTaskUrgency, normalizeNotifyTimeOfDay } from "@/lib/tasks"

function extractJsonPayload(text: string): unknown {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf("[")
    const end = cleaned.lastIndexOf("]")
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }

    const objStart = cleaned.indexOf("{")
    const objEnd = cleaned.lastIndexOf("}")
    if (objStart !== -1 && objEnd > objStart) {
      const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>
      if (Array.isArray(obj.tasks)) {
        return obj.tasks
      }
    }

    throw new Error("No JSON array found in model response")
  }
}

function normalizeUrgency(value: unknown): TaskUrgency {
  if (typeof value === "string" && isTaskUrgency(value)) {
    return value
  }
  return "soon"
}

function normalizeTask(raw: unknown): LifeWalkExtractedTask | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const item = raw as Record<string, unknown>
  const title = typeof item.title === "string" ? item.title.trim() : ""
  if (!title) {
    return null
  }

  const category =
    typeof item.category === "string" && item.category.trim()
      ? item.category.trim()
      : "Other"

  let estimatedMinutes: number | null = null
  if (typeof item.estimatedMinutes === "number" && Number.isFinite(item.estimatedMinutes)) {
    estimatedMinutes = item.estimatedMinutes
  }

  const recurrence =
    typeof item.recurrence === "string"
      ? item.recurrence
      : item.recurrence === null
        ? null
        : null

  const recurrenceRule =
    item.recurrence_rule && typeof item.recurrence_rule === "object"
      ? parseRecurrenceRule(item.recurrence_rule)
      : null

  return {
    title,
    category,
    urgency: normalizeUrgency(item.urgency),
    estimatedMinutes,
    recurrence,
    recurrence_rule: recurrenceRule,
    next_due: normalizeDateOnly(item.next_due),
    due_date: normalizeDateOnly(item.due_date),
    notify_days_before:
      typeof item.notify_days_before === "number"
        ? item.notify_days_before
        : 0,
    notify_time_of_day: normalizeNotifyTimeOfDay(
      typeof item.notify_time_of_day === "string"
        ? (item.notify_time_of_day as LifeWalkExtractedTask["notify_time_of_day"])
        : undefined,
    ),
    notify_escalate: Boolean(item.notify_escalate),
  }
}

type DeadlineKind = "mot" | "tax" | "service" | "insurance" | "other"

const ACTION_VERB_RE =
  /^(book|renew|arrange|schedule|sort|pay|register|apply|submit)\b/i

function classifyDeadlineKind(title: string): DeadlineKind {
  const lower = title.toLowerCase()
  if (/\bmot\b/.test(lower)) return "mot"
  if (/\btax\b|road fund|\bved\b/.test(lower)) return "tax"
  if (/\bservice\b/.test(lower)) return "service"
  if (/\binsurance\b/.test(lower)) return "insurance"
  return "other"
}

function normalizeDedupeSubject(title: string): string {
  return title
    .toLowerCase()
    .replace(ACTION_VERB_RE, "")
    .replace(/\b(renewal|due|expires?)\b/g, "")
    .replace(/\bmx[\s-]*5\b/g, "mx5")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function dedupeSignature(task: LifeWalkExtractedTask): string | null {
  if (!task.next_due) {
    return null
  }

  const kind = classifyDeadlineKind(task.title)
  const subject = normalizeDedupeSubject(task.title)
  return `${task.category.toLowerCase()}|${task.next_due}|${kind}|${subject}`
}

/** Prefer actionable titles (book/renew) over passive deadline labels. */
function taskActionScore(title: string): number {
  const lower = title.toLowerCase()
  if (ACTION_VERB_RE.test(lower)) {
    return 3
  }
  if (/\b(renewal)\b/.test(lower) && !/^renew\b/.test(lower)) {
    return 1
  }
  if (/\bmot\b/.test(lower) && !/\bbook\b/.test(lower)) {
    return 1
  }
  return 2
}

export function dedupeLifeWalkTasks(
  tasks: LifeWalkExtractedTask[],
): LifeWalkExtractedTask[] {
  const undated = tasks.filter((task) => !task.next_due)
  const dated = tasks.filter((task) => task.next_due)

  const groups = new Map<string, LifeWalkExtractedTask[]>()
  for (const task of dated) {
    const signature = dedupeSignature(task)
    if (!signature) {
      continue
    }
    const group = groups.get(signature) ?? []
    group.push(task)
    groups.set(signature, group)
  }

  const merged: LifeWalkExtractedTask[] = [...undated]
  for (const group of groups.values()) {
    const best = group.reduce((picked, candidate) =>
      taskActionScore(candidate.title) > taskActionScore(picked.title)
        ? candidate
        : picked,
    )
    merged.push(best)
  }

  return merged
}

export function parseLifeWalkTasksFromModelText(text: string): LifeWalkExtractedTask[] {
  const payload = extractJsonPayload(text)
  const list = Array.isArray(payload) ? payload : []

  const tasks: LifeWalkExtractedTask[] = []
  for (const item of list) {
    const task = normalizeTask(item)
    if (task) {
      tasks.push(task)
    }
  }

  const deduped = dedupeLifeWalkTasks(tasks)

  if (deduped.length === 0) {
    throw new Error("No valid tasks in model response")
  }

  return deduped
}
