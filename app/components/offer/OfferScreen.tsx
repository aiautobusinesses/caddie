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
      <div className="flex-none px-6 py-5 border-b-2 border-[#2c3040]">
        <h2 className="text-[32px] font-bold leading-[1.04] tracking-[-0.025em] text-[#e8eaf0]">
          What do you fancy?
        </h2>
      </div>

      {offer.length === 0 && !careGroup ? (
        <div className="flex-1 px-6 flex flex-col justify-center">
          <h3 className="text-[28px] font-bold leading-[1.06] tracking-[-0.02em] text-[#e8eaf0]">
            Nothing needs doing right now.
          </h3>
          <div className="mt-5 flex flex-col gap-2" style={{ width: "fit-content" }}>
            <button
              type="button"
              onClick={onRefresh}
              className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
            >
              Look again
            </button>
            <button
              type="button"
              onClick={onCapture}
              className="text-left text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors px-1 py-1"
            >
              Add something?
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center min-h-0 overflow-hidden">
          <div className="flex flex-col gap-[14px] px-6 py-4">
            {actionError && <p className="text-sm text-red-400">{actionError}</p>}
            {careGroup && <CareGroupCard group={careGroup} onDone={onRefresh} />}
            {offer.map((item) => (
              <div
                key={item.thing_id}
                className="flex flex-col flex-none bg-[#1e2128] border border-[#2c3040] rounded-[18px] overflow-hidden hover:border-[#e8eaf0] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onStart(item)}
                  className="text-left px-[22px] pt-5 pb-[18px] focus-visible:outline-2 focus-visible:outline-[#c2604a] focus-visible:outline-offset-[-2px]"
                >
                  <div className="text-[23px] font-bold leading-[1.15] tracking-[-0.015em] text-[#e8eaf0] text-wrap-pretty">
                    {item.thing_name}
                  </div>
                  {item.reason && (
                    <div className="border-t border-[#2c3040] mt-[14px] pt-3 text-[13px] leading-[1.4] text-[#5a6070]">
                      {item.reason}
                    </div>
                  )}
                </button>
                {peekBreakdown[item.thing_id] ? (
                  <div className="border-t border-[#2c3040] px-[22px] pb-[14px]">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#5a6070] mt-3 mb-2">First steps</p>
                    <ol className="flex flex-col gap-[6px]">
                      {peekBreakdown[item.thing_id].map((step, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-[1.4] text-[#9aa0b0]">
                          <span className="text-[#3a4155] flex-shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="border-t border-[#2c3040] px-[22px] py-[10px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPeek(item.thing_id)
                      }}
                      disabled={peekLoading[item.thing_id]}
                      className="text-[12px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors disabled:opacity-40"
                    >
                      {peekLoading[item.thing_id] ? "Thinking…" : "Break this task down"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-6 pb-4 flex flex-col gap-2" style={{ paddingRight: "96px" }}>
            <button
              type="button"
              onClick={onSkipAll}
              className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
            >
              Show me three others
            </button>
          </div>
        </div>
      )}
    </>
  )
}
