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
  // The step_id to annotate with a stop note — kept across the still-going → stop_note transition.
  const [stopNoteStepId, setStopNoteStepId] = useState<string | null>(null)

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
      step_id: item.step_id,
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
    // Record the accepted event so needs_know_how is cleared server-side and the
    // familiarity question never fires again for this step. Fire-and-forget: a
    // write failure must not block the user from starting.
    void fetch(`/api/steps/${item.step_id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "accepted" }),
    })
    await commitStart(item)
  }

  async function handleFamiliarityNo() {
    if (!pendingItem) return
    const item = pendingItem
    setPendingItem(null)

    // Prepend a lookup step via the API, then proceed to start the thing.
    // The API advances live_step_id to the new step and returns its id.
    // Use that id as step_id so stop events annotate the correct step.
    let lookupStepId: string = item.step_id
    try {
      const res = await fetch(`/api/things/${item.thing_id}/prepend-lookup`, { method: "POST" })
      if (res.ok) {
        const data = await res.json() as { step_id?: string }
        if (typeof data.step_id === "string") lookupStepId = data.step_id
      }
    } catch {
      // Non-fatal: still start, just without the prepended step
    }
    await commitStart({ ...item, step_id: lookupStepId, step_name: `Look up how to: ${item.step_name}`, needs_know_how: false })
  }

  /**
   * Handle Done / Still Going.
   *
   * When stillGoing is true:
   *   1. Call the still-going route to clear `started_at` — it also writes the
   *      `stopped` event server-side (markThingStillGoing). No second write here.
   *   2. Transition to the `stop_note` screen — the user can annotate or skip.
   */
  async function handleDone(stillGoing: boolean) {
    if (!inProgress) return
    setActionError(null)

    if (stillGoing) {
      const stepId = inProgress.step_id

      // Await the still-going call: it clears started_at and writes the stopped event.
      // If it fails, stay on the focus screen and surface the error rather than moving
      // to stop_note with the thing still in-progress in the DB.
      try {
        const res = await fetch(`/api/things/${inProgress.thing_id}/done`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ still_going: true }),
        })
        if (!res.ok) throw new Error("Failed to stop")
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Something went wrong")
        return
      }

      // DB now has started_at = null — mirror that in local state so the focus
      // screen is not re-rendered for a thing the server no longer considers active
      // if refreshOffer() is delayed or fails.
      setInProgress(null)
      setStopNoteStepId(stepId)
      setScreen("stop_note")
      return
    }

    try {
      const res = await fetch(`/api/things/${inProgress.thing_id}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ still_going: false }),
      })
      const data = await res.json()
      if (data.thing_complete && data.thing_name) {
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

  /**
   * Called from StopNoteScreen when the user saves a note/photo or skips.
   * If content is provided, record a `stop_note` event with the annotation.
   * The `stopped` event was already written server-side by markThingStillGoing,
   * so this is a distinct annotation record — not a second session marker.
   */
  async function handleStopNote(note: string | null, photoFile: File | null) {
    const stepId = stopNoteStepId
    setStopNoteStepId(null)

    // TODO: photo upload not yet implemented. The design relies on the photo as an
    // environmental position marker (strongest resumption cue). Implement by uploading
    // photoFile to Supabase Storage and storing the resulting URL in metadata.
    // Until then, the photo is silently dropped — a local File.name is meaningless
    // once the session ends and must not be recorded as if it were a usable cue.
    const hasNote = note && note.length > 0
    if (hasNote && stepId) {
      void fetch(`/api/steps/${stepId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "stop_note",
          metadata: { note },
        }),
      })
    }

    void refreshOffer()
  }

  async function handleStopNoteSkip() {
    setStopNoteStepId(null)
    void refreshOffer()
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
    handleStopNote,
    handleStopNoteSkip,
    handleSkipAll,
    handleSaveName,
    handleAbandon,
  }
}
