"use client"

import { useState } from "react"
import { useCapture } from "./CaptureContext"
import TaskCaptureFlow from "./TaskCaptureFlow"
import EntityCaptureFlow from "./EntityCaptureFlow"
import { notifyTasksUpdated } from "@/lib/capture"
import { useWakeLock } from "@/lib/use-wake-lock"

type CaptureMode = "choose" | "task" | "entity"

export default function CaptureModal() {
  const { isOpen, closeCapture } = useCapture()
  const [mode, setMode] = useState<CaptureMode>("choose")
  useWakeLock(isOpen)

  if (!isOpen) return null

  function handleClose() {
    closeCapture()
    setMode("choose")
  }

  async function handleTaskSaved() {
    closeCapture()
    setMode("choose")
    notifyTasksUpdated()
  }

  function handleEntitySaved() {
    closeCapture()
    setMode("choose")
    // notifyTasksUpdated is dispatched inside EntityCaptureFlow
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        aria-label="Close capture"
      />
      <div className="relative bg-bg border-t border-border rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-2" />

        {mode === "choose" && (
          <div className="px-6 pb-8 pt-2">
            <div className="w-full max-w-sm mx-auto flex flex-col gap-3">
              <h2 className="text-lg font-bold text-fg mb-1">What are you adding?</h2>
              <button
                type="button"
                onClick={() => setMode("task")}
                className="text-left bg-surface border border-border rounded-[14px] px-5 py-4 hover:border-fg transition-colors"
              >
                <div className="text-md font-semibold text-fg">Something to do</div>
                <div className="text-[12.5px] text-muted mt-[3px]">A job, a project, a one-off task</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("entity")}
                className="text-left bg-surface border border-border rounded-[14px] px-5 py-4 hover:border-fg transition-colors"
              >
                <div className="text-md font-semibold text-fg">Something that needs regular care</div>
                <div className="text-[12.5px] text-muted mt-[3px]">A plant, a bin, an appliance</div>
              </button>
            </div>
          </div>
        )}

        {mode === "task" && (
          <TaskCaptureFlow variant="capture" onSaved={handleTaskSaved} onClose={handleClose} />
        )}

        {mode === "entity" && (
          <EntityCaptureFlow onClose={handleClose} onSaved={handleEntitySaved} />
        )}
      </div>
    </div>
  )
}
