"use client"

import type { OfferItem, CareGroupOffer } from "@/lib/offer"
import CareGroupCard from "@/app/components/CareGroupCard"

type Props = {
  offer: OfferItem[]
  careGroup: CareGroupOffer | null
  actionError: string | null
  peekBreakdown: Record<string, string[]>
  peekLoading: Record<string, boolean>
  onStart: (item: OfferItem) => void
  onSkipAll: () => void
  onPeek: (thingId: string) => void
  onCapture: () => void
  onRefresh: () => void
}

export default function OfferScreen({
  offer,
  careGroup,
  actionError,
  peekBreakdown,
  peekLoading,
  onStart,
  onSkipAll,
  onPeek,
  onCapture,
  onRefresh,
}: Props) {
  return (
    <>
      <div className="flex-none px-6 py-5 border-b-2 border-border">
        <h2 className="text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-fg">
          What do you fancy?
        </h2>
      </div>

      {offer.length === 0 && !careGroup ? (
        <div className="flex-1 px-6 flex flex-col justify-center">
          <h3 className="text-3xl font-bold leading-[1.06] tracking-[-0.02em] text-fg">
            Nothing needs doing right now.
          </h3>
          <div className="mt-5 flex flex-col gap-2 w-fit">
            <button
              type="button"
              onClick={onRefresh}
              className="text-left border border-border rounded-[14px] px-4 py-3.5 text-sm font-bold text-subtle hover:border-fg hover:text-fg transition-colors"
            >
              Look again
            </button>
            <button
              type="button"
              onClick={onCapture}
              className="text-left text-sm font-bold text-muted hover:text-subtle transition-colors px-1 py-1"
            >
              Add something?
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3.5 px-6 py-4">
            {actionError && <p className="text-sm text-red-400">{actionError}</p>}
            {careGroup && <CareGroupCard group={careGroup} onDone={onRefresh} />}
            {offer.map((item) => (
              <div
                key={item.thing_id}
                className="flex flex-col flex-none bg-surface border border-border rounded-[18px] overflow-hidden hover:border-fg transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onStart(item)}
                  className="text-left px-[22px] pt-5 pb-[18px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]"
                >
                  <div className="text-2xl font-bold leading-[1.15] tracking-[-0.015em] text-fg text-pretty">
                    {item.thing_name}
                  </div>
                  {item.reason && (
                    <div className="border-t border-border mt-3.5 pt-3 text-sm leading-[1.4] text-muted">
                      {item.reason}
                    </div>
                  )}
                </button>
                {peekBreakdown[item.thing_id] ? (
                  <div className="border-t border-border px-[22px] pb-3.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted mt-3 mb-2">First steps</p>
                    <ol className="flex flex-col gap-1.5">
                      {peekBreakdown[item.thing_id].map((step, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-[1.4] text-subtle">
                          <span className="text-dim flex-shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="border-t border-border px-[22px] py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPeek(item.thing_id)
                      }}
                      disabled={peekLoading[item.thing_id]}
                      className="text-[12px] font-bold text-muted hover:text-subtle transition-colors disabled:opacity-40"
                    >
                      {peekLoading[item.thing_id] ? "Thinking…" : "Break this task down"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-6 pb-4 pr-24 flex flex-col gap-2">
            <button
              type="button"
              onClick={onSkipAll}
              className="text-left border border-border rounded-[14px] px-4 py-3.5 text-sm font-bold text-subtle hover:border-fg hover:text-fg transition-colors"
            >
              Show me three others
            </button>
          </div>
        </div>
      )}
    </>
  )
}
