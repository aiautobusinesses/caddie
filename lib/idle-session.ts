"use client"

import { useEffect, useRef, useCallback } from "react"

const LAST_ACTIVE_KEY = "caddie:last-active"

/** How long (ms) the app can be idle before triggering a lock. Default: 30 min */
const DEFAULT_IDLE_MS = 30 * 60 * 1000

/** Touch/click/key events that count as "activity" */
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "pointerdown",
  "scroll",
  "focus",
] as const

type ActivityEvent = (typeof ACTIVITY_EVENTS)[number]

export function recordActivity() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
  } catch {
    // storage blocked
  }
}

export function getLastActive(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY)
    // No record means the user just signed in — treat as active now so the
    // idle lock doesn't fire immediately on first load.
    return raw ? parseInt(raw, 10) : Date.now()
  } catch {
    return Date.now()
  }
}

export function isSessionExpired(idleMs = DEFAULT_IDLE_MS): boolean {
  return Date.now() - getLastActive() > idleMs
}

interface UseIdleSessionOptions {
  /** Milliseconds of inactivity before onExpire fires. Default 30 min. */
  idleMs?: number
  /** Called when the idle threshold is crossed. */
  onExpire: () => void
  /** Whether to track activity (set false on auth/lock screens). */
  enabled?: boolean
}

/**
 * Tracks user activity and calls onExpire when the idle threshold is exceeded.
 * Also fires immediately on mount if the session was already expired
 * (e.g. user reopens the app after a long break).
 */
export function useIdleSession({
  idleMs = DEFAULT_IDLE_MS,
  onExpire,
  enabled = true,
}: UseIdleSessionOptions) {
  const onExpireRef = useRef(onExpire)

  // Keep the ref in sync without reading/writing it during render
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetTimer = useCallback(() => {
    recordActivity()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onExpireRef.current()
    }, idleMs)
  }, [idleMs])

  useEffect(() => {
    if (!enabled) return

    // Check immediately — handles reopening after background
    if (isSessionExpired(idleMs)) {
      onExpireRef.current()
      return
    }

    // Start timer for remaining idle time
    const remaining = idleMs - (Date.now() - getLastActive())
    timerRef.current = setTimeout(() => {
      onExpireRef.current()
    }, Math.max(0, remaining))

    const handleActivity = () => resetTimer()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event as ActivityEvent, handleActivity, {
        passive: true,
      })
    }

    // Also reset when the page becomes visible again
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (isSessionExpired(idleMs)) {
          onExpireRef.current()
        } else {
          resetTimer()
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event as ActivityEvent, handleActivity)
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, idleMs, resetTimer])
}
