"use client"

import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISSED_KEY = "caddie:install-dismissed"

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already running as installed PWA or already dismissed
    if (window.matchMedia("(display-mode: standalone)").matches) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return

    function handler(e: Event) {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1")
    setVisible(false)
  }

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === "accepted") {
      setVisible(false)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="m-3 bg-surface border border-border rounded-2xl px-5 py-4 flex items-center gap-4 shadow-xl">
        {/* App icon */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          className="w-12 h-12 rounded-xl flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg leading-tight">
            Add Caddie to your home screen
          </p>
          <p className="text-xs text-muted mt-0.5 leading-tight">
            Get the full app experience
          </p>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => void install()}
            className="bg-fg text-bg text-xs font-semibold rounded-xl px-4 py-2 hover:bg-white transition-colors"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-muted text-xs text-center hover:text-subtle transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
