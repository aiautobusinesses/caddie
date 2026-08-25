"use client"

import Spinner from "@/app/components/Spinner"
import type { InProgressThing } from "@/lib/offer"

type Props = {
  inProgress: InProgressThing
  breakdown: string[] | null
  loadingBreakdown: boolean
  breakdownError: string | null
  actionError: string | null
  editingName: boolean
  editedName: string
  confirmingAbandon: boolean
  justStarted: boolean
  onDone: (stillGoing: boolean) => void
  onBreakdown: () => void
  onSetEditingName: (v: boolean) => void
  onSetEditedName: (v: string) => void
  onSaveName: () => void
  onSetConfirmingAbandon: (v: boolean) => void
  onAbandon: () => void
}

export default function FocusScreen({
  inProgress,
  breakdown,
  loadingBreakdown,
  breakdownError,
  actionError,
  editingName,
  editedName,
  confirmingAbandon,
  justStarted,
  onDone,
  onBreakdown,
  onSetEditingName,
  onSetEditedName,
  onSaveName,
  onSetConfirmingAbandon,
  onAbandon,
}: Props) {
  return (
    <>
      <div className="flex-none px-6 pt-6 pb-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#5a6070]">
          You&rsquo;re doing this
        </p>
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-hidden">
        {editingName ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={editedName}
              onChange={(e) => onSetEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveName()
                if (e.key === "Escape") onSetEditingName(false)
              }}
              autoFocus
              className="text-[32px] font-bold leading-[1.04] tracking-[-0.025em] text-[#e8eaf0] bg-transparent border-b-2 border-[#5a6070] focus:outline-none focus:border-[#e8eaf0] transition-colors w-full"
            />
            <div className="flex gap-3 mt-1">
              <button type="button" onClick={onSaveName} className="text-[13px] font-bold text-[#e8eaf0] hover:text-white transition-colors">Save</button>
              <button type="button" onClick={() => onSetEditingName(false)} className="text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onSetEditedName(inProgress.thing_name ?? "")
              onSetEditingName(true)
            }}
            className="text-left text-[40px] font-bold leading-[1.02] tracking-[-0.03em] text-[#e8eaf0] text-wrap-pretty hover:text-white transition-colors"
          >
            {inProgress.thing_name ?? ""}
          </button>
        )}
        <p className="mt-[14px] text-[13px] text-[#5a6070]">
          {justStarted ? "started just now" : "welcome back"}
        </p>

        {breakdown && (
          <div className="mt-6 border-t-2 border-[#2c3040] pt-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#5a6070] mb-[10px]">
              The step you&rsquo;re on
            </p>
            <p className="text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-[#e8eaf0] text-wrap-pretty mb-4">
              {inProgress.step_name ?? ""}
            </p>
            <div className="flex flex-col">
              {breakdown.map((step, i) => (
                <div key={i} className="flex gap-3 py-[9px] border-b border-[#2c3040] text-[14.5px] leading-[1.35] text-[#9aa0b0]">
                  <span className="w-[7px] h-[7px] rounded-full bg-[#5a6070] flex-none mt-2" />
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
            className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors inline-flex items-center gap-2 disabled:opacity-40"
          >
            {loadingBreakdown && <Spinner />}
            {loadingBreakdown ? "Thinking…" : "Break it into steps"}
          </button>
        )}
        {breakdownError && !breakdown && <p className="text-xs text-red-400">{breakdownError}</p>}
        <button
          type="button"
          onClick={() => onDone(false)}
          className="text-left bg-[#e8eaf0] text-[#16181c] rounded-[14px] px-5 py-[17px] text-[15px] font-bold hover:bg-white transition-colors"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => onDone(true)}
          className="text-left border border-[#2c3040] rounded-[14px] px-5 py-[15px] text-[14px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
        >
          Still going
        </button>
        {!justStarted && (
          <button
            type="button"
            onClick={() => onDone(true)}
            className="text-left text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors px-1 py-1"
          >
            Not now
          </button>
        )}
        {confirmingAbandon ? (
          <div className="flex flex-col gap-2 mt-1 border-t border-[#2c3040] pt-3">
            <p className="text-[12px] text-[#9aa0b0]">This can&rsquo;t be undone.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onAbandon}
                className="text-[13px] font-bold text-red-400 hover:text-red-300 transition-colors"
              >
                Yes, let it go
              </button>
              <button
                type="button"
                onClick={() => onSetConfirmingAbandon(false)}
                className="text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSetConfirmingAbandon(true)}
            className="text-left text-[12px] font-bold text-[#3a4155] hover:text-[#5a6070] transition-colors px-1 py-1"
          >
            Let this go
          </button>
        )}
      </div>
    </>
  )
}
