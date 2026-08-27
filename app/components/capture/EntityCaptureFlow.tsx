"use client"

import { useState } from "react"
import type { SeedResponse } from "@/app/api/entities/route"
import { TASKS_UPDATED_EVENT } from "@/lib/capture"
import { MONTH_LABELS } from "@/lib/months"

type Stage = "input" | "processing" | "review"

type Props = {
  onClose: () => void
  onSaved: () => void
}

/**
 * EntityCaptureFlow
 *
 * Accepts a sentence like "fiddle-leaf fig in the front room", calls the
 * entity API to generate an entity + care plan, shows it for review,
 * and lets the user adjust before confirming.
 *
 * The plan is already saved by the time review is shown (entity + plan
 * were inserted server-side). The review screen lets users adjust via
 * the edit route if they want to change anything.
 */
export default function EntityCaptureFlow({ onClose, onSaved }: Props) {
  const [stage, setStage] = useState<Stage>("input")
  const [sentence, setSentence] = useState("")
  const [seeded, setSeeded] = useState<SeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!sentence.trim()) return
    setStage("processing")
    setError(null)

    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: sentence.trim() }),
      })
      const data = await res.json() as unknown
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Something went wrong",
        )
      }
      setSeeded(data as SeedResponse)
      setStage("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setStage("input")
    }
  }

  function handleConfirm() {
    // Entity + plan already saved. Notify offer to refresh.
    window.dispatchEvent(new CustomEvent(TASKS_UPDATED_EVENT))
    onSaved()
  }

  if (stage === "input") {
    return (
      <div className="px-6 py-8">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-dim/50 hover:bg-border text-muted text-sm flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <h1 className="text-xl font-semibold text-fg mb-2">
            What needs regular care?
          </h1>
          <p className="text-sm text-muted mb-6">
            A plant, a bin, an appliance — say what it is and where it lives.
          </p>
          <input
            type="text"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit() }}
            placeholder="Fiddle-leaf fig in the front room"
            autoFocus
            className="w-full bg-surface border border-border rounded-2xl px-5 py-4 text-sm text-fg placeholder-dim focus:outline-none focus:border-muted transition-colors"
          />
          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!sentence.trim()}
            className="w-full mt-4 bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Set up a care plan
          </button>
        </div>
      </div>
    )
  }

  if (stage === "processing") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-4">
          <div className="w-6 h-6 border-2 border-muted border-t-fg rounded-full animate-spin" />
        </div>
        <p className="text-md font-semibold text-fg">Working it out…</p>
      </div>
    )
  }

  if (!seeded) return null

  // Review: show the generated plan, present as adjustable
  const intervals = seeded.intervals

  return (
    <div className="px-6 py-8">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dim/50 hover:bg-border text-muted text-sm flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs uppercase tracking-widest text-muted mb-2">Care plan</p>
        <h1 className="text-[22px] font-bold text-fg mb-1 leading-[1.1] tracking-[-0.015em]">
          {seeded.entity_name}
        </h1>
        <p className="text-sm text-muted mb-5">
          {seeded.action} plan — change it from the offer card if it&apos;s wrong.
        </p>

        {seeded.note && (
          <div className="bg-surface border border-border rounded-[12px] px-4 py-3 text-[12.5px] text-subtle mb-5 leading-[1.5]">
            {seeded.note}
          </div>
        )}

        {/* Intervals summary */}
        <div className="bg-surface border border-border rounded-[14px] px-4 py-4 mb-5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted mb-3">
            {seeded.action} every…
          </p>
          <div className="grid grid-cols-4 gap-x-3 gap-y-2">
            {MONTH_LABELS.map((label, i) => {
              const days = intervals[String(i + 1)]
              return (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-2xs text-muted">{label}</span>
                  <span className="text-base font-bold text-fg">{days}d</span>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors"
        >
          Looks right
        </button>
        <p className="text-center text-[12px] text-muted mt-3">
          You can adjust the plan from the offer card at any time.
        </p>
      </div>
    </div>
  )
}
