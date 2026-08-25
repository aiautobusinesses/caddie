"use client"

import { useCallback, useEffect, useState } from "react"
import type { CareGroupOffer, InProgressThing, OfferItem } from "@/lib/offer"
import { TASKS_UPDATED_EVENT } from "@/lib/capture"
import type { OfferCardProps, Screen } from "./types"

export function useOfferCardState({ initialOffer, initialInProgress, initialCareGroup }: OfferCardProps) {
  const [screen, setScreen] = useState<Screen>(initialInProgress ? "focus" : "offer")
  const [offer, setOffer] = useState<OfferItem[]>(initialOffer)
  const [careGroup, setCareGroup] = useState<CareGroupOffer | null>(initialCareGroup)
  const [inProgress, setInProgress] = useState<InProgressThing | null>(initialInProgress)
  const [breakdown, setBreakdown] = useState<string[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)
  const [peekBreakdown, setPeekBreakdown] = useState<Record<string, string[]>>({})
  const [peekLoading, setPeekLoading] = useState<Record<string, boolean>>({})
  const [thingComplete, setThingComplete] = useState<{ name: string } | null>(null)
  const [justStarted, setJustStarted] = useState(false)

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
        setCareGroup(null)
        setJustStarted(false)
        setScreen("focus")
      } else {
        setInProgress(null)
        setOffer(data.offer ?? [])
        setCareGroup((data.care_group as CareGroupOffer | null) ?? null)
        setScreen("offer")
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const handler = () => void refreshOffer()
    window.addEventListener(TASKS_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TASKS_UPDATED_EVENT, handler)
  }, [refreshOffer])

  async function handleStart(item: OfferItem) {
    setInProgress({
      thing_id: item.thing_id,
      thing_name: item.thing_name,
      step_name: item.step_name,
      started_at: new Date().toISOString(),
    })
    setBreakdown(null)
    setActionError(null)
    setJustStarted(true)
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

    try {
      const res = await fetch(`/api/things/${inProgress.thing_id}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ still_going: stillGoing }),
      })
      const data = await res.json()
      if (!stillGoing && data.thing_complete && data.thing_name) {
        setThingComplete({ name: data.thing_name as string })
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

  async function handleSaveName(newName: string) {
    if (!inProgress) return
    const trimmed = newName.trim()
    if (!trimmed) return
    const previous = inProgress.thing_name
    setInProgress((prev) => (prev ? { ...prev, thing_name: trimmed } : prev))
    try {
      const res = await fetch(`/api/things/${inProgress.thing_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setInProgress((prev) => (prev ? { ...prev, thing_name: previous } : prev))
      setActionError("Couldn't save the name change")
    }
  }

  async function handleAbandon() {
    if (!inProgress) return
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

  async function handleSkipAll(items: OfferItem[]) {
    await Promise.all(
      items.map((item) =>
        fetch(`/api/steps/${item.step_id}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: "skipped" }),
        })
      )
    )
    void refreshOffer()
  }

  async function handlePeek(thingId: string) {
    if (peekBreakdown[thingId] || peekLoading[thingId]) return
    setPeekLoading((prev) => ({ ...prev, [thingId]: true }))
    try {
      const res = await fetch(`/api/things/${thingId}/breakdown`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setPeekBreakdown((prev) => ({ ...prev, [thingId]: (data.steps as string[]).slice(0, 2) }))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setPeekLoading((prev) => ({ ...prev, [thingId]: false }))
    }
  }

  return {
    screen,
    setScreen,
    offer,
    careGroup,
    inProgress,
    breakdown,
    refreshing,
    loadingBreakdown,
    fetchError,
    actionError,
    breakdownError,
    peekBreakdown,
    peekLoading,
    thingComplete,
    setThingComplete,
    justStarted,
    refreshOffer,
    handleStart,
    handleDone,
    handleBreakdown,
    handleSkipAll,
    handleSaveName,
    handleAbandon,
    handlePeek,
  }
}
