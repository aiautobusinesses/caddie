"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CareGroupOffer } from "@/lib/offer"

type Props = {
  group: CareGroupOffer
  onDone: () => void
}

/**
 * CareGroupCard — shown in the offer list when a care group is due.
 *
 * Tapping the card opens a checklist of entity names (reusing the
 * chain-checklist pattern). Submit saves results and refreshes the offer.
 *
 * The "edit plan" link is reachable only from here, not from any index.
 */
export default function CareGroupCard({ group, onDone }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  // Checklist state: plan_id → ticked
  const [ticked, setTicked] = useState<Record<string, boolean>>(
    Object.fromEntries(group.plan_ids.map((id) => [id, false])),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function toggleTick(planId: string) {
    setTicked((prev) => ({ ...prev, [planId]: !prev[planId] }))
  }

  async function handleReport() {
    setSaving(true)
    setSaveError(null)
    const doneIds = Object.entries(ticked)
      .filter(([, v]) => v)
      .map(([k]) => k)

    try {
      const res = await fetch("/api/care-groups/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_ids: group.plan_ids, done_ids: doneIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === "string" ? data.error : "Save failed")
      }
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
      <div className="flex flex-col flex-none bg-[#1e2128] border border-[#2c3040] rounded-[18px] overflow-hidden hover:border-[#e8eaf0] transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-left px-[22px] pt-5 pb-[18px] focus-visible:outline-2 focus-visible:outline-[#c2604a] focus-visible:outline-offset-[-2px]"
        >
          <div className="text-[23px] font-bold leading-[1.15] tracking-[-0.015em] text-[#e8eaf0] text-wrap-pretty">
            {group.title}
          </div>
          {group.entity_names.length > 1 && (
            <div className="text-[13px] text-[#5a6070] mt-1 leading-[1.4]">
              {group.entity_names.join(", ")}
            </div>
          )}
          {group.reason && (
            <div className="border-t border-[#2c3040] mt-[14px] pt-3 text-[13px] leading-[1.4] text-[#5a6070]">
              {group.reason}
            </div>
          )}
        </button>
        <div className="border-t border-[#2c3040] px-[22px] py-[10px]">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[12px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors"
          >
            Mark done →
          </button>
        </div>
      </div>
    )
  }

  // Expanded: checklist
  // Lead with what was done framing: show names as checkable items
  return (
    <div className="flex flex-col bg-[#1e2128] border border-[#2c3040] rounded-[18px] overflow-hidden">
      <div className="px-[22px] pt-5 pb-4 border-b border-[#2c3040]">
        <div className="text-[20px] font-bold leading-[1.15] tracking-[-0.015em] text-[#e8eaf0]">
          {group.title}
        </div>
        {group.reason && (
          <div className="text-[13px] text-[#5a6070] mt-1">{group.reason}</div>
        )}
      </div>

      {/* Checklist */}
      <div className="px-[22px] py-3 flex flex-col gap-[2px]">
        {group.plan_ids.map((planId, i) => {
          const name = group.entity_names[i] ?? planId
          const checked = ticked[planId] ?? false
          return (
            <button
              key={planId}
              type="button"
              onClick={() => toggleTick(planId)}
              className="flex items-center gap-3 py-[9px] text-left w-full group"
            >
              <span
                className={`flex-none w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  checked
                    ? "bg-[#e8eaf0] border-[#e8eaf0]"
                    : "border-[#3a4155] group-hover:border-[#5a6070]"
                }`}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#16181c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span
                className={`text-[14.5px] leading-[1.35] transition-colors ${
                  checked ? "text-[#9aa0b0] line-through decoration-[#3a4155]" : "text-[#e8eaf0]"
                }`}
              >
                {name}
              </span>
            </button>
          )
        })}
      </div>

      {saveError && (
        <p className="px-[22px] text-sm text-red-400 pb-2">{saveError}</p>
      )}

      {/* Footer: save + edit link */}
      <div className="border-t border-[#2c3040] px-[22px] py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void handleReport()}
          disabled={saving}
          className="bg-[#e8eaf0] text-[#16181c] rounded-[10px] px-4 py-[9px] text-[13px] font-bold hover:bg-white transition-colors disabled:opacity-30"
        >
          {saving ? "Saving…" : tickedCount > 0 ? "Done" : "None done"}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[12px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => router.push(`/care-plans/${group.anchor_plan_id}/edit`)}
            className="text-[12px] font-bold text-[#3a4155] hover:text-[#5a6070] transition-colors"
          >
            Edit plan
          </button>
        </div>
      </div>
    </div>
  )
}
