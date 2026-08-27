"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function SetupPage() {
  const router = useRouter()
  const [key, setKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    const res = await fetch("/api/ai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: trimmed }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === "string" ? data.error : "Something went wrong.")
      return
    }

    router.refresh()
    router.push("/")
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-muted mb-2 text-center">
          Caddie
        </p>
        <h1 className="text-2xl font-semibold text-fg text-center mb-2">
          Connect your AI
        </h1>
        <p className="text-sm text-muted text-center mb-8">
          Caddie uses your own Anthropic API key for all AI-powered features.
          Your key is stored securely and never shared.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-api03-…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            className="w-full bg-surface border border-border rounded-3xl px-5 py-4 text-sm text-fg placeholder-dim focus:outline-none focus:border-muted transition-colors font-mono"
          />
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying…" : "Save API key"}
          </button>
        </form>

        <p className="text-xs text-muted text-center mt-6 leading-relaxed">
          You can get a key from{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-subtle transition-colors"
          >
            console.anthropic.com
          </a>
          . Usage is charged to your account directly.
        </p>
      </div>
    </div>
  )
}
