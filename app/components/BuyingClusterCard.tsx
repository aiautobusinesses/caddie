"use client"

import { useState } from "react"
import type { BuyingClusterOffer } from "@/lib/offer"

type Props = {
  cluster: BuyingClusterOffer
  onDone: () => void
}

export default function BuyingClusterCard({ cluster, onDone }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [ticked, setTicked] = useState<Record<string, boolean>>(
    Object.fromEntries(cluster.items.map((it) => [it.step_id, false])),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function toggleTick(stepId: string) {
    setTicked((prev) => ({ ...prev, [stepId]: !prev[stepId] }))
  }

  async function handleReport() {
    setSaving(true)
    setSaveError(null)

    const doneStepIds = Object.entries(ticked)
      .filter(([, v]) => v)
      .map(([k]) => k)

    try {
      const results = await Promise.allSettled(
        doneStepIds.map((stepId) =>
          fetch(`/api/steps/${stepId}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_type: "done" }),
          }),
        ),
      )

      const anyFailed = results.some((r) => r.status === "rejected")
      if (anyFailed) throw new Error("Some items failed to save")
      onDone()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const tickedCount = Object.values(ticked).filter(Boolean).length

  if (!expanded) {
    return (
      <div className="flex flex-col flex-none bg-surface border border-accent/40 rounded-2xl overflow-hidden hover:border-accent transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-left p-5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] active:bg-surface/80"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent">
              Buying run
            </span>
          </div>
          <div className="text-2xl font-bold leading-[1.15] tracking-[-0.015em] text-fg text-pretty">
            {cluster.title}
          </div>
          <div className="text-sm text-muted mt-1 leading-[1.4]">
            {cluster.items.map((i) => i.step_name).join(" · ")}
          </div>
          {cluster.reason && (
            <div className="border-t border-border mt-3.5 pt-3 text-sm leading-[1.4] text-muted">
              {cluster.reason}
            </div>
          )}
        </button>
        <div className="border-t border-border px-5 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-accent hover:underline transition-colors"
          >
            Open checklist →
          </button>
        </div>
      </div>
    )
  }

  // Expanded: checklist
  return (
    <div className="flex flex-col bg-surface border border-accent rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent mb-0.5">
          Buying run
        </div>
        <div className="text-xl font-bold leading-[1.15] tracking-[-0.015em] text-fg">
          {cluster.title}
        </div>
        {cluster.reason && (
          <div className="text-sm text-muted mt-1">{cluster.reason}</div>
        )}
      </div>

      {/* Checklist */}
      <div className="px-5 py-3 flex flex-col gap-0.5">
        {cluster.items.map((item) => {
          const checked = ticked[item.step_id] ?? false
          return (
            <button
              key={item.step_id}
              type="button"
              onClick={() => toggleTick(item.step_id)}
              className="flex items-center gap-3 py-2.5 text-left w-full group"
            >
              <span
                className={`flex-none w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  checked
                    ? "bg-fg border-fg"
                    : "border-dim group-hover:border-muted"
                }`}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#16181c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className={`text-base leading-[1.35] block ${
                    checked ? "text-subtle line-through decoration-dim" : "text-fg"
                  }`}
                >
                  {item.step_name}
                </span>
                <span className="text-xs text-muted block mt-0.5">
                  {item.thing_name}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {saveError && (
        <p className="px-5 text-sm text-red-400 pb-2">{saveError}</p>
      )}

      {/* Footer */}
      <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void handleReport()}
          disabled={saving}
          className="bg-fg text-bg rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-white transition-all active:scale-[0.98] disabled:opacity-30"
        >
          {saving ? "Saving…" : tickedCount > 0 ? "Done" : "None ordered"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-semibold text-muted hover:text-fg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
