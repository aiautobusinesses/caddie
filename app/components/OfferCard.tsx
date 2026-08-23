"use client"

import { useCallback, useState } from "react"
import type { OfferItem, InProgressThing } from "@/app/api/offer/route"
import Spinner from "./Spinner"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = "offer" | "in_progress" | "return"

type Props = {
  initialOffer: OfferItem[]
  initialInProgress: InProgressThing | null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OfferCard({ initialOffer, initialInProgress }: Props) {
  const [screen, setScreen] = useState<Screen>(initialInProgress ? "return" : "offer")
  const [offer, setOffer] = useState<OfferItem[]>(initialOffer)
  const [inProgress, setInProgress] = useState<InProgressThing | null>(initialInProgress)
  const [breakdown, setBreakdown] = useState<string[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingAction, setLoadingAction] = useState(false)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)

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
        setScreen("return")
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

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleStart(item: OfferItem) {
    // Transition immediately — don't wait for the API
    setInProgress({ thing_id: item.thing_id, thing_name: item.thing_name, step_name: item.step_name, started_at: new Date().toISOString() })
    setBreakdown(null)
    setScreen("in_progress")

    // Write to DB in the background
    try {
      const res = await fetch(`/api/things/${item.thing_id}/start`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to start")
    } catch (e) {
      // If it fails, show error but stay on in-progress screen
      setActionError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  async function handleDone(stillGoing: boolean) {
    if (!inProgress) return
    setActionError(null)
    setBreakdown(null)

    // Transition immediately
    void refreshOffer()

    // Write to DB in the background
    fetch(`/api/things/${inProgress.thing_id}/done`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ still_going: stillGoing }),
    }).catch((e) => {
      setActionError(e instanceof Error ? e.message : "Something went wrong")
    })
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

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

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

  // ── Offer screen ────────────────────────────────────────────────────────────
  if (screen === "offer") {
    if (offer.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center">
          <p className="text-2xl font-semibold text-[#e8eaf0]">Nothing needs doing right now.</p>
          <p className="text-sm text-[#5a6070] mt-2 mb-6">Come back whenever you want something to do.</p>
          <button type="button" onClick={() => void refreshOffer()} className="text-sm text-[#5a6070] underline">
            Check again
          </button>
        </div>
      )
    }

    return (
      <div className="flex flex-col justify-center min-h-dvh px-6 py-12">
        <div className="w-full max-w-sm mx-auto">
          <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-6 text-center">
            What do you fancy?
          </p>

          {actionError && (
            <p className="text-sm text-red-400 text-center mb-4">{actionError}</p>
          )}

          <div className="flex flex-col gap-3">
            {offer.map((item) => (
              <button
                key={item.thing_id}
                type="button"
                disabled={loadingAction}
                onClick={() => void handleStart(item)}
                className="w-full text-left bg-[#1e2128] border border-[#2c3040] rounded-3xl px-6 py-6 hover:border-[#3a4155] hover:bg-[#22262f] transition-all disabled:opacity-40"
              >
                <p className="text-xl font-medium text-[#e8eaf0] leading-relaxed" style={{ fontFamily: "var(--font-lora)" }}>
                  {item.step_name}
                </p>
                {item.reason && (
                  <p className="text-xs text-[#5a6070] mt-2">{item.reason}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── In-progress + Return screens (shared layout) ────────────────────────────
  const isReturn = screen === "return"
  const thingName = inProgress?.thing_name ?? ""

  return (
    <div className="flex flex-col justify-center min-h-dvh px-6 py-12">
      <div className="w-full max-w-sm mx-auto">

        {/* Heading */}
        <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-4 text-center">
          {isReturn ? "Welcome back" : "You\u2019re doing this"}
        </p>

        {/* Step name */}
        <div className="bg-[#1e2128] border border-[#2c3040] rounded-3xl px-6 py-8 mb-4 text-center">
          {isReturn && (
            <p className="text-sm text-[#5a6070] mb-3">Did you finish?</p>
          )}
          <p className="text-2xl font-semibold text-[#e8eaf0] leading-snug" style={{ fontFamily: "var(--font-lora)" }}>{inProgress?.step_name ?? thingName}</p>
        </div>

        {/* Error */}
        {actionError && (
          <p className="text-sm text-red-400 text-center mb-4">{actionError}</p>
        )}

        {/* Done / Still going buttons */}
        <div className="flex flex-col gap-2 mb-4">
          <button
            type="button"
            disabled={loadingAction}
            onClick={() => void handleDone(false)}
            className="w-full bg-[#e8eaf0] text-[#16181c] rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30"
          >
            {loadingAction ? "Saving…" : "Done"}
          </button>
          <button
            type="button"
            disabled={loadingAction}
            onClick={() => void handleDone(true)}
            className="w-full bg-[#262b35] text-[#9aa0b0] rounded-2xl py-4 text-sm font-semibold hover:bg-[#2c3040] transition-colors disabled:opacity-30"
          >
            Still going
          </button>
        </div>

        {/* Break it down */}
        {!breakdown && (
          <div className="text-center">
            <button
              type="button"
              disabled={loadingBreakdown || loadingAction}
              onClick={() => void handleBreakdown()}
              className="text-sm text-[#5a6070] hover:text-[#9aa0b0] transition-colors disabled:opacity-40 inline-flex items-center gap-2"
            >
              {loadingBreakdown && <Spinner />}
              {loadingBreakdown ? "Thinking…" : "Break it into steps"}
            </button>
          </div>
        )}

        {/* Breakdown result */}
        {breakdown && (
          <div className="mt-2 bg-[#1e2128] border border-[#2c3040] rounded-2xl px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-3">Where to start</p>
            <ol className="flex flex-col gap-2">
              {breakdown.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#9aa0b0]">
                  <span className="text-[#3a4155] flex-shrink-0 w-4">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {breakdownError && (
              <p className="text-xs text-red-400 mt-3">{breakdownError}</p>
            )}
          </div>
        )}

        {breakdownError && !breakdown && (
          <p className="text-xs text-red-400 text-center mt-2">{breakdownError}</p>
        )}
      </div>
    </div>
  )
}
