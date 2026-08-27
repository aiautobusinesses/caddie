"use client"

import { useEffect } from "react"

/**
 * Syncs the visible viewport height to a CSS custom property `--visual-vh`
 * so layouts can use `calc(var(--visual-vh, 1vh) * 100)` instead of `100dvh`
 * to correctly avoid the on-screen keyboard on Android Chrome.
 *
 * Uses the `visualViewport` API when available (Chrome 61+), with a
 * resize observer fallback.
 */
export function useKeyboardAvoidance() {
  useEffect(() => {
    function update() {
      const vh = window.visualViewport
        ? window.visualViewport.height / 100
        : window.innerHeight / 100
      document.documentElement.style.setProperty("--visual-vh", `${vh}px`)

      // Also track offset for anchored bottom elements
      const offsetTop = window.visualViewport?.offsetTop ?? 0
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${offsetTop}px`,
      )
    }

    update()

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", update)
      window.visualViewport.addEventListener("scroll", update)
      return () => {
        window.visualViewport?.removeEventListener("resize", update)
        window.visualViewport?.removeEventListener("scroll", update)
      }
    }

    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
}
