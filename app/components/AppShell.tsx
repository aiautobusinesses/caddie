"use client"

import { useEffect } from "react"
import { registerServiceWorker } from "@/lib/push"
import { CaptureProvider } from "./capture/CaptureContext"
import CaptureModal from "./capture/CaptureModal"
import AddTaskButton from "./AddTaskButton"
import TaskListButton from "./TaskListButton"

export default function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void registerServiceWorker()
  }, [])

  return (
    <CaptureProvider>
      {children}
      <AddTaskButton />
      <TaskListButton />
      <CaptureModal />
    </CaptureProvider>
  )
}
