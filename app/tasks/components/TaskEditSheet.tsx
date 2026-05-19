"use client"

import { useState } from "react"
import { TASK_CATEGORIES } from "@/lib/categories"
import { ENERGY_OPTIONS } from "@/lib/energy-labels"
import type { TaskEnergy, TaskRow } from "@/lib/tasks"

type TaskEditSheetProps = {
  task: TaskRow | null
  open: boolean
  onClose: () => void
  onSaved: (task: TaskRow) => void
}

type Draft = {
  title: string
  next_due: string
  category: string
  energy: TaskEnergy
}

function toDraft(task: TaskRow): Draft {
  return {
    title: task.title,
    next_due: task.next_due ?? "",
    category: task.category,
    energy: task.energy,
  }
}

function TaskEditSheetForm({
  task,
  onClose,
  onSaved,
}: {
  task: TaskRow
  onClose: () => void
  onSaved: (task: TaskRow) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(task))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)

    const payload = {
      title: draft.title.trim(),
      category: draft.category,
      energy: draft.energy,
      next_due: draft.next_due.trim() ? draft.next_due : null,
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to save task",
        )
      }

      const data = await res.json()
      onSaved(data.task as TaskRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save task")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="task-edit-title"
        className="relative w-full max-w-lg bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-xl"
      >
        <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-6" />
        <h2 id="task-edit-title" className="text-lg font-semibold text-gray-800 mb-6">
          Edit task
        </h2>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Title
            </span>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="mt-1 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Due date
            </span>
            <input
              type="date"
              value={draft.next_due}
              onChange={(e) => setDraft({ ...draft, next_due: e.target.value })}
              className="mt-1 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Category
            </span>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="mt-1 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400"
            >
              {TASK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Energy
            </span>
            <select
              value={draft.energy}
              onChange={(e) =>
                setDraft({ ...draft, energy: e.target.value as TaskEnergy })
              }
              className="mt-1 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400"
            >
              {ENERGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2 mt-8">
          <button
            type="button"
            disabled={saving || !draft.title.trim()}
            onClick={() => void handleSave()}
            className="w-full bg-gray-900 text-white rounded-2xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30"
          >
            Save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 rounded-2xl py-3 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-30"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TaskEditSheet({
  task,
  open,
  onClose,
  onSaved,
}: TaskEditSheetProps) {
  if (!open || !task) {
    return null
  }

  return (
    <TaskEditSheetForm
      key={task.id}
      task={task}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}
