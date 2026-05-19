export const TASK_CATEGORIES = [
  "Home",
  "Garden",
  "Car",
  "Admin",
  "Family",
  "Health",
  "Finance",
  "Other",
] as const

export type TaskCategory = (typeof TASK_CATEGORIES)[number]
