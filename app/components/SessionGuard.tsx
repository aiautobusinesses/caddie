"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  useIdleSession,
  recordActivity,
} from "@/lib/idle-session"
import {
  getStoredCredentialId,
  isPasskeySupported,
} from "@/lib/passkey"
import BiometricAuth from "./BiometricAuth"
import PasskeySetup from "./PasskeySetup"

type OverlayState =
  | "none"
  | "biometric-reauth"
  | "passkey-setup"

const PASSKEY_OFFERED_KEY = "caddie:passkey-offered"

/** How long (ms) before idle lock kicks in — 30 minutes */
const IDLE_MS = 30 * 60 * 1000

interface Props {
  children: React.ReactNode
}

export default function SessionGuard({ children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [overlay, setOverlay] = useState<OverlayState>("none")
  const offerChecked = useRef(false)

  const isAuthRoute =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/lifewalk") ||
    pathname.startsWith("/setup")

  // ── Offer passkey setup after a fresh sign-in ─────────────────────────────
  // Use a scheduler-deferred setState so it doesn't fire synchronously inside
  // the effect body (avoids the react-hooks/set-state-in-effect lint rule and
  // prevents cascading renders).
  useEffect(() => {
    if (isAuthRoute || offerChecked.current) return
    offerChecked.current = true
    if (!isPasskeySupported()) return
    if (getStoredCredentialId()) return
    if (sessionStorage.getItem(PASSKEY_OFFERED_KEY)) return

    sessionStorage.setItem(PASSKEY_OFFERED_KEY, "1")
    // Schedule outside the synchronous effect body
    const id = setTimeout(() => setOverlay("passkey-setup"), 0)
    return () => clearTimeout(id)
  }, [isAuthRoute])

  // ── Idle session expiry → biometric re-auth or sign-out ───────────────────
  const handleExpire = useCallback(() => {
    if (isAuthRoute) return

    if (isPasskeySupported() && getStoredCredentialId()) {
      setOverlay("biometric-reauth")
    } else {
      // No passkey enrolled — sign out and redirect
      void createClient()
        .auth.signOut()
        .then(() => router.push("/auth"))
    }
  }, [isAuthRoute, router])

  useIdleSession({
    idleMs: IDLE_MS,
    onExpire: handleExpire,
    enabled: !isAuthRoute && overlay === "none",
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleBiometricSuccess() {
    recordActivity()
    setOverlay("none")
  }

  function handleBiometricFallback() {
    void createClient()
      .auth.signOut()
      .then(() => router.push("/auth"))
  }

  function handlePasskeySetupDone() {
    setOverlay("none")
  }

  function handlePasskeySetupSkip() {
    setOverlay("none")
  }

  return (
    <>
      {children}

      {overlay === "biometric-reauth" && (
        <BiometricAuth
          onSuccess={handleBiometricSuccess}
          onFallback={handleBiometricFallback}
        />
      )}

      {overlay === "passkey-setup" && !isAuthRoute && (
        <PasskeySetup
          onDone={handlePasskeySetupDone}
          onSkip={handlePasskeySetupSkip}
        />
      )}
    </>
  )
}
