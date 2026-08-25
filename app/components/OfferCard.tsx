"use client"

import { useCapture } from "./capture/CaptureContext"
import Spinner from "./Spinner"
import { useOfferCardState } from "./offer/useOfferCardState"
import OfferScreen from "./offer/OfferScreen"
import FocusScreen from "./offer/FocusScreen"
import SettingsScreen from "./offer/SettingsScreen"
import type { OfferCardProps } from "./offer/types"

export default function OfferCard({ initialOffer, initialInProgress, initialCareGroup }: OfferCardProps) {
  const { openCapture } = useCapture()
  const state = useOfferCardState({ initialOffer, initialInProgress, initialCareGroup })

  const {
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
    editingName,
    setEditingName,
    editedName,
    setEditedName,
    confirmingAbandon,
    setConfirmingAbandon,
    justStarted,
    refreshOffer,
    handleStart,
    handleDone,
    handleBreakdown,
    handleSaveName,
    handleAbandon,
    handlePeek,
  } = state

  if (thingComplete) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh px-6 text-center cursor-pointer"
        onClick={() => {
          setThingComplete(null)
          void refreshOffer()
        }}
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

  return (
    <div className="flex flex-col min-h-dvh bg-[#16181c]">
      <div className="flex-1 flex flex-col min-h-0">
        {screen === "offer" && (
          <OfferScreen
            offer={offer}
            careGroup={careGroup}
            actionError={actionError}
            peekBreakdown={peekBreakdown}
            peekLoading={peekLoading}
            onStart={(item) => void handleStart(item)}
            onSkipAll={() => {
              offer.forEach((item) => {
                void fetch(`/api/steps/${item.step_id}/event`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ event_type: "skipped" }),
                })
              })
              void refreshOffer()
            }}
            onPeek={(thingId) => void handlePeek(thingId)}
            onCapture={openCapture}
            onRefresh={() => void refreshOffer()}
          />
        )}

        {screen === "focus" && inProgress && (
          <FocusScreen
            inProgress={inProgress}
            breakdown={breakdown}
            loadingBreakdown={loadingBreakdown}
            breakdownError={breakdownError}
            actionError={actionError}
            editingName={editingName}
            editedName={editedName}
            confirmingAbandon={confirmingAbandon}
            justStarted={justStarted}
            onDone={(stillGoing) => void handleDone(stillGoing)}
            onBreakdown={() => void handleBreakdown()}
            onSetEditingName={setEditingName}
            onSetEditedName={setEditedName}
            onSaveName={() => void handleSaveName()}
            onSetConfirmingAbandon={setConfirmingAbandon}
            onAbandon={() => void handleAbandon()}
          />
        )}

        {screen === "settings" && <SettingsScreen />}
      </div>

      <div className="flex-none flex border-t-2 border-[#2c3040] bg-[#16181c]">
        <button
          type="button"
          onClick={() => {
            if (screen === "settings") void refreshOffer()
          }}
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
          Settings
        </button>
      </div>
    </div>
  )
}
