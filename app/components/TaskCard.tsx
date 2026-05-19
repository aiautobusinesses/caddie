"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { notifyTasksUpdated } from "@/lib/capture"
import type { TaskRow } from "@/lib/tasks"

type CardTask = Pick<
  TaskRow,
  "id" | "title" | "category" | "estimated_minutes" | "chunked" | "snooze_budget"
>

type WhyReason =
  | "too_big"
  | "dreading"
  | "waiting"
  | "not_important"
  | "no_good_moment"

type WhyFlow =
  | null
  | { phase: "pick" }
  | { phase: "response"; reason: WhyReason }

const SWIPE_THRESHOLD = 80
const MAX_SNOOZE_DOTS = 3

const WHY_OPTIONS: { reason: WhyReason; label: string }[] = [
  { reason: "too_big", label: "Too big" },
  { reason: "dreading", label: "Dreading it" },
  { reason: "waiting", label: "Waiting on something" },
  { reason: "not_important", label: "Not that important" },
  { reason: "no_good_moment", label: "No good moment" },
]

function mapTasks(rows: TaskRow[]): CardTask[] {
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    estimated_minutes: t.estimated_minutes,
    chunked: t.chunked,
    snooze_budget: t.snooze_budget,
  }))
}

function prioritizeTask(tasks: CardTask[], initialTaskId?: string): CardTask[] {
  if (!initialTaskId) return tasks
  const index = tasks.findIndex((t) => t.id === initialTaskId)
  if (index <= 0) return tasks
  const next = [...tasks]
  const [target] = next.splice(index, 1)
  return [target, ...next]
}

async function fetchTasksFromApi(url: string): Promise<CardTask[]> {
  const res = await fetch(url)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      typeof data.error === "string" ? data.error : "Failed to load tasks",
    )
  }
  const data = await res.json()
  return mapTasks(data.tasks as TaskRow[])
}

function SnoozeBudgetDots({ budget }: { budget: number }) {
  if (budget <= 0) {
    return null
  }

  const filled = Math.min(budget, MAX_SNOOZE_DOTS)
  const empty = MAX_SNOOZE_DOTS - filled

  return (
    <div className="flex items-center gap-1.5 mt-4" aria-label={`${budget} snoozes remaining`}>
      {Array.from({ length: filled }, (_, i) => (
        <span
          key={`filled-${i}`}
          className="w-1.5 h-1.5 rounded-full bg-gray-300"
        />
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span
          key={`empty-${i}`}
          className="w-1.5 h-1.5 rounded-full border border-gray-300"
        />
      ))}
    </div>
  )
}

type TaskCardProps = {
  initialTaskId?: string
}

