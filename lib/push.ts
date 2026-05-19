"use client"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null

  return navigator.serviceWorker.register("/sw.js")
}

export function getNotificationPermission(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null
  }
  return Notification.permission
}

/** Shows a notification via the registered service worker (this device only). */
export async function showLocalTestNotification(): Promise<{
  ok: boolean
  error?: string
}> {
  if (!isPushSupported()) {
    return { ok: false, error: "Push is not supported in this browser." }
  }

  let permission = Notification.permission
  if (permission === "default") {
    permission = await Notification.requestPermission()
  }

  if (permission !== "granted") {
    return { ok: false, error: "Notification permission was not granted." }
  }

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await registerServiceWorker())

    if (!registration) {
      return { ok: false, error: "Service worker is not registered." }
    }

    await navigator.serviceWorker.ready

    await registration.showNotification("Caddie test", {
      body: "If you see this, notifications are set up on this device.",
      tag: "caddie-test",
    })

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not show notification",
    }
  }
}

/** Registers push subscription with the server (same as the context-check flow). */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return false

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return false

  const registration = await registerServiceWorker()
  if (!registration) return false

  await navigator.serviceWorker.ready

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  })

  return res.ok
}
