"use client"

import { useRef, useState } from "react"
import type { LifeWalkExtractedTask } from "@/lib/tasks"

import { TASK_CATEGORIES } from "@/lib/categories"
const urgencyLabel = { now: "Urgent", soon: "Soon", someday: "Someday" }
const urgencyColour = {
  now: "text-red-500 bg-red-50",
  soon: "text-amber-600 bg-amber-50",
  someday: "text-gray-400 bg-gray-100",
}

const SWIPE_THRESHOLD = 72

type Task = LifeWalkExtractedTask

export default function SwipeableTaskRow({
  task,
  onDelete,
  onUpdate,
}: {
  task: Task
  onDelete: () => void
  onUpdate: (updates: Partial<Task>) => void
}) {
  const [dx, setDx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [gone, setGone] = useState(false)
  const startX = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
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
      setGone(true)
      setTimeout(onDelete, 250)
    } else if (dx > SWIPE_THRESHOLD) {
      setDx(0)
      setEditing(true)
    } else {
      setDx(0)
    }
  }

  const swipeProgress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)
  const isLeft = dx < 0

  if (gone) {
    return <div className="h-0 overflow-hidden transition-all duration-250" />
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-between px-6"
        style={{ opacity: swipeProgress }}
      >
        <span className="text-sm font-medium text-blue-500">Edit</span>
        <span className="text-sm font-medium text-red-400">Delete</span>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease",
          backgroundColor: isLeft
            ? `rgba(254,242,242,${swipeProgress * 0.8})`
            : `rgba(239,246,255,${swipeProgress * 0.8})`,
          touchAction: "pan-y",
          cursor: "grab",
        }}
        className="relative border border-gray-100 rounded-2xl px-5 py-4 select-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{task.title}</p>
            <div className="flex flex-wrap gap-x-2 mt-1">
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {task.category}
              </span>
              {task.estimatedMinutes && (
                <span className="text-xs text-gray-400">· {task.estimatedMinutes} min</span>
              )}
              {task.recurrence && (
                <span className="text-xs text-gray-400">· {task.recurrence}</span>
              )}
            </div>
          </div>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${urgencyColour[task.urgency]}`}
          >
            {urgencyLabel[task.urgency]}
          </span>
        </div>
      </div>

      {editing && (
        <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 flex flex-col gap-3">
          <input
            value={task.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full text-sm text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-400"
          />
          <div className="flex gap-2">
            <select
              value={task.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              className="flex-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={task.urgency}
              onChange={(e) => onUpdate({ urgency: e.target.value as Task["urgency"] })}
              className="flex-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
            >
              <option value="now">Urgent</option>
              <option value="soon">Soon</option>
              <option value="someday">Someday</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={task.estimatedMinutes ?? ""}
              placeholder="mins"
              onChange={(e) =>
                onUpdate({
                  estimatedMinutes: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-20 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
            />
            <input
              value={task.recurrence ?? ""}
              placeholder="recurrence"
              onChange={(e) => onUpdate({ recurrence: e.target.value || null })}
              className="flex-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-gray-400 hover:text-gray-600 text-right"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
