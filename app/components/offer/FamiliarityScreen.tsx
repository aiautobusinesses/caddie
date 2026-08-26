"use client"

import type { OfferItem } from "@/lib/offer"

type Props = {
  item: OfferItem
  onYes: () => void
  onNo: () => void
}

export default function FamiliarityScreen({ item, onYes, onNo }: Props) {
  return (
    <>
      <div className="flex-none px-6 pt-6 pb-0">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          {item.thing_name}
        </p>
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-hidden">
        <h2 className="text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-fg text-pretty">
          Know how to {item.step_name.toLowerCase()}?
        </h2>
        <p className="mt-3.5 text-sm text-muted">
          If not, Caddie will add a quick look-up step first.
        </p>
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onYes}
          className="text-left bg-fg text-bg rounded-[14px] px-5 py-[17px] text-md font-bold hover:bg-white transition-colors"
        >
          Yes, let&rsquo;s go
        </button>
        <button
          type="button"
          onClick={onNo}
          className="text-left border border-border rounded-[14px] px-5 py-[15px] text-base font-bold text-subtle hover:border-fg hover:text-fg transition-colors"
        >
          No, add a look-up step
        </button>
      </div>
    </>
  )
}
