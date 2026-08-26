"use client"

import { useCapture } from "./capture/CaptureContext"
import Spinner from "./Spinner"
import { useOfferCardState } from "./offer/useOfferCardState"
import OfferScreen from "./offer/OfferScreen"
import FocusScreen from "./offer/FocusScreen"
import FamiliarityScreen from "./offer/FamiliarityScreen"
import SettingsScreen from "./offer/SettingsScreen"
import type { OfferCardProps } from "./offer/types"

export default function OfferCard({ initialOffer, initialInProgress, initialCareGroup }: OfferCardProps) {
  const { openCapture } = useCapture()
  const {
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
  } = useOfferCardState({ initialOffer, initialInProgress, initialCareGroup })

  if (thingComplete) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh px-6 text-center cursor-pointer"
        onClick={() => {
          setThingComplete(null)
          void refreshOffer()
        }}
      >
        <p className="text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-fg">
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
        <button type="button" onClick={() => void refreshOffer()} className="text-sm text-muted underline">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh bg-bg">
      <div className="flex-1 flex flex-col min-h-0">
        {screen === "offer" && (
          <OfferScreen
            offer={offer}
            careGroup={careGroup}
            actionError={actionError}
            onStart={(item) => void handleStart(item)}
            onSkipAll={() => void handleSkipAll(offer)}
            onCapture={openCapture}
            onRefresh={() => void refreshOffer()}
          />
        )}

        {screen === "familiarity" && pendingItem && (
          <FamiliarityScreen
            item={pendingItem}
            onYes={() => void handleFamiliarityYes()}
            onNo={() => void handleFamiliarityNo()}
          />
        )}

        {screen === "focus" && inProgress && (
          <FocusScreen
            inProgress={inProgress}
            actionError={actionError}
            justStarted={justStarted}
            onDone={(stillGoing) => void handleDone(stillGoing)}
            onSaveName={(newName) => void handleSaveName(newName)}
            onAbandon={() => void handleAbandon()}
          />
        )}

        {screen === "settings" && <SettingsScreen />}
      </div>

      <div className="flex-none flex border-t-2 border-border bg-bg">
        <button
          type="button"
          onClick={() => {
            if (screen === "settings") void refreshOffer()
          }}
          className={`flex-1 text-left px-5 py-3.5 pb-[22px] text-xs font-bold uppercase tracking-[0.08em] border-r-2 border-border transition-colors hover:bg-surface ${screen !== "settings" ? "text-fg" : "text-muted"}`}
        >
          Now
        </button>
        <button
          type="button"
          onClick={() => setScreen("settings")}
          className={`flex-1 text-left px-5 py-3.5 pb-[22px] text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:bg-surface ${screen === "settings" ? "text-fg" : "text-muted"}`}
        >
          Settings
        </button>
      </div>
    </div>
  )
}
