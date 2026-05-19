"use client"

import { useRouter } from "next/navigation"
import TaskCaptureFlow from "@/app/components/capture/TaskCaptureFlow"
import { completeOnboarding } from "@/lib/capture"

export default function LifeWalk() {
  const router = useRouter()

  return (
    <TaskCaptureFlow
      variant="lifewalk"
      onSaved={async () => {
        await completeOnboarding()
        router.push("/")
      }}
    />
  )
}
