"use client"

import { useState } from "react"
import Spinner from "@/app/components/Spinner"
import type { InProgressThing } from "@/lib/offer"

type Props = {
  inProgress: InProgressThing
  breakdown: string[] | null
  loadingBreakdown: boolean
  breakdownError: string | null
  actionError: string | null
  justStarted: boolean
  onDone: (stillGoing: boolean) => void
  onBreakdown: () => void
  onSaveName: (newName: string) => void
  onAbandon: () => void
}

export default function FocusScreen({
  inProgress,
  breakdown,
  loadingBreakdown,
  breakdownError,
  actionError,
  justStarted,
  onDone,
  onBreakdown,
  onSaveName,
  onAbandon,
}: Props) {
  const [editingName, setEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  const [confirmingAbandon, setConfirmingAbandon] = useState(false)

  function startEditing() {
    setEditedName(inProgress.thing_name ?? "")
    setEditingName(true)
  }

  function commitName() {
    onSaveName(editedName)
    setEditingName(false)
  }

  return (
    <>
      <div className="flex-none px-6 pt-6 pb-0">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          You&rsquo;re doing this
        </p>
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-hidden">
        {editingName ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName()
                if (e.key === "Escape") setEditingName(false)
              }}
              autoFocus
              className="text-5xl font-bold leading-[1.04] tracking-[-0.025em] text-fg bg-transparent border-b-2 border-muted focus:outline-none focus:border-fg transition-colors w-full"
            />
            <div className="flex gap-3 mt-1">
              <button type="button" onClick={commitName} className="text-sm font-bold text-fg hover:text-white transition-colors">Save</button>
              <button type="button" onClick={() => setEditingName(false)} className="text-sm font-bold text-muted hover:text-subtle transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="text-left text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-fg text-pretty hover:text-white transition-colors"
          >
            {inProgress.thing_name ?? ""}
          </button>
        )}
        <p className="mt-3.5 text-sm text-muted">
          {justStarted ? "started just now" : "welcome back"}
        </p>

        {breakdown && (
          <div className="mt-6 border-t-2 border-border pt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted mb-2.5">
              The step you&rsquo;re on
            </p>
            <p className="text-xl font-bold leading-[1.2] tracking-[-0.015em] text-fg text-pretty mb-4">
              {inProgress.step_name ?? ""}
            </p>
            <div className="flex flex-col">
              {breakdown.map((step, i) => (
                <div key={i} className="flex gap-3 py-2.5 border-b border-border text-base leading-[1.35] text-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted flex-none mt-2" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
            {breakdownError && <p className="text-xs text-red-400 mt-3">{breakdownError}</p>}
          </div>
        )}
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2">
        {actionError && <p className="text-sm text-red-400 mb-2">{actionError}</p>}
        {!breakdown && (
          <button
            type="button"
            disabled={loadingBreakdown}
            onClick={onBreakdown}
            className="text-left border border-border rounded-[14px] px-4 py-3.5 text-sm font-bold text-subtle hover:border-fg hover:text-fg transition-colors inline-flex items-center gap-2 disabled:opacity-40"
          >
            {loadingBreakdown && <Spinner />}
            {loadingBreakdown ? "Thinking…" : "Break it into steps"}
          </button>
        )}
        {breakdownError && !breakdown && <p className="text-xs text-red-400">{breakdownError}</p>}
        <button
          type="button"
          onClick={() => onDone(false)}
          className="text-left bg-fg text-bg rounded-[14px] px-5 py-[17px] text-md font-bold hover:bg-white transition-colors"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onDone(true)}
          className="text-left border border-border rounded-[14px] px-5 py-[15px] text-base font-bold text-subtle hover:border-fg hover:text-fg transition-colors"
        >
          Still going
        </button>
        {confirmingAbandon ? (
          <div className="flex flex-col gap-2 mt-1 border-t border-border pt-3">
            <p className="text-[12px] text-subtle">This can&rsquo;t be undone.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onAbandon}
                className="text-sm font-bold text-red-400 hover:text-red-300 transition-colors"
              >
                Yes, let it go
              </button>
              <button
                type="button"
                onClick={() => setConfirmingAbandon(false)}
                className="text-sm font-bold text-muted hover:text-subtle transition-colors"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAbandon(true)}
            className="text-left text-[12px] font-bold text-dim hover:text-muted transition-colors px-1 py-1"
          >
            Let this go
          </button>
        )}
      </div>
    </>
  )
}
