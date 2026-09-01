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
  const fileRef = useRef<HTMLInputElement>(null)

  const hasContent = note.trim().length > 0 || photo !== null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setPhoto(file)
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

      <div className="flex-1 px-6 py-5 flex flex-col justify-center min-h-0 overflow-hidden">
        <h2 className="text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-fg">
          Where did you get to?
        </h2>
        <p className="mt-3.5 text-sm text-muted">
          A note helps you pick up where you left off. Skip if not needed.
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. stripped the old sealant, surface clean and dry"
          rows={4}
          className="mt-5 w-full bg-surface border border-border rounded-[10px] px-4 py-3 text-sm text-fg placeholder:text-dim resize-none focus:outline-none focus:border-fg transition-colors"
        />

        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm font-bold text-muted hover:text-subtle transition-colors"
          >
            {photo ? photo.name : "Add a photo"}
          </button>
          {photo && (
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="text-xs text-dim hover:text-muted transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex-none px-6 pb-6 flex flex-col gap-2">
        {hasContent && (
          <button
            type="button"
            onClick={handleSave}
            className="text-left bg-fg text-bg rounded-[14px] px-5 py-[17px] text-md font-bold hover:bg-white transition-colors"
          >
            Save and continue
          </button>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="text-left border border-border rounded-[14px] px-5 py-[15px] text-base font-bold text-subtle hover:border-fg hover:text-fg transition-colors"
        >
          Skip
        </button>
      </div>
    </>
  )
}
