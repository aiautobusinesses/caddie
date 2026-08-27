"use client"

import { useEffect } from "react"
import { registerServiceWorker } from "@/lib/push"
import { useKeyboardAvoidance } from "@/lib/use-keyboard-avoidance"
import { CaptureProvider } from "./capture/CaptureContext"
import CaptureModal from "./capture/CaptureModal"
import AddTaskButton from "./AddTaskButton"
import InstallBanner from "./InstallBanner"
import SessionGuard from "./SessionGuard"

export default function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void registerServiceWorker()
  }, [])

  useKeyboardAvoidance()

  return (
    <CaptureProvider>
      <SessionGuard>
        {children}
        <AddTaskButton />
        <CaptureModal />
        <InstallBanner />
      </SessionGuard>
    </CaptureProvider>
  )
}
