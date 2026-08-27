"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

type IntegrationRecord = {
  id: string
  provider: string
  token: string
  label: string | null
  created_at: string
}

type AiKeyState = "unknown" | "configured" | "missing"

export default function SettingsScreen() {
  const router = useRouter()
  const [aiKeyState, setAiKeyState] = useState<AiKeyState>("unknown")
  const [aiKeyInput, setAiKeyInput] = useState("")
  const [aiKeySaving, setAiKeySaving] = useState(false)
  const [aiKeyError, setAiKeyError] = useState<string | null>(null)
  const [aiKeyMessage, setAiKeyMessage] = useState<string | null>(null)

  const [isAdvanced, setIsAdvanced] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([])
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  const [newProvider, setNewProvider] = useState("home_assistant")
  const [newLabel, setNewLabel] = useState("")
  const [integrationsError, setIntegrationsError] = useState<string | null>(null)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null)

  const loadIntegrations = useCallback(async () => {
    setIntegrationsLoading(true)
    try {
      const res = await fetch("/api/integrations")
      if (res.ok) {
        const data = await res.json() as { integrations: IntegrationRecord[] }
        setIntegrations(data.integrations)
      }
    } finally {
      setIntegrationsLoading(false)
    }
  }, [])

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/account")
      if (!res.ok) return
      const data = await res.json() as { ai_configured: boolean; account_tier: string }
      setAiKeyState(data.ai_configured ? "configured" : "missing")
      if (data.account_tier === "advanced") {
        setIsAdvanced(true)
        void loadIntegrations()
      }
    } catch {
      // Non-critical — UI degrades gracefully
    }
  }, [loadIntegrations])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProfile() }, [loadProfile])

  async function handleSaveAiKey(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = aiKeyInput.trim()
    if (!trimmed) return

    setAiKeySaving(true)
    setAiKeyError(null)
    setAiKeyMessage(null)

    const res = await fetch("/api/ai-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: trimmed }),
    })

    setAiKeySaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setAiKeyError(typeof data.error === "string" ? data.error : "Something went wrong.")
      return
    }

    setAiKeyState("configured")
    setAiKeyInput("")
    setAiKeyMessage("API key saved.")
  }

  async function handleRemoveAiKey() {
    setAiKeyError(null)
    setAiKeyMessage(null)

    const res = await fetch("/api/ai-key", { method: "DELETE" })
    if (res.ok) {
      setAiKeyState("missing")
      setAiKeyMessage("API key removed.")
    }
  }

  async function handleCreateIntegration(e: React.FormEvent) {
    e.preventDefault()
    setIntegrationsError(null)

    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: newProvider, label: newLabel || null }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setIntegrationsError(typeof data.error === "string" ? data.error : "Could not create integration.")
      return
    }

    const created = await res.json() as IntegrationRecord
    setNewlyCreatedToken(created.token)
    setIntegrations((prev) => [...prev, { ...created, token: "••••••••" }])
    setNewLabel("")
  }

  async function handleDeleteIntegration(id: string) {
    const res = await fetch(`/api/integrations?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (res.ok) {
      setIntegrations((prev) => prev.filter((i) => i.id !== id))
    }
  }

  return (
    <>
      <div className="flex-none px-6 py-[22px]">
        <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-fg">
          Settings
        </h2>
      </div>

      <div className="border-t-2 border-border overflow-y-auto flex-1">
        {/* Do another life walk */}
        <button
          type="button"
          onClick={() => router.push("/lifewalk")}
          className="block w-full text-left px-6 py-4 border-b border-border text-md font-semibold text-fg hover:bg-surface transition-colors"
        >
          Do another life walk
        </button>

        {/* AI configuration */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex justify-between items-baseline gap-3 mb-3">
            <span className="text-md font-semibold text-fg">Anthropic API key</span>
            {aiKeyState === "configured" && (
              <span className="text-xs text-accent">Configured</span>
            )}
            {aiKeyState === "missing" && (
              <span className="text-xs text-red-400">Not set</span>
            )}
          </div>
          {aiKeyMessage && (
            <p className="text-xs text-subtle mb-2">{aiKeyMessage}</p>
          )}
          {aiKeyError && (
            <p className="text-xs text-red-400 mb-2">{aiKeyError}</p>
          )}
          <form onSubmit={(e) => void handleSaveAiKey(e)} className="flex flex-col gap-2">
            <input
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder={aiKeyState === "configured" ? "Replace existing key…" : "sk-ant-api03-…"}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-fg placeholder-dim focus:outline-none focus:border-muted transition-colors font-mono"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={aiKeySaving || !aiKeyInput.trim()}
                className="flex-1 bg-fg text-bg rounded-xl py-2.5 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {aiKeySaving ? "Verifying…" : "Save key"}
              </button>
              {aiKeyState === "configured" && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAiKey()}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-muted border border-border hover:border-fg hover:text-fg transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Advanced: integrations */}
        {isAdvanced && (
          <div className="px-6 py-4 border-b border-border">
            <div className="mb-3">
              <span className="text-md font-semibold text-fg">Integrations</span>
              <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-accent">Advanced</span>
            </div>
            <p className="text-[12.5px] text-subtle mb-4 leading-[1.5]">
              Each integration gets a unique bearer token. Give this token to your external system
              (e.g. Home Assistant) — it identifies you without exposing your account.
            </p>

            {newlyCreatedToken && (
              <div className="bg-surface border border-border rounded-xl px-4 py-3 mb-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <p className="text-[12px] font-semibold text-fg">Copy this token now — it won&apos;t be shown again.</p>
                  <button
                    type="button"
                    onClick={() => setNewlyCreatedToken(null)}
                    className="flex-shrink-0 w-5 h-5 text-muted hover:text-fg transition-colors text-sm leading-none"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
                <p className="text-[11px] font-mono break-all text-fg bg-bg border border-border rounded-lg px-3 py-2 mb-2">
                  {newlyCreatedToken}
                </p>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(newlyCreatedToken)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Copy to clipboard
                </button>
              </div>
            )}

            {integrationsLoading ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : (
              <>
                {integrations.length > 0 && (
                  <div className="flex flex-col gap-2 mb-4">
                    {integrations.map((integration) => (
                      <div
                        key={integration.id}
                        className="bg-bg border border-border rounded-xl px-4 py-3"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-fg truncate">
                              {integration.label ?? integration.provider}
                            </p>
                            <p className="text-[11px] text-muted mt-0.5 font-mono">
                              ••••••••
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeleteIntegration(integration.id)}
                            className="flex-shrink-0 text-xs text-muted hover:text-red-400 transition-colors"
                            aria-label="Remove integration"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {integrationsError && (
                  <p className="text-xs text-red-400 mb-2">{integrationsError}</p>
                )}

                <form onSubmit={(e) => void handleCreateIntegration(e)} className="flex flex-col gap-2">
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-muted transition-colors"
                  >
                    <option value="home_assistant">Home Assistant</option>
                    <option value="google">Google</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-fg placeholder-dim focus:outline-none focus:border-muted transition-colors"
                  />
                  <button
                    type="submit"
                    className="w-full bg-fg text-bg rounded-xl py-2.5 text-xs font-semibold hover:bg-white transition-colors"
                  >
                    Generate token
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <p className="flex-none px-6 py-[18px] text-[12px] leading-[1.5] text-muted">
        Caddie is holding everything you&rsquo;ve told it. It will never show you the total.
      </p>
    </>
  )
}
