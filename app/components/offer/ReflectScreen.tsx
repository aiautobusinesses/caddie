"use client"

import { useEffect, useState } from "react"
import type { ReflectionGroup } from "@/lib/reflect"
import Spinner from "@/app/components/Spinner"

export default function ReflectScreen() {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<ReflectionGroup[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReflections() {
      try {
        const res = await fetch("/api/reflect")
        if (!res.ok) throw new Error("Could not load completed items")
        const data = await res.json()
        setGroups(data.groups ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load")
      } finally {
        setLoading(false)
      }
    }
    void fetchReflections()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Spinner />
      </div>
    )
  }

  return (
    <>
      <div className="flex-none px-6 py-5 border-b-2 border-border">
        <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-fg">
          Things Done
        </h2>
        <p className="mt-1 text-xs text-muted">
          A record of what you actually did.
        </p>
      </div>

      <div className="flex-1 px-6 py-5 overflow-y-auto">
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {groups.length === 0 ? (
          <div className="flex flex-col items-start justify-center py-12">
            <h3 className="text-2xl font-bold text-fg mb-2">
              Nothing completed yet.
            </h3>
            <p className="text-sm text-muted">
              Pick up an offer on the Now tab to get going.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2.5">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  {group.label}
                </p>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-surface border border-border rounded-xl p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-fg leading-snug truncate">
                          {item.thing_name}
                        </p>
                        <p className="text-sm text-subtle mt-0.5 leading-snug">
                          {item.step_name}
                        </p>
                      </div>

                      {item.highlight ? (
                        <span className="flex-none px-2.5 py-1 bg-dim/40 border border-border rounded-lg text-xs font-semibold text-subtle">
                          {item.highlight}
                        </span>
                      ) : (
                        <span className="flex-none w-5 h-5 rounded-full bg-fg/10 flex items-center justify-center mt-0.5 text-fg">
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
