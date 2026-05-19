"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"

type CaptureContextValue = {
  isOpen: boolean
  openCapture: () => void
  closeCapture: () => void
}

const CaptureContext = createContext<CaptureContextValue | null>(null)

export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openCapture = useCallback(() => setIsOpen(true), [])
  const closeCapture = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, openCapture, closeCapture }),
    [isOpen, openCapture, closeCapture],
  )

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>
}

export function useCapture() {
  const context = useContext(CaptureContext)
  if (!context) {
    throw new Error("useCapture must be used within CaptureProvider")
  }
  return context
}
