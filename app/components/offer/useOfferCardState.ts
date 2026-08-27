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
  const [pendingItem, setPendingItem] = useState<OfferItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
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

  async function commitStart(item: OfferItem) {
    const prevInProgress = inProgress
    const prevScreen = screen

    setInProgress({
      thing_id: item.thing_id,
      thing_name: item.thing_name,
      step_name: item.step_name,
      started_at: new Date().toISOString(),
    })
    setActionError(null)
    setJustStarted(true)
    setScreen("focus")

    try {
      const res = await fetch(`/api/things/${item.thing_id}/start`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to start")
    } catch (e) {
      setInProgress(prevInProgress)
      setScreen(prevScreen)
      setActionError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  async function handleStart(item: OfferItem) {
    if (item.needs_know_how) {
      setPendingItem(item)
      setScreen("familiarity")
    } else {
      await commitStart(item)
    }
  }

  async function handleFamiliarityYes() {
    if (!pendingItem) return
    const item = pendingItem
    setPendingItem(null)
    await commitStart(item)
  }

  async function handleFamiliarityNo() {
    if (!pendingItem) return
    const item = pendingItem
    setPendingItem(null)

    // Prepend a lookup step via the API, then proceed to start the thing.
    // The API handles inserting the new step and advancing live_step_id.
    try {
      await fetch(`/api/things/${item.thing_id}/prepend-lookup`, { method: "POST" })
    } catch {
      // Non-fatal: still start, just without the prepended step
    }
    await commitStart({ ...item, step_name: `Look up how to: ${item.step_name}`, needs_know_how: false })
  }

  async function handleDone(stillGoing: boolean) {
    if (!inProgress) return
    setActionError(null)

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
    const results = await Promise.allSettled(
      items.map((item) =>
        fetch(`/api/steps/${item.step_id}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: "skipped" }),
        })
      )
    )
    const anyFailed = results.some((r) => r.status === "rejected")
    if (anyFailed) setActionError("Some items couldn't be skipped")
    void refreshOffer()
  }

  return {
    screen,
    setScreen,
    offer,
    careGroup,
    inProgress,
    pendingItem,
    refreshing,
    fetchError,
    actionError,
    thingComplete,
    setThingComplete,
    justStarted,
    refreshOffer,
    handleStart,
    handleFamiliarityYes,
    handleFamiliarityNo,
    handleDone,
    handleSkipAll,
    handleSaveName,
    handleAbandon,
  }
}
