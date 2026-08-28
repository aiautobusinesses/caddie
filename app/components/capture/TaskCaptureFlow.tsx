"use client"

import { useRef, useState } from "react"
import type { LifeWalkExtractedThing } from "@/lib/tasks"
import { saveCapturedThings } from "@/lib/capture"
import SwipeableTaskRow from "./SwipeableTaskRow"
import Spinner from "@/app/components/Spinner"

type Stage = "narrate" | "processing" | "review"

type TaskCaptureFlowProps = {
  variant: "lifewalk" | "capture"
  onSaved: () => void | Promise<void>
  onClose?: () => void
  /** Back button shown in lifewalk header when entered from settings */
  onBack?: () => void
}

// Normalise the vendor-prefixed SpeechRecognition constructor.
// TypeScript's dom lib exposes SpeechRecognition but the constructor
// isn't on `window` in all versions — use any to stay compatible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

function getSpeechRecognition(): AnySpeechRecognition | null {
  if (typeof window === "undefined") return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function TaskCaptureFlow({
  variant,
  onSaved,
  onClose,
  onBack,
}: TaskCaptureFlowProps) {
  const [stage, setStage] = useState<Stage>("narrate")
  const [transcript, setTranscript] = useState("")
  const [things, setThings] = useState<LifeWalkExtractedThing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  // Lazy initialiser — runs once on mount (client only, never on server)
  const [speechSupported] = useState(() => getSpeechRecognition() !== null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  // Tracks whether the user explicitly stopped (vs browser ending on silence)
  const userStoppedRef = useRef(false)

  function startRecognition() {
    const SR = getSpeechRecognition()
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = "en-GB"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const appended = Array.from<any>(event.results)
        .slice(event.resultIndex)
        .map((r) => r[0].transcript)
        .join(" ")
      setTranscript((prev) => (prev ? `${prev} ${appended}` : appended))
    }

    recognition.onerror = (event: { error: string }) => {
      // "no-speech" and "audio-capture" are recoverable — restart unless user stopped
      if (!userStoppedRef.current && event.error !== "not-allowed" && event.error !== "service-not-allowed") {
        return // onend will fire next and trigger restart
      }
      setListening(false)
    }

    recognition.onend = () => {
      // Android Chrome ends recognition after a few seconds of silence even
      // with continuous=true. Restart automatically unless the user stopped.
      if (!userStoppedRef.current) {
        try {
          recognition.start()
          return
        } catch {
          // Already started or unavailable — fall through to stop
        }
      }
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function toggleListening() {
    if (listening) {
      userStoppedRef.current = true
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    userStoppedRef.current = false
    startRecognition()
    setListening(true)
  }

  const isOnboarding = variant === "lifewalk"

  async function handleSubmit() {
    if (!transcript.trim()) return
    setStage("processing")
    setError(null)

    try {
      const res = await fetch("/api/lifewalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setThings(data.things)
      setStage("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setStage("narrate")
    }
  }

  function deleteThing(i: number) {
    setThings((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      if (things.length > 0) {
        await saveCapturedThings(things)
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
      setSaving(false)
    }
  }

  if (stage === "narrate") {
    return (
      <div className={isOnboarding ? "flex flex-col items-center justify-center min-h-dvh px-6" : "px-6 py-8"}>
        <div className="w-full max-w-sm mx-auto">
          {(onClose ?? onBack) && (
            <div className="flex justify-between mb-4">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-8 h-8 rounded-full bg-dim/50 hover:bg-border text-muted flex items-center justify-center"
                  aria-label="Back"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3L5 8l5 5" />
                  </svg>
                </button>
              ) : <span />}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-dim/50 hover:bg-border text-muted text-sm flex items-center justify-center"
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>
          )}
          {isOnboarding ? (
            <>
              <p className="text-xs uppercase tracking-widest text-muted mb-2 text-center">Life walk</p>
              <h1 className="text-2xl font-semibold text-fg text-center mb-2">What&apos;s on your mind?</h1>
              <p className="text-sm text-muted text-center mb-8">
                Walk around your spaces and type everything you notice that needs doing. Don&apos;t filter — just narrate.
              </p>
            </>
          ) : (
            <h1 className="text-xl font-semibold text-fg mb-6">What needs doing?</h1>
          )}
          <div className="relative">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Bleed the radiator, book the car in, trim the hedge..."
              className="w-full bg-surface border border-border rounded-3xl p-5 text-sm text-fg placeholder-dim resize-none focus:outline-none focus:border-muted transition-colors"
              rows={isOnboarding ? 8 : 6}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                aria-label={listening ? "Stop recording" : "Start recording"}
                className={`absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  listening
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-dim/50 text-muted hover:text-fg hover:bg-border"
                }`}
              >
                {listening ? (
                  // Stop icon
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="2" y="2" width="10" height="10" rx="1.5" />
                  </svg>
                ) : (
                  // Mic icon
                  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="1" width="6" height="10" rx="3" />
                    <path d="M1 9a6 6 0 0 0 12 0" />
                    <line x1="7" y1="15" x2="7" y2="17" />
                    <line x1="4" y1="17" x2="10" y2="17" />
                  </svg>
                )}
              </button>
            )}
          </div>
          {listening && (
            <p className="text-xs text-red-400 mt-2 text-center">Listening — tap the mic to stop</p>
          )}
          {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!transcript.trim()}
            className="w-full mt-4 bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Let Caddie sort this out
          </button>
        </div>
      </div>
    )
  }

  if (stage === "processing") {
    return (
      <div className={isOnboarding ? "flex flex-col items-center justify-center min-h-dvh px-6 text-center" : "flex flex-col items-center justify-center px-6 py-24 text-center"}>
        <div className="mb-6">
          <Spinner size={36} />
        </div>
        <p className="text-2xl font-semibold text-fg mb-2">Sorting it out…</p>
        <p className="text-sm text-muted">Caddie is working through what you said.</p>
      </div>
    )
  }

  return (
    <div className={isOnboarding ? "flex flex-col items-center min-h-dvh px-6 py-12" : "px-6 py-8"}>
      <div className="w-full max-w-sm mx-auto">
        {onClose && (
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-dim/50 hover:bg-border text-muted text-sm flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <p className="text-xs uppercase tracking-widest text-muted mb-2 text-center">Here&apos;s what I found</p>
        <h1 className="text-2xl font-semibold text-fg text-center mb-6">
          {things.length} {things.length === 1 ? "thing" : "things"}
        </h1>
        <div className="flex flex-col gap-3 mb-8">
          {things.map((thing, i) => (
            <SwipeableTaskRow
              key={`${thing.name}-${i}`}
              thing={thing}
              onDelete={() => deleteThing(i)}
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-400 text-center mb-4">{error}</p>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full bg-fg text-bg rounded-2xl py-4 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : `Save ${things.length} ${things.length === 1 ? "thing" : "things"}`}
        </button>
      </div>
    </div>
  )
}
