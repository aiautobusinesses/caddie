"use client"

import { useState } from "react"
import {
  authenticateWithPasskey,
  isPasskeySupported,
  clearCredentialId,
} from "@/lib/passkey"
import { createClient } from "@/lib/supabase/client"

interface Props {
  onSuccess: () => void
  onFallback: () => void
}

export default function BiometricAuth({ onSuccess, onFallback }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isPasskeySupported()) {
    onFallback()
    return null
  }

  async function handleBiometric() {
    setLoading(true)
    setError(null)

    const result = await authenticateWithPasskey()

    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      return
    }

    // Hydrate the Supabase client session from the tokens the server returned
    const supabase = createClient()
    const { error: sessionErr } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    })

    setLoading(false)

    if (sessionErr) {
      setError("Failed to restore session. Please sign in again.")
      return
    }

    onSuccess()
  }

  function handleFallback() {
    clearCredentialId()
    onFallback()
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        <p className="text-xs uppercase tracking-widest text-muted mb-2">
          Caddie
        </p>

        {/* Fingerprint icon */}
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

        {error && (
          <p className="text-sm text-red-400 text-center mb-4">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleBiometric()}
          disabled={loading}
          className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-3"
        >
          {loading ? "Verifying…" : "Use biometrics"}
        </button>

        <button
          type="button"
          onClick={handleFallback}
          className="text-sm text-muted hover:text-subtle transition-colors"
        >
          Sign in with email instead
        </button>
      </div>
    </div>
  )
}
