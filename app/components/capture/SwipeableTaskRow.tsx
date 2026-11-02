"use client"

import { useRef, useState } from "react"
import type { LifeWalkExtractedThing } from "@/lib/tasks"

const SWIPE_THRESHOLD = 72

export default function SwipeableThingRow({
  thing,
  onDelete,
  onRename,
}: {
  thing: LifeWalkExtractedThing
  onDelete: () => void
  onRename?: (newName: string) => void
}) {
  const [dx, setDx] = useState(0)
  const [gone, setGone] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(thing.name)
  const startX = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (editing) return
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
    } else {
      setDx(0)
    }
  }

  function commitRename() {
    const trimmed = editName.trim()
    if (trimmed && onRename) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  const swipeProgress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)

  if (gone) return <div className="h-0 overflow-hidden transition-all duration-250" />

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-end px-6"
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
          backgroundColor: `color-mix(in srgb, #3d1a1a ${Math.round(swipeProgress * 80)}%, #1e2128)`,
          touchAction: "pan-y",
          cursor: editing ? "default" : "grab",
        }}
        className="relative border border-border rounded-2xl px-5 py-4 select-none"
      >
        {editing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") setEditing(false)
              }}
              autoFocus
              className="flex-1 bg-surface border-b border-fg text-sm font-medium text-fg px-1 py-0.5 focus:outline-none"
            />
            <button
              type="button"
              onClick={commitRename}
              className="text-xs font-bold text-fg hover:text-white px-2 py-1"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-bold text-muted hover:text-subtle px-1 py-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            onClick={() => {
              if (Math.abs(dx) < 5 && onRename) {
                setEditName(thing.name)
                setEditing(true)
              }
            }}
            className="cursor-pointer"
          >
            <p className="text-sm font-medium text-fg hover:text-white transition-colors">{thing.name}</p>
            <p className="text-xs text-muted mt-1">
              {thing.steps.length} {thing.steps.length === 1 ? "step" : "steps"}
              {thing.steps[0] ? ` · ${thing.steps[0].name}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
