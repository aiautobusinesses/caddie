/**
 * StopNoteScreen — post-stop annotation screen.
 *
 * Copy rules (DESIGN.md §Stop, §Deliberately excluded):
 *  - No encouragement, no "well done for stopping sensibly".
 *  - The note prompt is neutral and practical.
 *  - Skipping costs nothing and must feel free — no guilt framing.
 *  - Factual and neutral only.
 */
"use client"

import { useRef, useState } from "react"

type Props = {
  /** Called when the user submits a note, photo, or both. */
  onSave: (note: string | null, photoFile: File | null) => void
  /** Called when the user skips without recording anything. */
  onSkip: () => void
}

/**
 * Post-stop note and photo screen.
 *
 * Shown after the user taps "Still going" on the FocusScreen.  The stop
 * event has already been recorded; this screen offers a chance to capture
 * where they got to.  Both inputs are optional and the screen is entirely
 * dismissible — skipping costs nothing and never repeats.
 */
export default function StopNoteScreen({ onSave, onSkip }: Props) {
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasContent = note.trim().length > 0 || photo !== null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPhoto(file)
    if (file) {
      setPhotoPreview(URL.createObjectURL(file))
    } else {
      setPhotoPreview(null)
    }
  }

  function handleRemovePhoto() {
    setPhoto(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
  }

  function handleSave() {
    onSave(note.trim() || null, photo)
  }

  return (
    <>
      <div className="flex-none px-6 pt-6 pb-0">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          Stopped
        </p>
      </div>

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-y-auto">
        <h2 className="text-3xl sm:text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-fg">
          Where did you get to?
        </h2>
        <p className="mt-3 text-sm text-muted">
          A note or photo helps you pick up where you left off. Skip if not needed.
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. stripped the old sealant, surface clean and dry"
          rows={3}
          className="mt-4 w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-fg placeholder:text-dim resize-none focus:outline-none focus:border-fg transition-colors"
        />

        <div className="mt-3 flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs font-semibold text-muted hover:text-fg transition-colors flex items-center gap-1.5 py-1 px-1"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="10" rx="2" />
                <circle cx="8" cy="8" r="2.5" />
                <path d="M5 3V2" />
              </svg>
              {photo ? "Change photo" : "Add a photo"}
            </button>
            {photo && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove photo
              </button>
            )}
          </div>

          {photoPreview && (
            <div className="mt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Stop preview"
                className="rounded-xl max-h-36 object-cover border border-border"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2.5">
        {hasContent && (
          <button
            type="button"
            onClick={handleSave}
            className="text-left bg-fg text-bg rounded-xl px-5 py-4 text-base font-semibold hover:bg-white transition-all active:scale-[0.99]"
          >
            Save and continue
          </button>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="text-left border border-border rounded-xl px-5 py-3.5 text-sm font-semibold text-subtle hover:border-fg hover:text-fg transition-all active:scale-[0.99]"
        >
          Skip
        </button>
      </div>
    </>
  )
}
