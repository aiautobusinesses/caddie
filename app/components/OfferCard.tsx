"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { OfferItem, InProgressThing } from "@/app/api/offer/route"
import Spinner from "./Spinner"
import { useCapture } from "./capture/CaptureContext"
import { TASKS_UPDATED_EVENT } from "@/lib/capture"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = "offer" | "focus" | "settings"

type Props = {
  initialOffer: OfferItem[]
  initialInProgress: InProgressThing | null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OfferCard({ initialOffer, initialInProgress }: Props) {
  const router = useRouter()
  const { openCapture } = useCapture()
  const [screen, setScreen] = useState<Screen>(initialInProgress ? "focus" : "offer")
  const [offer, setOffer] = useState<OfferItem[]>(initialOffer)
  const [inProgress, setInProgress] = useState<InProgressThing | null>(initialInProgress)
  const [breakdown, setBreakdown] = useState<string[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)
  // Per-card peek state (keyed by thing_id)
  const [peekBreakdown, setPeekBreakdown] = useState<Record<string, string[]>>({})
  const [peekLoading, setPeekLoading] = useState<Record<string, boolean>>({})
  const [thingComplete, setThingComplete] = useState<{ name: string } | null>(null)
  // Inline name editing
  const [editingName, setEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")
  // Abandon confirmation
  const [confirmingAbandon, setConfirmingAbandon] = useState(false)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const refreshOffer = useCallback(async () => {
    setRefreshing(true)
    setFetchError(null)
    try {
      const res = await fetch("/api/offer")
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      if (data.in_progress) {
        setInProgress(data.in_progress)
        setBreakdown(null)
        setScreen("focus")
      } else {
        setInProgress(null)
        setOffer(data.offer ?? [])
        setScreen("offer")
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Listen for new things saved via capture modal
  useEffect(() => {
    const handler = () => void refreshOffer()
    window.addEventListener(TASKS_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TASKS_UPDATED_EVENT, handler)
  }, [refreshOffer])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleStart(item: OfferItem) {
    setInProgress({
      thing_id: item.thing_id,
      thing_name: item.thing_name,
      step_name: item.step_name,
      started_at: new Date().toISOString(),
    })
    setBreakdown(null)
    setActionError(null)
    setScreen("focus")

    try {
      const res = await fetch(`/api/things/${item.thing_id}/start`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to start")
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  async function handleDone(stillGoing: boolean) {
    if (!inProgress) return
    setActionError(null)
    setBreakdown(null)

    if (stillGoing) {
      // Fire-and-forget is fine here — we just clear started_at
      void refreshOffer()
      fetch(`/api/things/${inProgress.thing_id}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ still_going: true }),
      }).catch((e) => {
        setActionError(e instanceof Error ? e.message : "Something went wrong")
      })
      return
    }

    // Await the done response so we can detect thing_complete
    try {
      const res = await fetch(`/api/things/${inProgress.thing_id}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ still_going: false }),
      })
      const data = await res.json()
      if (data.thing_complete && data.thing_name) {
        setThingComplete({ name: data.thing_name as string })
        // Auto-advance to offer screen after 1.5s
        setTimeout(() => {
          setThingComplete(null)
          void refreshOffer()
        }, 1500)
      } else {
        void refreshOffer()
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong")
      void refreshOffer()
    }
  }

  async function handleBreakdown() {
    if (!inProgress) return
    setLoadingBreakdown(true)
    setBreakdownError(null)
    try {
      const res = await fetch(`/api/things/${inProgress.thing_id}/breakdown`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to get breakdown")
      setBreakdown(data.steps)
    } catch (e) {
      setBreakdownError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoadingBreakdown(false)
    }
  }

  async function handleSaveName() {
    if (!inProgress || !editedName.trim()) return
    const trimmed = editedName.trim()
    // Optimistically update local state
    setInProgress((prev) => prev ? { ...prev, thing_name: trimmed } : prev)
    setEditingName(false)
    fetch(`/api/things/${inProgress.thing_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => {
      // Revert on failure
      setInProgress((prev) => prev ? { ...prev, thing_name: inProgress.thing_name } : prev)
      setActionError("Couldn't save the name change")
    })
  }

  async function handleAbandon() {
    if (!inProgress) return
    setConfirmingAbandon(false)
    const thingId = inProgress.thing_id
    setInProgress(null)
    setScreen("offer")
    try {
      const res = await fetch(`/api/things/${thingId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      void refreshOffer()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong")
      void refreshOffer()
    }
  }

  async function handlePeek(thingId: string) {
    if (peekBreakdown[thingId] || peekLoading[thingId]) return
    setPeekLoading((prev) => ({ ...prev, [thingId]: true }))
    try {
      const res = await fetch(`/api/things/${thingId}/breakdown`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      // Show only first 2 steps at offer time — showing the full chain is the unpacking problem
      setPeekBreakdown((prev) => ({ ...prev, [thingId]: (data.steps as string[]).slice(0, 2) }))
    } catch {
      // Silently fail — peek is non-critical
    } finally {
      setPeekLoading((prev) => ({ ...prev, [thingId]: false }))
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (thingComplete) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh px-6 text-center cursor-pointer"
        onClick={() => { setThingComplete(null); void refreshOffer() }}
      >
        <p className="text-[32px] font-bold leading-[1.04] tracking-[-0.025em] text-[#e8eaf0]">
          {thingComplete.name} done.
        </p>
      </div>
    )
  }

  if (refreshing) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <Spinner />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center gap-4">
        <p className="text-sm text-red-400">{fetchError}</p>
        <button type="button" onClick={() => void refreshOffer()} className="text-sm text-[#5a6070] underline">
          Try again
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-dvh bg-[#16181c]">

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* ── Offer screen ─────────────────────────────────────────────── */}
        {screen === "offer" && (
          <>
            {/* Header */}
            <div className="flex-none px-6 py-5 border-b-2 border-[#2c3040]">
              <h2 className="text-[32px] font-bold leading-[1.04] tracking-[-0.025em] text-[#e8eaf0]">
                What do you fancy?
              </h2>
            </div>

            {offer.length === 0 ? (
              /* Empty state */
              <div className="flex-1 px-6 flex flex-col justify-center">
                <h3 className="text-[28px] font-bold leading-[1.06] tracking-[-0.02em] text-[#e8eaf0]">
                  Nothing needs doing right now.
                </h3>
                <div className="mt-5 flex flex-col gap-2" style={{ width: "fit-content" }}>
                  <button
                    type="button"
                    onClick={() => void refreshOffer()}
                    className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
                  >
                    Look again
                  </button>
                  <button
                    type="button"
                    onClick={openCapture}
                    className="text-left text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors px-1 py-1"
                  >
                    Add something?
                  </button>
                </div>
              </div>
            ) : (
              /* Cards + reshuffle */
              <div className="flex-1 flex flex-col justify-center min-h-0 overflow-hidden">
                <div className="flex flex-col gap-[14px] px-6 py-4">
                  {actionError && (
                    <p className="text-sm text-red-400">{actionError}</p>
                  )}
                  {offer.map((item) => (
                    <div
                      key={item.thing_id}
                      className="flex flex-col flex-none bg-[#1e2128] border border-[#2c3040] rounded-[18px] overflow-hidden hover:border-[#e8eaf0] transition-colors"
                    >
                      {/* Tap to start */}
                      <button
                        type="button"
                        onClick={() => void handleStart(item)}
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
                      {/* Peek: where to start */}
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
                            onClick={(e) => { e.stopPropagation(); void handlePeek(item.thing_id) }}
                            disabled={peekLoading[item.thing_id]}
                            className="text-[12px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors disabled:opacity-40"
                          >
                            {peekLoading[item.thing_id] ? "Thinking…" : "Where to start?"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-4 flex flex-col gap-2" style={{ paddingRight: "96px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      // Log skipped against every offered step, fire-and-forget
                      offer.forEach((item) => {
                        void fetch(`/api/steps/${item.step_id}/event`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ event_type: "skipped" }),
                        })
                      })
                      void refreshOffer()
                    }}
                    className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
                  >
                    Show me three others
                  </button>
                  <p className="text-[11.5px] leading-[1.4] text-[#5a6070]">
                    None of these? Nothing bad happens.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Focus screen ─────────────────────────────────────────────── */}
        {screen === "focus" && (
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
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveName(); if (e.key === "Escape") setEditingName(false) }}
                    autoFocus
                    className="text-[32px] font-bold leading-[1.04] tracking-[-0.025em] text-[#e8eaf0] bg-transparent border-b-2 border-[#5a6070] focus:outline-none focus:border-[#e8eaf0] transition-colors w-full"
                  />
                  <div className="flex gap-3 mt-1">
                    <button type="button" onClick={() => void handleSaveName()} className="text-[13px] font-bold text-[#e8eaf0] hover:text-white transition-colors">Save</button>
                    <button type="button" onClick={() => setEditingName(false)} className="text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditedName(inProgress?.thing_name ?? ""); setEditingName(true) }}
                  className="text-left text-[40px] font-bold leading-[1.02] tracking-[-0.03em] text-[#e8eaf0] text-wrap-pretty hover:text-white transition-colors"
                >
                  {inProgress?.thing_name ?? ""}
                </button>
              )}
              <p className="mt-[14px] text-[13px] text-[#5a6070]">started just now</p>

              {breakdown && (
                <div className="mt-6 border-t-2 border-[#2c3040] pt-4">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#5a6070] mb-[10px]">
                    The step you&rsquo;re on
                  </p>
                  <p className="text-[20px] font-bold leading-[1.2] tracking-[-0.015em] text-[#e8eaf0] text-wrap-pretty mb-4">
                    {inProgress?.step_name ?? ""}
                  </p>
                  <div className="flex flex-col">
                    {breakdown.map((step, i) => (
                      <div key={i} className="flex gap-3 py-[9px] border-b border-[#2c3040] text-[14.5px] leading-[1.35] text-[#9aa0b0]">
                        <span className="w-[7px] h-[7px] rounded-full bg-[#5a6070] flex-none mt-2" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  {breakdownError && (
                    <p className="text-xs text-red-400 mt-3">{breakdownError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex-none px-6 pb-6 flex flex-col gap-2">
              {actionError && (
                <p className="text-sm text-red-400 mb-2">{actionError}</p>
              )}
              {!breakdown && (
                <button
                  type="button"
                  disabled={loadingBreakdown}
                  onClick={() => void handleBreakdown()}
                  className="text-left border border-[#2c3040] rounded-[14px] px-4 py-[13px] text-[13px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors inline-flex items-center gap-2 disabled:opacity-40"
                >
                  {loadingBreakdown && <Spinner />}
                  {loadingBreakdown ? "Thinking…" : "Break it into steps"}
                </button>
              )}
              {breakdownError && !breakdown && (
                <p className="text-xs text-red-400">{breakdownError}</p>
              )}
              <button
                type="button"
                onClick={() => void handleDone(false)}
                className="text-left bg-[#e8eaf0] text-[#16181c] rounded-[14px] px-5 py-[17px] text-[15px] font-bold hover:bg-white transition-colors"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => void handleDone(true)}
                className="text-left border border-[#2c3040] rounded-[14px] px-5 py-[15px] text-[14px] font-bold text-[#9aa0b0] hover:border-[#e8eaf0] hover:text-[#e8eaf0] transition-colors"
              >
                Still going
              </button>
              <button
                type="button"
                onClick={() => void handleDone(true)}
                className="text-left text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors px-1 py-1"
              >
                Not now
              </button>
              {confirmingAbandon ? (
                <div className="flex flex-col gap-2 mt-1 border-t border-[#2c3040] pt-3">
                  <p className="text-[12px] text-[#9aa0b0]">This can&rsquo;t be undone.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => void handleAbandon()}
                      className="text-[13px] font-bold text-red-400 hover:text-red-300 transition-colors"
                    >
                      Yes, let it go
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingAbandon(false)}
                      className="text-[13px] font-bold text-[#5a6070] hover:text-[#9aa0b0] transition-colors"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingAbandon(true)}
                  className="text-left text-[12px] font-bold text-[#3a4155] hover:text-[#5a6070] transition-colors px-1 py-1"
                >
                  Let this go
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Settings screen ──────────────────────────────────────────── */}
        {screen === "settings" && (
          <>
            <div className="flex-none px-6 py-[22px]">
              <h2 className="text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-[#e8eaf0]">
                Settings
              </h2>
            </div>
            <div className="border-t-2 border-[#2c3040]">
              {/* Your list — hidden on purpose */}
              <div className="px-6 py-4 border-b border-[#2c3040]">
                <div className="flex justify-between items-baseline gap-3">
                  <span className="text-[15px] font-semibold text-[#e8eaf0]">Your list</span>
                  <span className="text-[13px] text-[#c2604a]">Hidden on purpose</span>
                </div>
                <p className="mt-[10px] text-[12.5px] leading-[1.5] text-[#9aa0b0] max-w-[290px]">
                  Seeing the pile is the injury — you can&rsquo;t do it all, and you can&rsquo;t do only the interesting ones, so nothing gets done. Caddie holds all of it and hands you three.
                </p>
              </div>

              {/* Do another life walk */}
              <button
                type="button"
                onClick={() => router.push("/lifewalk")}
                className="block w-full text-left px-6 py-4 border-b border-[#2c3040] text-[15px] font-semibold text-[#e8eaf0] hover:bg-[#1e2128] transition-colors"
              >
                Do another life walk
              </button>
            </div>
            <p className="px-6 py-[18px] text-[12px] leading-[1.5] text-[#5a6070]">
              Caddie is holding everything you&rsquo;ve told it. It will never show you the total.
            </p>
          </>
        )}

      </div>

      {/* ── Bottom nav ───────────────────────────────────────────────────── */}
      <div className="flex-none flex border-t-2 border-[#2c3040] bg-[#16181c]">
        <button
          type="button"
          onClick={() => { if (screen === "settings") void refreshOffer() }}
          className="flex-1 text-left px-5 py-[14px] pb-[22px] text-[11px] font-bold uppercase tracking-[0.08em] border-r-2 border-[#2c3040] transition-colors hover:bg-[#1e2128]"
          style={{ color: screen !== "settings" ? "#e8eaf0" : "#5a6070" }}
        >
          Now
        </button>
        <button
          type="button"
          onClick={() => setScreen("settings")}
          className="flex-1 text-left px-5 py-[14px] pb-[22px] text-[11px] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-[#1e2128]"
          style={{ color: screen === "settings" ? "#e8eaf0" : "#5a6070" }}
        >
          You
        </button>
      </div>

    </div>
  )
}
