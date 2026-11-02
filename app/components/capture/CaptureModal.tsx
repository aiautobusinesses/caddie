"use client"

import { useState } from "react"
import { useCapture } from "./CaptureContext"
import TaskCaptureFlow from "./TaskCaptureFlow"
import EntityCaptureFlow from "./EntityCaptureFlow"
import { notifyTasksUpdated } from "@/lib/capture"
import { useWakeLock } from "@/lib/use-wake-lock"

type CaptureMode = "task" | "entity"

export default function CaptureModal() {
  const { isOpen, closeCapture } = useCapture()
  const [mode, setMode] = useState<CaptureMode>("task")
  useWakeLock(isOpen)

  if (!isOpen) return null

  function handleClose() {
    closeCapture()
    setMode("task")
  }

  async function handleTaskSaved() {
    closeCapture()
    setMode("task")
    notifyTasksUpdated()
  }

  function handleEntitySaved() {
    closeCapture()
    setMode("task")
    // notifyTasksUpdated is dispatched inside EntityCaptureFlow
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 transition-opacity"
        onClick={handleClose}
        aria-label="Close capture"
      />
      <div className="relative bg-bg border-t border-border rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-2" />

        {mode === "task" && (
          <div>
            <TaskCaptureFlow
              variant="capture"
              onSaved={handleTaskSaved}
              onClose={handleClose}
              onSwitchToEntity={() => setMode("entity")}
            />
          </div>
        )}

        {mode === "entity" && (
          <div>
            <EntityCaptureFlow
              onClose={handleClose}
              onSaved={handleEntitySaved}
              onSwitchToTask={() => setMode("task")}
            />
          </div>
        )}
      </div>
    </div>
  )
}
