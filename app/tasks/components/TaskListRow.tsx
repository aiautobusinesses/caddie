"use client"

import { useRef, useState } from "react"
import { formatDueDate } from "@/lib/task-groups"
import type { TaskRow } from "@/lib/tasks"

const SWIPE_THRESHOLD = 72

type TaskListRowProps = {
  task: TaskRow
  today: string
  onTap: () => void
  onDelete: () => void
}

export default function TaskListRow({
  task,
  today,
  onTap,
  onDelete,
}: TaskListRowProps) {
  const [dx, setDx] = useState(0)
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
      setTimeout(onDelete, 200)
    } else if (Math.abs(dx) < 8) {
      onTap()
      setDx(0)
    } else {
      setDx(0)
    }
  }

  const swipeProgress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)

  if (gone) {
    return <div className="h-0 overflow-hidden" />
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-end px-6 bg-red-50"
        style={{ opacity: swipeProgress }}
      >
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
          backgroundColor: `rgba(254,242,242,${swipeProgress * 0.8})`,
          touchAction: "pan-y",
        }}
        className="relative border border-gray-100 rounded-2xl px-4 py-3.5 bg-white select-none"
      >
        <p className="text-sm font-medium text-gray-800">{task.title}</p>
        <div className="flex flex-wrap gap-x-2 mt-1 text-xs text-gray-400">
          <span className="uppercase tracking-wider">{task.category}</span>
          <span>· {formatDueDate(task.next_due, today)}</span>
          {task.estimated_minutes != null && (
            <span>· {task.estimated_minutes} min</span>
          )}
        </div>
      </div>
    </div>
  )
}
