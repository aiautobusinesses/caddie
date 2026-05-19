"use client"

import { useRef, useState } from "react"
import { ENERGY_LABELS } from "@/lib/energy-labels"
import { formatDueDate } from "@/lib/task-groups"
import type { TaskRow } from "@/lib/tasks"
import TaskEditSheet from "./TaskEditSheet"

const SWIPE_THRESHOLD = 80

type AuditStackProps = {
  initialTasks: TaskRow[]
  today: string
  onTasksChange: (tasks: TaskRow[]) => void
  onListTasksChange: (tasks: TaskRow[]) => void
  listTasks: TaskRow[]
  onBack: () => void
}

export default function AuditStack({
  initialTasks,
  today,
  onTasksChange,
  onListTasksChange,
  listTasks,
  onBack,
}: AuditStackProps) {
  const [queue, setQueue] = useState(initialTasks)
  const [index, setIndex] = useState(0)
  const [dx, setDx] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const startX = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const current = queue[index]

  function syncListAfterRemove(taskId: string) {
    onListTasksChange(listTasks.filter((t) => t.id !== taskId))
  }

  function advance() {
    setIndex((i) => i + 1)
    setDx(0)
  }

  async function postEvent(
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

  async function handleKeep() {
    if (!current || submitting) return

    setSubmitting(true)
    setActionError(null)

    try {
      await postEvent(current.id, {
        event_type: "edited",
        metadata: { audited: true },
      })
      advance()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to keep task")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDitch() {
    if (!current || submitting) return

    setSubmitting(true)
    setActionError(null)

    try {
      await postEvent(current.id, { event_type: "done" })
      syncListAfterRemove(current.id)
      const nextQueue = queue.filter((t) => t.id !== current.id)
      setQueue(nextQueue)
      onTasksChange(nextQueue)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to archive task")
    } finally {
      setSubmitting(false)
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (submitting || editOpen) return
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

    if (dx > SWIPE_THRESHOLD) {
      void handleKeep()
    } else if (dx < -SWIPE_THRESHOLD) {
      void handleDitch()
    } else if (Math.abs(dx) < 8) {
      setEditOpen(true)
    }

    setDx(0)
  }

  function handleEditSaved(updated: TaskRow) {
    const nextQueue = queue.map((t) => (t.id === updated.id ? updated : t))
    setQueue(nextQueue)
    onTasksChange(nextQueue)
    onListTasksChange(
      listTasks.map((t) => (t.id === updated.id ? updated : t)),
    )
    setEditOpen(false)
    advance()
  }

  if (queue.length === 0 || !current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-2xl font-semibold text-gray-700">All caught up.</p>
        <p className="text-sm text-gray-400 mt-2 mb-8">
          Nothing needs auditing right now.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-gray-900 underline hover:text-gray-600"
        >
          Back to list
        </button>
      </div>
    )
  }

  const swipeProgress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)
  const isRight = dx > 0

  return (
    <div className="flex flex-col items-center">
      {actionError && (
        <p className="text-sm text-red-500 text-center mb-4">{actionError}</p>
      )}

      <p className="text-xs uppercase tracking-widest text-gray-400 mb-6 text-center">
        Audit · {index + 1} of {queue.length}
      </p>

      <div className="w-full max-w-sm relative mb-6 flex items-center gap-3">
        <span
          className="text-sm text-gray-300 flex-shrink-0"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          ditch
        </span>

        <div
          className="absolute inset-0 flex items-center justify-between px-6 rounded-3xl pointer-events-none"
          style={{ opacity: swipeProgress }}
        >
          <span className="text-sm font-medium text-red-400">Ditch</span>
          <span className="text-sm font-medium text-green-500">Keep</span>
        </div>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex-1 rounded-3xl shadow-sm border border-gray-100 p-8 bg-white select-none"
          style={{
            transform: `translateX(${dx}px)`,
            transition: isDragging ? "none" : "transform 0.2s ease",
            touchAction: "pan-y",
            cursor: submitting ? "default" : "grab",
            backgroundColor: isRight
              ? `rgba(240,253,244,${swipeProgress * 0.6})`
              : `rgba(254,242,242,${swipeProgress * 0.6})`,
          }}
        >
          <span className="inline-block text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
            {current.category}
            {current.estimated_minutes != null &&
              ` · ${current.estimated_minutes} min`}
          </span>
          <p className="text-2xl font-semibold text-gray-800 leading-snug mb-4">
            {current.title}
          </p>
          <div className="flex flex-col gap-1 text-sm text-gray-500">
            <span>{formatDueDate(current.next_due, today)}</span>
            <span>{ENERGY_LABELS[current.energy]}</span>
          </div>
        </div>

        <span
          className="text-sm text-gray-300 flex-shrink-0"
          style={{ writingMode: "vertical-rl" }}
        >
          keep
        </span>
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={() => setEditOpen(true)}
        className="text-sm font-medium text-gray-600 underline hover:text-gray-900 disabled:opacity-30"
      >
        Edit
      </button>

      <TaskEditSheet
        task={current}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleEditSaved}
      />
    </div>
  )
}
