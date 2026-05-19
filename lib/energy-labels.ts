import type { TaskEnergy } from "@/lib/tasks"

export const ENERGY_LABELS: Record<TaskEnergy, string> = {
  low: "Easy",
  medium: "Steady",
  high: "Sharp",
}

export const ENERGY_OPTIONS: { value: TaskEnergy; label: string }[] = [
  { value: "low", label: "Easy" },
  { value: "medium", label: "Steady" },
  { value: "high", label: "Sharp" },
]