export default function TaskCard({ initialTaskId }: TaskCardProps) {
  const [tasks, setTasks] = useState<CardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)

  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [chunkedPrompt, setChunkedPrompt] = useState(false)
  const [whyFlow, setWhyFlow] = useState<WhyFlow>(null)
  const [followUpDate, setFollowUpDate] = useState("")

  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState<number | undefined>(undefined)
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    try {
      const energy = sessionStorage.getItem("caddie_energy") ?? ""
      const time = sessionStorage.getItem("caddie_time") ?? ""

      if (energy && time) {
        const params = new URLSearchParams({ energy, time })
        const filtered = await fetchTasksFromApi(`/api/tasks?${params}`)

        if (filtered.length > 0) {
          setTasks(prioritizeTask(filtered, initialTaskId))
          setUsedFallback(false)
          setRemovedIds([])
          setIndex(0)
          return
        }

        setUsedFallback(true)
      } else {
        setUsedFallback(false)
      }

      const all = await fetchTasksFromApi("/api/tasks")
      setTasks(prioritizeTask(all, initialTaskId))
      setRemovedIds([])
      setIndex(0)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load tasks")
    } finally {
      setLoading(false)
    }
  }, [initialTaskId])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setFetchError(null)

      try {
        const energy = sessionStorage.getItem("caddie_energy") ?? ""
        const time = sessionStorage.getItem("caddie_time") ?? ""

        if (energy && time) {
          const params = new URLSearchParams({ energy, time })
          const filtered = await fetchTasksFromApi(`/api/tasks?${params}`)

          if (cancelled) return

          if (filtered.length > 0) {
            if (!cancelled) {
              setTasks(prioritizeTask(filtered, initialTaskId))
              setUsedFallback(false)
            }
            return
          }

          if (!cancelled) setUsedFallback(true)
        } else {
          if (!cancelled) setUsedFallback(false)
        }

        const all = await fetchTasksFromApi("/api/tasks")
        if (!cancelled) {
          setTasks(prioritizeTask(all, initialTaskId))
        }
      } catch (e) {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : "Failed to load tasks")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [initialTaskId])

  useEffect(() => {
    function onTasksUpdated() {
      void loadTasks()
    }

    window.addEventListener("caddie:tasks-updated", onTasksUpdated)
    return () => window.removeEventListener("caddie:tasks-updated", onTasksUpdated)
  }, [loadTasks])

  useEffect(() => {
    const target = flipped ? backRef.current : frontRef.current
    if (target) setCardHeight(target.scrollHeight)
  }, [flipped, index, removedIds, tasks, chunkedPrompt, whyFlow])

  const remaining = tasks.filter((t) => !removedIds.includes(t.id))
  const current =
    remaining.length > 0 ? remaining[index % remaining.length] : undefined
  const alternatives = remaining.filter((t) => t.id !== current?.id).slice(0, 3)
  const snoozeExhausted = (current?.snooze_budget ?? 0) === 0

  function updateCurrentTask(patch: Partial<CardTask>) {
    if (!current) return
    setTasks((prev) =>
      prev.map((t) => (t.id === current.id ? { ...t, ...patch } : t)),
    )
  }

  function closeWhyFlow() {
    setWhyFlow(null)
    setFollowUpDate("")
    setFlipped(false)
  }

  async function postTaskEvent(
    taskId: string,
    body: { event_type: string; metadata?: Record<string, unknown> },
  ) {
    const res = await fetch(`/api/tasks/${taskId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data.error === "string" ? data.error : "Failed to save action",
      )
    }
  }

  async function patchTask(taskId: string, updates: Partial<TaskRow>) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data.error === "string" ? data.error : "Failed to update task",
      )
    }

    const data = await res.json()
    return data.task as TaskRow
  }

  async function postDoneEvent(anotherSession: boolean) {
    if (!current) return

    setSubmitting(true)
    setActionError(null)

    try {
      const body: { event_type: "done"; metadata?: { another_session: boolean } } = {
        event_type: "done",
      }

      if (current.chunked) {
        body.metadata = { another_session: anotherSession }
      }

      await postTaskEvent(current.id, body)

      setRemovedIds((prev) => [...prev, current.id])
      setChunkedPrompt(false)
      closeWhyFlow()
      setIndex(0)
      notifyTasksUpdated()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to mark task done")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleWhySelect(reason: WhyReason) {
    if (!current) return

    setSubmitting(true)
    setActionError(null)

    try {
      await postTaskEvent(current.id, {
        event_type: "why",
        metadata: { reason },
      })

      setWhyFlow({ phase: "response", reason })

      if (reason === "dreading") {
        await patchTask(current.id, { energy: "high" })
        notifyTasksUpdated()
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save response")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTooBigYes() {
    if (!current) return

    setSubmitting(true)
    setActionError(null)

    try {
      await postTaskEvent(current.id, {
        event_type: "edited",
        metadata: { chunked: true },
      })
      await patchTask(current.id, { chunked: true })
      updateCurrentTask({ chunked: true })
      closeWhyFlow()
      notifyTasksUpdated()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update task")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNotImportantYes() {
    if (!current) return

    setSubmitting(true)
    setActionError(null)

    try {
      await postTaskEvent(current.id, { event_type: "done" })
      setRemovedIds((prev) => [...prev, current.id])
      closeWhyFlow()
      setIndex(0)
      notifyTasksUpdated()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to archive task")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFollowUpDateConfirm() {
    if (!current || !followUpDate || whyFlow?.phase !== "response") return

    setSubmitting(true)
    setActionError(null)

    try {
      await patchTask(current.id, { next_due: followUpDate })
      closeWhyFlow()
      notifyTasksUpdated()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update task")
    } finally {
      setSubmitting(false)
    }
  }

  function requestDone() {
    if (!current) return

    if (current.chunked) {
      setChunkedPrompt(true)
      return
    }

    void postDoneEvent(false)
  }

  function handlePick(task: CardTask) {
    const newIndex = remaining.findIndex((t) => t.id === task.id)
    setFlipped(false)
    setTimeout(() => setIndex(newIndex), 300)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (flipped || chunkedPrompt || submitting || whyFlow) return
    startX.current = e.clientX
    draggingRef.current = true
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || startX.current === null) return
    setDx(e.clientX - startX.current)
  }

  function onPointerUp() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    if (dx < -SWIPE_THRESHOLD) {
      requestDone()
    } else if (dx > SWIPE_THRESHOLD) {
      if (snoozeExhausted) {
        setWhyFlow({ phase: "pick" })
      } else {
        setFlipped(true)
      }
    }
    setDx(0)
  }

  const today = new Date().toISOString().split("T")[0]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-sm text-gray-400">Loading your tasks…</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-sm text-red-500 mb-4">{fetchError}</p>
        <button
          type="button"
          onClick={() => void loadTasks()}
          className="text-sm font-medium text-gray-700 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!current) {
    if (usedFallback) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
          <p className="text-2xl font-semibold text-gray-700">Nothing that fits right now.</p>
          <p className="text-gray-400 mt-2 mb-6">Here&apos;s the best I can do.</p>
          <Link
            href="/lifewalk"
            className="text-sm font-semibold text-gray-900 underline"
          >
            Do a life walk
          </Link>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-2xl font-semibold text-gray-700">That&apos;s everything for now.</p>
        <p className="text-gray-400 mt-2 mb-6">Caddie will let you know when something needs doing.</p>
        <Link
          href="/lifewalk"
          className="text-sm font-semibold text-gray-900 underline"
        >
          Do a life walk
        </Link>
      </div>
    )
  }

  const swipeProgress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)
  const isLeft = dx < 0

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm relative">
        {chunkedPrompt && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 rounded-3xl px-6">
            <div className="w-full text-center">
              <p className="text-lg font-semibold text-gray-800 mb-2">
                Finished or another session?
              </p>
              <p className="text-sm text-gray-400 mb-6">
                This task can take more than one go.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void postDoneEvent(false)}
                  className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                >
                  All finished
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void postDoneEvent(true)}
                  className="w-full bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
                >
                  Another session
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setChunkedPrompt(false)}
                  className="text-xs text-gray-400 mt-2 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {whyFlow?.phase === "pick" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white rounded-3xl px-6 py-8">
            <div className="w-full">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-widest text-gray-400">Why not now?</p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={closeWhyFlow}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center text-gray-400 text-sm"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {WHY_OPTIONS.map((option) => (
                  <button
                    key={option.reason}
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleWhySelect(option.reason)}
                    className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {whyFlow?.phase === "response" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white rounded-3xl px-6 py-8">
            <div className="w-full">
              {whyFlow.reason === "too_big" && (
                <>
                  <p className="text-lg font-semibold text-gray-800 mb-6 text-center">
                    Want to break this into sessions?
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleTooBigYes()}
                      className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={closeWhyFlow}
                      className="w-full bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
                    >
                      No
                    </button>
                  </div>
                </>
              )}

              {whyFlow.reason === "dreading" && (
                <>
                  <p className="text-lg font-semibold text-gray-800 mb-2 text-center">
                    Noted.
                  </p>
                  <p className="text-sm text-gray-500 mb-6 text-center">
                    Caddie will save this for when you&apos;re feeling sharper.
                  </p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={closeWhyFlow}
                    className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                  >
                    Got it
                  </button>
                </>
              )}

              {whyFlow.reason === "waiting" && (
                <>
                  <p className="text-lg font-semibold text-gray-800 mb-2 text-center">
                    What are you waiting on?
                  </p>
                  <p className="text-sm text-gray-500 mb-4 text-center">
                    When should Caddie check back?
                  </p>
                  <label className="block mb-4">
                    <span className="sr-only">Check back date</span>
                    <input
                      type="date"
                      min={today}
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={submitting || !followUpDate}
                      onClick={() => void handleFollowUpDateConfirm()}
                      className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={closeWhyFlow}
                      className="w-full bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {whyFlow.reason === "not_important" && (
                <>
                  <p className="text-lg font-semibold text-gray-800 mb-6 text-center">
                    Want to ditch it?
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleNotImportantYes()}
                      className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={closeWhyFlow}
                      className="w-full bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
                    >
                      No
                    </button>
                  </div>
                </>
              )}

              {whyFlow.reason === "no_good_moment" && (
                <>
                  <p className="text-lg font-semibold text-gray-800 mb-4 text-center">
                    When would be a good moment?
                  </p>
                  <label className="block mb-4">
                    <span className="sr-only">Good moment date</span>
                    <input
                      type="date"
                      min={today}
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-800"
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={submitting || !followUpDate}
                      onClick={() => void handleFollowUpDateConfirm()}
                      className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={closeWhyFlow}
                      className="w-full bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {usedFallback && (
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-gray-700">Nothing that fits right now.</p>
            <p className="text-sm text-gray-400 mt-1">Here&apos;s the best I can do.</p>
          </div>
        )}

        <p className="text-xs uppercase tracking-widest text-gray-400 mb-6 text-center">
          Next best thing
        </p>

        {actionError && (
          <p className="text-sm text-red-500 text-center mb-4">{actionError}</p>
        )}

        <div className="mb-6 flex items-center gap-3" style={{ perspective: "1200px" }}>
          {!flipped && !whyFlow && (
            <span
              className="text-sm text-gray-300 flex-shrink-0"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              done
            </span>
          )}

          {!flipped && !whyFlow && (
            <div
              className="absolute inset-0 flex items-center justify-between px-6 rounded-3xl pointer-events-none"
              style={{ opacity: swipeProgress }}
            >
              <span className="text-sm font-medium text-blue-400">
                {snoozeExhausted ? "Why?" : "Alternatives"}
              </span>
              <span className="text-sm font-medium text-green-500">Done ✓</span>
            </div>
          )}

          <div
            className="transition-all duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateY(${flipped ? 180 : 0}deg) translateX(${flipped ? 0 : dx}px)`,
              display: "grid",
              height: cardHeight,
              transition: isDragging
                ? "height 0.5s ease"
                : "transform 0.5s ease, height 0.5s ease",
            }}
          >
            <div
              ref={frontRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="rounded-3xl shadow-sm border border-gray-100 p-8 select-none bg-white"
              style={{
                backfaceVisibility: "hidden",
                gridArea: "1/1",
                touchAction: "pan-y",
                cursor: chunkedPrompt || submitting || whyFlow ? "default" : "grab",
                backgroundColor: isLeft
                  ? `rgba(240,253,244,${swipeProgress * 0.6})`
                  : `rgba(239,246,255,${swipeProgress * 0.6})`,
              }}
            >
              <span className="inline-block text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
                {current.category}
                {current.estimated_minutes != null &&
                  ` · ${current.estimated_minutes} min`}
              </span>
              <p className="text-2xl font-semibold text-gray-800 leading-snug">
                {current.title}
              </p>
              <SnoozeBudgetDots budget={current.snooze_budget} />
            </div>

            {!snoozeExhausted && (
              <div
                ref={backRef}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  gridArea: "1/1",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs uppercase tracking-widest text-gray-400">Or you could...</p>
                  <button
                    type="button"
                    onClick={() => setFlipped(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center text-gray-400 text-sm"
                  >
                    ×
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {alternatives.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => handlePick(task)}
                      className="bg-gray-50 rounded-2xl px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-xs text-gray-400 uppercase tracking-wider">
                        {task.category}
                        {task.estimated_minutes != null &&
                          ` · ${task.estimated_minutes} min`}
                      </span>
                      <p className="text-sm font-medium text-gray-700 mt-1">{task.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!flipped && !whyFlow && (
            <span
              className="text-sm text-gray-300 flex-shrink-0"
              style={{ writingMode: "vertical-rl" }}
            >
              {snoozeExhausted ? "why?" : "alternatives"}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
