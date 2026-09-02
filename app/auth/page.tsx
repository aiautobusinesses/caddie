"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  getStoredCredentialId,
  isPasskeySupported,
  authenticateWithPasskey,
  clearCredentialId,
} from "@/lib/passkey"
import { recordActivity } from "@/lib/idle-session"

type View = "checking" | "biometric" | "email"

export default function AuthPage() {
  const router = useRouter()
  const [view, setView] = useState<View>("checking")

  // If the user already has a valid session, send them straight to the app.
  useEffect(() => {
    void createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/")
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Email form state
  const [email, setEmail] = useState("")
  const [emailLoading, setEmailLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Biometric state
  const [bioLoading, setBioLoading] = useState(false)
  const [bioError, setBioError] = useState<string | null>(null)

  // On mount: check whether a passkey is enrolled → show biometric view.
  // Deferred via setTimeout to avoid setState-in-effect lint warning.
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    const next = isPasskeySupported() && getStoredCredentialId() ? "biometric" : "email"
    const id = setTimeout(() => setView(next), 0)
    return () => clearTimeout(id)
  }, [])

  // ── Biometric sign-in ─────────────────────────────────────────────────────
  async function handleBiometric() {
    setBioLoading(true)
    setBioError(null)

    const result = await authenticateWithPasskey()

    if (!result.ok) {
      setBioLoading(false)
      setBioError(result.error)
      return
    }

    const supabase = createClient()
    const { error: sessionErr } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    })

    setBioLoading(false)

    if (sessionErr) {
      setBioError("Failed to restore session. Please sign in with email.")
      return
    }

    recordActivity()
    router.replace("/")
  }

  function handleFallbackToEmail() {
    // Don't clear the credential — user may just want to use email this once.
    // They can re-enroll next time they sign in.
    setView("email")
  }

  function handleForgetPasskey() {
    clearCredentialId()
    setView("email")
  }

  // ── Email / magic link sign-in ────────────────────────────────────────────
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setEmailLoading(true)
    setMessage(null)
    setEmailError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    setEmailLoading(false)

    if (signInError) {
      setEmailError(signInError.message)
      return
    }

    setMessage("Check your email for a sign-in link.")
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === "checking") return null

  if (view === "biometric") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <p className="text-xs uppercase tracking-widest text-muted mb-2">
            Caddie
          </p>

          <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-fg"
            >
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
              <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
              <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
              <path d="M2 12a10 10 0 0 1 18-6" />
              <path d="M2 17c1 .5 2.03 1 3 1 1 0 1.5-.5 2-1s1-1 2-1 1.5.5 2 1" />
              <path d="M20 12c0 1.01-.08 2.06-.23 3" />
              <path d="M6 10a6 6 0 0 1 11.9-.68" />
              <path d="M8.66 13.21c-.1.56-.16 1.18-.16 1.79" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-fg text-center mb-2">
            Welcome back
          </h1>
          <p className="text-sm text-muted text-center mb-8">
            Use your biometrics to sign back in
          </p>

          {bioError && (
            <p className="text-sm text-red-400 text-center mb-4">{bioError}</p>
          )}

          <button
            type="button"
            onClick={() => void handleBiometric()}
            disabled={bioLoading}
            className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-3"
          >
            {bioLoading ? "Verifying…" : "Use biometrics"}
          </button>

          <button
            type="button"
            onClick={handleFallbackToEmail}
            className="text-sm text-muted hover:text-subtle transition-colors mb-2"
          >
            Sign in with email instead
          </button>

          <button
            type="button"
            onClick={handleForgetPasskey}
            className="text-xs text-dim hover:text-muted transition-colors"
          >
            Sign in on a different account
          </button>
        </div>
      </div>
    )
  }

  // view === "email"
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-muted mb-2 text-center">
          Caddie
        </p>
        <h1 className="text-2xl font-semibold text-fg text-center mb-2">
          Sign in
        </h1>
        <p className="text-sm text-muted text-center mb-8">
          We&apos;ll email you a magic link — no password needed.
        </p>

        <form onSubmit={(e) => void handleEmailSubmit(e)} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full bg-surface border border-border rounded-3xl px-5 py-4 text-sm text-fg placeholder-dim focus:outline-none focus:border-muted transition-colors"
          />
          {emailError && (
            <p className="text-sm text-red-400 text-center">{emailError}</p>
          )}
          {message && (
            <p className="text-sm text-subtle text-center">{message}</p>
          )}
          <button
            type="submit"
            disabled={emailLoading || !email.trim()}
            className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {emailLoading ? "Sending…" : "Send magic link"}
          </button>
        </form>

        {isPasskeySupported() && getStoredCredentialId() && (
          <button
            type="button"
            onClick={() => setView("biometric")}
            className="w-full text-sm text-muted hover:text-subtle transition-colors mt-4 text-center"
          >
            ← Back to biometric sign-in
          </button>
        )}
      </div>
    </div>
  )
}
