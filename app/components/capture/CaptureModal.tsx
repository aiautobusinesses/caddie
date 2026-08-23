"use client"

import { useState } from "react"
import { useCapture } from "./CaptureContext"
import TaskCaptureFlow from "./TaskCaptureFlow"
import EntityCaptureFlow from "./EntityCaptureFlow"
import { notifyTasksUpdated } from "@/lib/capture"

type CaptureMode = "choose" | "task" | "entity"

export default function CaptureModal() {
  const { isOpen, closeCapture } = useCapture()
  const [mode, setMode] = useState<CaptureMode>("choose")

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
      <div className="relative bg-[#16181c] border-t border-[#2c3040] rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-[#2c3040] rounded-full mx-auto mt-3 mb-2" />

        {mode === "choose" && (
          <div className="px-6 pb-8 pt-2">
            <div className="w-full max-w-sm mx-auto flex flex-col gap-3">
              <h2 className="text-[17px] font-bold text-[#e8eaf0] mb-1">What are you adding?</h2>
              <button
                type="button"
                onClick={() => setMode("task")}
                className="text-left bg-[#1e2128] border border-[#2c3040] rounded-[14px] px-5 py-4 hover:border-[#e8eaf0] transition-colors"
              >
                <div className="text-[15px] font-semibold text-[#e8eaf0]">Something to do</div>
                <div className="text-[12.5px] text-[#5a6070] mt-[3px]">A job, a project, a one-off task</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("entity")}
                className="text-left bg-[#1e2128] border border-[#2c3040] rounded-[14px] px-5 py-4 hover:border-[#e8eaf0] transition-colors"
              >
                <div className="text-[15px] font-semibold text-[#e8eaf0]">Something that needs regular care</div>
                <div className="text-[12.5px] text-[#5a6070] mt-[3px]">A plant, a bin, an appliance</div>
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
