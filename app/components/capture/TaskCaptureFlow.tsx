"use client"

import { useState } from "react"
import type { LifeWalkExtractedTask } from "@/lib/tasks"
import { saveCapturedTasks } from "@/lib/capture"
import SwipeableTaskRow from "./SwipeableTaskRow"

type Stage = "narrate" | "processing" | "review"

type TaskCaptureFlowProps = {
  variant: "lifewalk" | "capture"
  onSaved: () => void | Promise<void>
  onClose?: () => void
}

export default function TaskCaptureFlow({
  variant,
  onSaved,
  onClose,
}: TaskCaptureFlowProps) {
  const [stage, setStage] = useState<Stage>("narrate")
  const [transcript, setTranscript] = useState("")
  const [tasks, setTasks] = useState<LifeWalkExtractedTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isOnboarding = variant === "lifewalk"

  async function handleSubmit() {
    if (!transcript.trim()) return
    setStage("processing")
    setError(null)

    try {
      const res = await fetch("/api/lifewalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTasks(data.tasks)
      setStage("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setStage("narrate")
    }
  }

  function deleteTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateTask(i: number, updates: Partial<LifeWalkExtractedTask>) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...updates } : t)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      if (tasks.length > 0) {
        await saveCapturedTasks(tasks)
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tasks")
      setSaving(false)
    }
  }

  if (stage === "narrate") {
    return (
      <div className={isOnboarding ? "flex flex-col items-center justify-center min-h-screen px-6" : "px-6 py-8"}>
        <div className="w-full max-w-sm mx-auto">
          {onClose && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm flex items-center justify-center"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          )}

          {isOnboarding ? (
            <>
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 text-center">
                Life walk
              </p>
              <h1 className="text-2xl font-semibold text-gray-800 text-center mb-2">
                What&apos;s on your mind?
              </h1>
              <p className="text-sm text-gray-400 text-center mb-8">
                Walk around your spaces and type everything you notice that needs doing.
                Don&apos;t filter — just narrate.
              </p>
            </>
          ) : (
            <h1 className="text-xl font-semibold text-gray-800 mb-6">What needs doing?</h1>
          )}

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Bleed the radiator, book the car in, trim the hedge..."
            className="w-full bg-white border border-gray-200 rounded-3xl p-5 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            rows={isOnboarding ? 8 : 6}
          />
          {error && <p className="text-sm text-red-500 mt-3 text-center">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!transcript.trim()}
            className="w-full mt-4 bg-gray-900 text-white rounded-2xl py-4 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Let Caddie sort this out
          </button>
        </div>
      </div>
    )
  }

  if (stage === "processing") {
    return (
      <div
        className={
          isOnboarding
            ? "flex flex-col items-center justify-center min-h-screen px-6 text-center"
            : "flex flex-col items-center justify-center px-6 py-24 text-center"
        }
      >
        <p className="text-2xl font-semibold text-gray-700 mb-2">On it...</p>
        <p className="text-sm text-gray-400">Caddie is working through your list.</p>
      </div>
    )
  }

  return (
    <div className={isOnboarding ? "flex flex-col items-center min-h-screen px-6 py-12" : "px-6 py-8"}>
      <div className="w-full max-w-sm mx-auto">
        {onClose && (
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}

        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 text-center">
          Here&apos;s what I found
        </p>
        <h1 className="text-2xl font-semibold text-gray-800 text-center mb-1">{tasks.length} things</h1>
        <div className="flex items-stretch gap-3 mb-8">
          <span
            className="text-sm text-gray-300 flex-shrink-0 flex items-center"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            edit
          </span>
          <div className="flex flex-col gap-3 flex-1">
            {tasks.map((task, i) => (
              <SwipeableTaskRow
                key={`${task.title}-${i}`}
                task={task}
                onDelete={() => deleteTask(i)}
                onUpdate={(updates) => updateTask(i, updates)}
              />
            ))}
          </div>
          <span
            className="text-sm text-gray-300 flex-shrink-0 flex items-center"
            style={{ writingMode: "vertical-rl" }}
          >
            delete
          </span>
        </div>
        {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 text-white rounded-2xl py-4 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : `Save ${tasks.length} tasks`}
        </button>
      </div>
    </div>
  )
}
