"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MONTH_LABELS } from "@/lib/months"

const MONTHS = MONTH_LABELS.map((label, i) => ({ label, month: i + 1 }))

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
    <div className="flex flex-col min-h-dvh bg-bg">
      <div className="flex-none px-6 pt-6 border-b-2 border-border flex items-center gap-4 pb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-muted hover:text-subtle transition-colors text-sm font-semibold"
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-fg leading-[1.1] tracking-[-0.015em] flex-1">
          {entityName}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 max-w-sm mx-auto w-full">

        {source === "generated" && (
          <div className="bg-surface border border-border rounded-[14px] px-4 py-3 text-[12.5px] leading-[1.5] text-subtle">
            {note
              ? note
              : "This is a suggested starting plan — change it if you know better. Caddie will never overwrite your edits."}
          </div>
        )}

        {/* Action */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Action
          </label>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="bg-surface border border-border rounded-[10px] px-4 py-3 text-base text-fg focus:outline-none focus:border-muted transition-colors"
          />
          <p className="text-[11.5px] text-muted">
            Used to group items by action — e.g. &ldquo;Water&rdquo;, &ldquo;Feed&rdquo;, &ldquo;Put out&rdquo;.
          </p>
        </div>

        {/* Intervals */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Days between care — by month
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map(({ label, month }) => (
              <div key={month} className="flex flex-col gap-1">
                <span className="text-[10.5px] text-muted">{label}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={intervals[String(month)] ?? 7}
                  onChange={(e) => setMonth(month, e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2 py-1.5 text-base text-fg focus:outline-none focus:border-muted transition-colors text-center w-full"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tolerance */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Tolerance (days early without harm)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={toleranceDays}
            onChange={(e) => setToleranceDays(parseInt(e.target.value, 10) || 0)}
            className="bg-surface border border-border rounded-[10px] px-4 py-3 text-base text-fg focus:outline-none focus:border-muted transition-colors"
          />
          <p className="text-[11.5px] text-muted">
            Watering 2 days early is harmless — set 2. Bins on collection day — set 0.
          </p>
        </div>

        {/* Overdue */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Overdue threshold (days past due before it genuinely matters)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={overdueDays}
            onChange={(e) => setOverdueDays(parseInt(e.target.value, 10) || 0)}
            className="bg-surface border border-border rounded-[10px] px-4 py-3 text-base text-fg focus:outline-none focus:border-muted transition-colors"
          />
          <p className="text-[11.5px] text-muted">
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
          className="w-full bg-fg text-bg rounded-[14px] px-5 py-[17px] text-md font-bold hover:bg-white transition-colors disabled:opacity-30"
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  )
}
