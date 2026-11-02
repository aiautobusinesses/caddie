/**
 * FocusScreen — shown when the user has started a step.
 *
 * Copy rules (DESIGN.md §Deliberately excluded):
 *  - No encouragement, praise or pep talk ("great work", "nearly there", "well done").
 *    Verbal persuasion is the weakest efficacy source and is controlling under Deci.
 *  - No urgency language.
 *  - No progress bars, percentages or steps-remaining counts.
 *  - Factual and neutral only.
 */
"use client"

import { useState } from "react"
import type { InProgressThing } from "@/lib/offer"

type Props = {
  inProgress: InProgressThing
  actionError: string | null
  justStarted: boolean
  nudging: boolean
  onDone: (stillGoing: boolean) => void
  onNudge: (direction: "back" | "forward") => void
  onSaveName: (newName: string) => void
  onAbandon: () => void
}

export default function FocusScreen({
  inProgress,
  actionError,
  justStarted,
  nudging,
  onDone,
  onNudge,
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
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName()
                if (e.key === "Escape") setEditingName(false)
              }}
              autoFocus
              className="text-xs font-bold uppercase tracking-[0.1em] text-fg bg-transparent border-b border-muted focus:outline-none focus:border-fg transition-colors w-full"
            />
            <button type="button" onClick={commitName} className="text-xs font-bold text-fg hover:text-white transition-colors flex-none">Save</button>
            <button type="button" onClick={() => setEditingName(false)} className="text-xs font-bold text-muted hover:text-subtle transition-colors flex-none">✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="text-xs font-bold uppercase tracking-[0.1em] text-muted hover:text-subtle transition-colors text-left"
          >
            {inProgress.thing_name ?? ""}
          </button>
        )}
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-y-auto">
        <p className="text-4xl sm:text-5xl font-bold leading-[1.04] tracking-[-0.03em] text-fg text-pretty">
          {inProgress.step_name ?? inProgress.thing_name ?? ""}
        </p>
        <p className="mt-3 text-sm text-muted">
          {justStarted ? "just started" : "picked up where you left off"}
        </p>

        {(inProgress.last_stop_note || inProgress.last_stop_photo_url) && (
          <div className="mt-5 bg-surface border border-border rounded-2xl p-4 text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1.5">
              Where you got to
            </p>
            {inProgress.last_stop_note && (
              <p className="text-sm text-fg leading-relaxed">
                {inProgress.last_stop_note}
              </p>
            )}
            {inProgress.last_stop_photo_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={inProgress.last_stop_photo_url}
                alt="Where you got to"
                className="mt-3 rounded-xl max-h-48 w-auto object-cover border border-border"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2.5">
        {actionError && <p className="text-sm text-red-400 mb-2">{actionError}</p>}
        <button
          type="button"
          onClick={() => onDone(false)}
          className="text-left bg-fg text-bg rounded-xl px-5 py-4 text-base font-semibold hover:bg-white transition-all active:scale-[0.99]"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onDone(true)}
          className="text-left border border-border rounded-xl px-5 py-3.5 text-sm font-semibold text-subtle hover:border-fg hover:text-fg transition-all active:scale-[0.99]"
        >
          Still going
        </button>
        {(inProgress.can_nudge_back || inProgress.can_nudge_forward) && (
          <div className="flex items-center gap-3 mt-1 px-1">
            {inProgress.can_nudge_back && (
              <button
                type="button"
                onClick={() => onNudge("back")}
                disabled={nudging}
                className="text-left text-xs font-semibold text-muted hover:text-fg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {nudging ? "…" : "← Step back"}
              </button>
            )}
            {inProgress.can_nudge_forward && (
              <button
                type="button"
                onClick={() => onNudge("forward")}
                disabled={nudging}
                className="text-left text-xs font-semibold text-muted hover:text-fg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {nudging ? "…" : "Step forward →"}
              </button>
            )}
          </div>
        )}
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
