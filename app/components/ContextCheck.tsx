"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { isPushSupported, requestPushPermission } from "@/lib/push"

type Energy = "sharp" | "steady" | "easy"
type TimeAvailable = "15" | "30" | "unlimited"

export default function ContextCheck() {
  const router = useRouter()
  const [energy, setEnergy] = useState<Energy | null>(null)
  const [time, setTime] = useState<TimeAvailable | null>(null)

  function handleConfirm() {
    if (!energy || !time) return
    sessionStorage.setItem("caddie_energy", energy)
    sessionStorage.setItem("caddie_time", time)

    if (
      isPushSupported() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void requestPushPermission()
    }

    router.push("/?ready=1")
  }

  const energyOptions: { value: Energy; label: string }[] = [
    { value: "sharp", label: "Sharp" },
    { value: "steady", label: "Steady" },
    { value: "easy", label: "Easy only" },
  ]

  const timeOptions: { value: TimeAvailable; label: string }[] = [
    { value: "15", label: "15 mins" },
    { value: "30", label: "30 mins" },
    { value: "unlimited", label: "No rush" },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-8 text-center">
          Caddie
        </p>

        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-3">How are you feeling?</p>
          <div className="flex gap-2">
            {energyOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setEnergy(o.value)}
                className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-colors ${
                  energy === o.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-10">
          <p className="text-sm text-gray-500 mb-3">How long have you got?</p>
          <div className="flex gap-2">
            {timeOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setTime(o.value)}
                className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-colors ${
                  time === o.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!energy || !time}
          onClick={handleConfirm}
          className="w-full bg-gray-900 text-white rounded-2xl py-4 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}
