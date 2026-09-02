"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import TaskCaptureFlow from "@/app/components/capture/TaskCaptureFlow"
import { completeOnboarding } from "@/lib/capture"

function LifeWalkInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromSettings = searchParams.get("from") === "settings"

  return (
    <TaskCaptureFlow
      variant="lifewalk"
      onBack={fromSettings ? () => router.back() : () => router.push("/")}
      onSaved={async () => {
        await completeOnboarding()
        router.push("/")
      }}
    />
  )
}

export default function LifeWalk() {
  return (
    <Suspense>
      <LifeWalkInner />
    </Suspense>
  )
}
