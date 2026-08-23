"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type MonthLabel = {
  label: string
  month: number
}

const MONTHS: MonthLabel[] = [
  { label: "Jan", month: 1 },
  { label: "Feb", month: 2 },
  { label: "Mar", month: 3 },
  { label: "Apr", month: 4 },
  { label: "May", month: 5 },
  { label: "Jun", month: 6 },
  { label: "Jul", month: 7 },
  { label: "Aug", month: 8 },
  { label: "Sep", month: 9 },
  { label: "Oct", month: 10 },
  { label: "Nov", month: 11 },
  { label: "Dec", month: 12 },
]

type Props = {
  planId: string
  entityName: string
  initialAction: string
  initialIntervals: Record<string, number>
  initialToleranceDays: number
  initialOverdueDays: number
  source: "generated" | "user"
  note: string | null
}

export default function CarePlanEditor({
  planId,
  entityName,
  initialAction,
  initialIntervals,
  initialToleranceDays,
  initialOverdueDays,
  source,
  note,
}: Props) {
  const router = useRouter()
  const [action, setAction] = useState(initialAction)
  const [intervals, setIntervals] = useState<Record<string, number>>(
    Object.fromEntries(
      MONTHS.map((m) => [String(m.month), initialIntervals[String(m.month)] ?? 7]),
    ),
  )
  const [toleranceDays, setToleranceDays] = useState(initialToleranceDays)
  const [overdueDays, setOverdueDays] = useState(initialOverdueDays)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/care-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.trim(),
          intervals,
          tolerance_days: toleranceDays,
          overdue_days: overdueDays,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === "string" ? data.error : "Save failed")
      }
      setSaved(true)
      // Go back after short delay
      setTimeout(() => router.back(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function setMonth(month: number, value: string) {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 1) {
      setIntervals((prev) => ({ ...prev, [String(month)]: num }))
    }
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[#16181c]">
      <div className="flex-none px-6 pt-6 pb-0 border-b-2 border-[#2c3040] flex items-center gap-4 pb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[#5a6070] hover:text-[#9aa0b0] transition-colors text-sm font-semibold"
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 className="text-[20px] font-bold text-[#e8eaf0] leading-[1.1] tracking-[-0.015em] flex-1">
          {entityName}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 max-w-sm mx-auto w-full">

        {source === "generated" && (
          <div className="bg-[#1e2128] border border-[#2c3040] rounded-[14px] px-4 py-3 text-[12.5px] leading-[1.5] text-[#9aa0b0]">
            {note
              ? note
              : "This is a suggested starting plan — change it if you know better. Caddie will never overwrite your edits."}
          </div>
        )}

        {/* Action */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#5a6070]">
            Action
          </label>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="bg-[#1e2128] border border-[#2c3040] rounded-[10px] px-4 py-3 text-[14px] text-[#e8eaf0] focus:outline-none focus:border-[#5a6070] transition-colors"
          />
          <p className="text-[11.5px] text-[#5a6070]">
            Used to group items by action — e.g. &ldquo;Water&rdquo;, &ldquo;Feed&rdquo;, &ldquo;Put out&rdquo;.
          </p>
        </div>

        {/* Intervals */}
        <div className="flex flex-col gap-3">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#5a6070]">
            Days between care — by month
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map(({ label, month }) => (
              <div key={month} className="flex flex-col gap-1">
                <span className="text-[10.5px] text-[#5a6070]">{label}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={intervals[String(month)] ?? 7}
                  onChange={(e) => setMonth(month, e.target.value)}
                  className="bg-[#1e2128] border border-[#2c3040] rounded-[8px] px-2 py-[7px] text-[14px] text-[#e8eaf0] focus:outline-none focus:border-[#5a6070] transition-colors text-center w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tolerance */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#5a6070]">
            Tolerance (days early without harm)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={toleranceDays}
            onChange={(e) => setToleranceDays(parseInt(e.target.value, 10) || 0)}
            className="bg-[#1e2128] border border-[#2c3040] rounded-[10px] px-4 py-3 text-[14px] text-[#e8eaf0] focus:outline-none focus:border-[#5a6070] transition-colors"
          />
          <p className="text-[11.5px] text-[#5a6070]">
            Watering 2 days early is harmless — set 2. Bins on collection day — set 0.
          </p>
        </div>

        {/* Overdue */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#5a6070]">
            Overdue threshold (days past due before it genuinely matters)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={overdueDays}
            onChange={(e) => setOverdueDays(parseInt(e.target.value, 10) || 0)}
            className="bg-[#1e2128] border border-[#2c3040] rounded-[10px] px-4 py-3 text-[14px] text-[#e8eaf0] focus:outline-none focus:border-[#5a6070] transition-colors"
          />
          <p className="text-[11.5px] text-[#5a6070]">
            After this many days past due, Caddie will say so plainly.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || saved}
          className="w-full bg-[#e8eaf0] text-[#16181c] rounded-[14px] px-5 py-[17px] text-[15px] font-bold hover:bg-white transition-colors disabled:opacity-30"
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  )
}
