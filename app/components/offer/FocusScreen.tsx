"use client"

import { useState } from "react"
import type { InProgressThing } from "@/lib/offer"

type Props = {
  inProgress: InProgressThing
  actionError: string | null
  justStarted: boolean
  onDone: (stillGoing: boolean) => void
  onSaveName: (newName: string) => void
  onAbandon: () => void
}

export default function FocusScreen({
  inProgress,
  actionError,
  justStarted,
  onDone,
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
          {inProgress.thing_name ?? ""}
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
            {inProgress.step_name ?? inProgress.thing_name ?? ""}
          </button>
        )}
        <p className="mt-3.5 text-sm text-muted">
          {justStarted ? "started just now" : "welcome back"}
        </p>
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2">
        {actionError && <p className="text-sm text-red-400 mb-2">{actionError}</p>}
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
