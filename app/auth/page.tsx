"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function AuthPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setLoading(true)
    setMessage(null)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    setMessage("Check your email for a sign-in link.")
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-[#5a6070] mb-2 text-center">
          Caddie
        </p>
        <h1 className="text-2xl font-semibold text-[#e8eaf0] text-center mb-2">
          Sign in
        </h1>
        <p className="text-sm text-[#5a6070] text-center mb-8">
          We&apos;ll email you a magic link — no password needed.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full bg-[#1e2128] border border-[#2c3040] rounded-3xl px-5 py-4 text-sm text-[#e8eaf0] placeholder-[#3a4155] focus:outline-none focus:border-[#5a6070] transition-colors"
          />
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
          {message && (
            <p className="text-sm text-[#9aa0b0] text-center">{message}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-[#e8eaf0] text-[#16181c] rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  )
}
