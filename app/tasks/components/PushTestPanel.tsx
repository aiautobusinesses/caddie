"use client"

import { useState } from "react"
import {
  getNotificationPermission,
  isPushSupported,
  requestPushPermission,
  showLocalTestNotification,
} from "@/lib/push"

export default function PushTestPanel() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supported = isPushSupported()
  const permission = getNotificationPermission()

  async function handleEnablePush() {
    setBusy(true)
    setMessage(null)
    setError(null)

    const ok = await requestPushPermission()
    setBusy(false)

    if (ok) {
      setMessage("Push enabled — subscription saved. You can send a test next.")
      return
    }

    setError(
      "Could not enable push. Check NEXT_PUBLIC_VAPID_PUBLIC_KEY and try again.",
    )
  }

  async function handleTestNotification() {
    setBusy(true)
    setMessage(null)
    setError(null)

    const result = await showLocalTestNotification()
    setBusy(false)

    if (result.ok) {
      setMessage("Test notification sent — check your system tray or OS banner.")
      return
    }

    setError(result.error ?? "Test notification failed.")
  }

  if (!supported) {
    return (
      <section className="mt-12 pt-8 border-t border-gray-100">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2">
          Notifications
        </p>
        <p className="text-sm text-gray-500">
          Push is not supported in this browser. Try Chrome or Edge on desktop,
          or install the app to your home screen on mobile.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-12 pt-8 border-t border-gray-100">
      <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2">
        Notifications
      </p>
      <p className="text-sm text-gray-500 mb-4">
        Permission:{" "}
        <span className="font-medium text-gray-700">
          {permission ?? "unknown"}
        </span>
        . Scheduled reminders use the Supabase{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">notify</code> job;
        this button only tests your device and service worker.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        {permission !== "granted" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleEnablePush()}
            className="flex-1 bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
          >
            Enable push
          </button>
        )}
        <button
          type="button"
          disabled={busy || permission === "denied"}
          onClick={() => void handleTestNotification()}
          className="flex-1 bg-gray-100 text-gray-800 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
        >
          Send test notification
        </button>
      </div>

      {permission === "denied" && (
        <p className="text-sm text-amber-700 mt-3">
          Notifications are blocked. Allow them in your browser site settings,
          then reload.
        </p>
      )}

      {message && <p className="text-sm text-green-700 mt-3">{message}</p>}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
    </section>
  )
}
