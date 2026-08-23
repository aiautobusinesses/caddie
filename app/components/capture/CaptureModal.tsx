"use client"

import { useCapture } from "./CaptureContext"
import TaskCaptureFlow from "./TaskCaptureFlow"
import { notifyTasksUpdated } from "@/lib/capture"

export default function CaptureModal() {
  const { isOpen, closeCapture } = useCapture()

  if (!isOpen) return null

  async function handleSaved() {
    closeCapture()
    notifyTasksUpdated()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={closeCapture}
        aria-label="Close capture"
      />
      <div className="relative bg-[#16181c] border-t border-[#2c3040] rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-[#2c3040] rounded-full mx-auto mt-3 mb-2" />
        <TaskCaptureFlow variant="capture" onSaved={handleSaved} onClose={closeCapture} />
      </div>
    </div>
  )
}
