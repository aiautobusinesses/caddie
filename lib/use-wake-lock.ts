"use client"

import { useEffect, useRef } from "react"

/**
 * Acquires a screen wake lock while `active` is true, releasing it when
 * `active` becomes false or the component unmounts.
 *
 * Re-acquires the lock automatically when the page becomes visible again
 * after being backgrounded (Android Chrome releases locks on page hide).
 *
 * @example
 *   // Keep screen on while capture modal is open
 *   useWakeLock(isOpen)
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) {
      void lockRef.current?.release()
      lockRef.current = null
      return
    }

    if (!("wakeLock" in navigator)) return

    let cancelled = false

    async function acquire() {
      try {
        if (cancelled) return
        lockRef.current = await navigator.wakeLock.request("screen")
      } catch {
        // Denied (battery saver, etc.) — silently ignore
      }
    }

    void acquire()

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && active) {
        void acquire()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      void lockRef.current?.release()
      lockRef.current = null
    }
  }, [active])
}
