"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { notifyTasksUpdated } from "@/lib/capture"
import {
  groupTasksByCategory,
  groupTasksByWhen,
  WHEN_GROUP_LABELS,
  WHEN_GROUP_ORDER,
  type WhenGroupKey,
} from "@/lib/task-groups"
import type { TaskRow } from "@/lib/tasks"
import AuditStack from "./AuditStack"
import TaskEditSheet from "./TaskEditSheet"
import TaskListRow from "./TaskListRow"

type FilterMode = "when" | "category"
type ViewMode = "list" | "audit"

type TaskListProps = {
  initialTasks: TaskRow[]
}

export default function TaskList({ initialTasks }: TaskListProps) {
  const today = useMemo(() => new Date().toISOString().split("T")[0], [])

  const [tasks, setTasks] = useState(initialTasks)
  const [filterMode, setFilterMode] = useState<FilterMode>("when")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [auditTasks, setAuditTasks] = useState<TaskRow[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const whenGroups = useMemo(() => groupTasksByWhen(tasks, today), [tasks, today])
  const categoryGroups = useMemo(() => groupTasksByCategory(tasks), [tasks])

  const loadAuditTasks = useCallback(async () => {
    setAuditLoading(true)
    setAuditError(null)

    try {
      const res = await fetch("/api/tasks/audit")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to load audit tasks",
        )
      }
      const data = await res.json()
      setAuditTasks(data.tasks as TaskRow[])
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to load audit tasks")
    } finally {
      setAuditLoading(false)
    }
  }, [])

  async function enterAuditMode() {
    setViewMode("audit")
    await loadAuditTasks()
  }

  function exitAuditMode() {
    setViewMode("list")
  }

  async function handleDelete(task: TaskRow) {
    setActionError(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "done" }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to delete task",
        )
      }

      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      setAuditTasks((prev) => prev?.filter((t) => t.id !== task.id) ?? null)
      notifyTasksUpdated()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete task")
    }
  }

  function handleEditSaved(updated: TaskRow) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    setAuditTasks((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : null,
    )
    setEditingTask(null)
    notifyTasksUpdated()
  }

  function renderWhenGroups() {
    return WHEN_GROUP_ORDER.map((key: WhenGroupKey) => {
      const group = whenGroups.get(key) ?? []
      if (group.length === 0) return null

      return (
        <section key={key} className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-3">
            {WHEN_GROUP_LABELS[key]}
          </h2>
          <div className="flex flex-col gap-2">
            {group.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                today={today}
                onTap={() => setEditingTask(task)}
                onDelete={() => void handleDelete(task)}
              />
            ))}
          </div>
        </section>
      )
    })
  }

  function renderCategoryGroups() {
    return [...categoryGroups.entries()].map(([category, group]) => (
      <section key={category} className="mb-8">
        <h2 className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-3">
          {category}
        </h2>
        <div className="flex flex-col gap-2">
          {group.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              today={today}
              onTap={() => setEditingTask(task)}
              onDelete={() => void handleDelete(task)}
            />
          ))}
        </div>
      </section>
    ))
  }

  return (
    <div className="min-h-screen px-6 pt-20 pb-16 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-6">
        {viewMode === "audit" ? (
          <button
            type="button"
            onClick={exitAuditMode}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
        ) : (
          <Link
            href="/"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ← Home
          </Link>
        )}

        {viewMode === "list" ? (
          <button
            type="button"
            onClick={() => void enterAuditMode()}
            className="text-sm font-semibold text-gray-900 hover:text-gray-600"
          >
            Audit
          </button>
        ) : (
          <span className="text-sm font-semibold text-gray-400">Audit</span>
        )}
      </header>

      {viewMode === "list" && (
        <>
          <h1 className="text-2xl font-semibold text-gray-800 mb-6">Tasks</h1>

          <div className="flex rounded-2xl bg-gray-100 p-1 mb-8">
            <button
              type="button"
              onClick={() => setFilterMode("when")}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                filterMode === "when"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              By when
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("category")}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                filterMode === "category"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              By category
            </button>
          </div>

          {actionError && (
            <p className="text-sm text-red-500 mb-4">{actionError}</p>
          )}

          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              No active tasks.
            </p>
          ) : filterMode === "when" ? (
            renderWhenGroups()
          ) : (
            renderCategoryGroups()
          )}
        </>
      )}

      {viewMode === "audit" && (
        <>
          {auditLoading && (
            <p className="text-sm text-gray-400 text-center py-12">Loading audit…</p>
          )}

          {auditError && (
            <div className="text-center py-12">
              <p className="text-sm text-red-500 mb-4">{auditError}</p>
              <button
                type="button"
                onClick={() => void loadAuditTasks()}
                className="text-sm font-medium text-gray-700 underline"
              >
                Try again
              </button>
            </div>
          )}

          {!auditLoading && !auditError && auditTasks !== null && (
            <AuditStack
              initialTasks={auditTasks}
              today={today}
              listTasks={tasks}
              onTasksChange={setAuditTasks}
              onListTasksChange={setTasks}
              onBack={exitAuditMode}
            />
          )}
        </>
      )}

      <TaskEditSheet
        task={editingTask}
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        onSaved={handleEditSaved}
      />
    </div>
  )
}
