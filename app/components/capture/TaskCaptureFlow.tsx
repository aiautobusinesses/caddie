"use client"

import { useState } from "react"
import type { LifeWalkExtractedThing } from "@/lib/tasks"
import { saveCapturedThings } from "@/lib/capture"
import SwipeableTaskRow from "./SwipeableTaskRow"
import Spinner from "@/app/components/Spinner"

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
  const [things, setThings] = useState<LifeWalkExtractedThing[]>([])
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
      setThings(data.things)
      setStage("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setStage("narrate")
    }
  }

  function deleteThing(i: number) {
    setThings((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      if (things.length > 0) {
        await saveCapturedThings(things)
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setSaving(false)
    }
  }

  if (stage === "narrate") {
    return (
      <div className={isOnboarding ? "flex flex-col items-center justify-center min-h-dvh px-6" : "px-6 py-8"}>
        <div className="w-full max-w-sm mx-auto">
          {onClose && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#262b35] hover:bg-[#2c3040] text-[#5a6070] text-sm flex items-center justify-center"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          )}
          {isOnboarding ? (
            <>
              <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-2 text-center">Life walk</p>
              <h1 className="text-2xl font-semibold text-[#e8eaf0] text-center mb-2">What&apos;s on your mind?</h1>
              <p className="text-sm text-[#5a6070] text-center mb-8">
                Walk around your spaces and type everything you notice that needs doing. Don&apos;t filter — just narrate.
              </p>
            </>
          ) : (
            <h1 className="text-xl font-semibold text-[#e8eaf0] mb-6">What needs doing?</h1>
          )}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Bleed the radiator, book the car in, trim the hedge..."
            className="w-full bg-[#1e2128] border border-[#2c3040] rounded-3xl p-5 text-sm text-[#e8eaf0] placeholder-[#3a4155] resize-none focus:outline-none focus:border-[#5a6070] transition-colors"
            rows={isOnboarding ? 8 : 6}
          />
          {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!transcript.trim()}
            className="w-full mt-4 bg-[#e8eaf0] text-[#16181c] rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Let Caddie sort this out
          </button>
        </div>
      </div>
    )
  }

  if (stage === "processing") {
    return (
      <div className={isOnboarding ? "flex flex-col items-center justify-center min-h-dvh px-6 text-center" : "flex flex-col items-center justify-center px-6 py-24 text-center"}>
        <div className="mb-6">
          <Spinner size={36} />
        </div>
        <p className="text-2xl font-semibold text-[#e8eaf0] mb-2">Sorting it out…</p>
        <p className="text-sm text-[#5a6070]">Caddie is working through what you said.</p>
      </div>
    )
  }

  return (
    <div className={isOnboarding ? "flex flex-col items-center min-h-dvh px-6 py-12" : "px-6 py-8"}>
      <div className="w-full max-w-sm mx-auto">
        {onClose && (
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#262b35] hover:bg-[#2c3040] text-[#5a6070] text-sm flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-2 text-center">Here&apos;s what I found</p>
        <h1 className="text-2xl font-semibold text-[#e8eaf0] text-center mb-6">
          {things.length} {things.length === 1 ? "thing" : "things"}
        </h1>
        <div className="flex flex-col gap-3 mb-8">
          {things.map((thing, i) => (
            <SwipeableTaskRow
              key={`${thing.name}-${i}`}
              thing={thing}
              onDelete={() => deleteThing(i)}
              onUpdate={(updates) =>
                setThings((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...updates } : t)))
              }
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-400 text-center mb-4">{error}</p>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full bg-[#e8eaf0] text-[#16181c] rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : `Save ${things.length} ${things.length === 1 ? "thing" : "things"}`}
        </button>
      </div>
    </div>
  )
}
