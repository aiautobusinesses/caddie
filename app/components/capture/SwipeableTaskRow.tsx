"use client"

import { useRef, useState } from "react"
import type { LifeWalkExtractedThing } from "@/lib/tasks"

const SWIPE_THRESHOLD = 72

export default function SwipeableThingRow({
  thing,
  onDelete,
}: {
  thing: LifeWalkExtractedThing
  onDelete: () => void
}) {
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
      setTimeout(onDelete, 250)
    } else {
      setDx(0)
    }
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
          cursor: "grab",
        }}
        className="relative border border-border rounded-2xl px-5 py-4 select-none"
      >
        <p className="text-sm font-medium text-fg">{thing.name}</p>
        <p className="text-xs text-muted mt-1">
          {thing.steps.length} {thing.steps.length === 1 ? "step" : "steps"}
          {thing.steps[0] ? ` · ${thing.steps[0].name}` : ""}
        </p>
      </div>
    </div>
  )
}
