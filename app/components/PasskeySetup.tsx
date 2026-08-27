"use client"

import { useState } from "react"
import { isPasskeySupported, registerPasskey } from "@/lib/passkey"

interface Props {
  onDone: () => void
  onSkip: () => void
}

export default function PasskeySetup({ onDone, onSkip }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isPasskeySupported()) return null

  async function handleRegister() {
    setLoading(true)
    setError(null)
    const result = await registerPasskey()
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-black/60">
      <div className="bg-bg border-t border-border rounded-t-3xl w-full px-6 py-8 max-w-md mx-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6" />

        {/* Fingerprint icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
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
        </div>

        <h2 className="text-xl font-bold text-fg text-center mb-2">
          Enable biometric login
        </h2>
        <p className="text-sm text-muted text-center mb-6 leading-relaxed">
          Use your fingerprint or face to sign in instantly next time — no email
          link needed.
        </p>

        {error && (
          <p className="text-sm text-red-400 text-center mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleRegister()}
            disabled={loading}
            className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Setting up…" : "Set up biometrics"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-muted text-sm py-2 hover:text-subtle transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
