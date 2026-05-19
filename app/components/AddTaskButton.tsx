"use client"

import { usePathname } from "next/navigation"
import { useCapture } from "./capture/CaptureContext"

export default function AddTaskButton() {
  const pathname = usePathname()
  const { openCapture } = useCapture()

  if (pathname.startsWith("/auth") || pathname.startsWith("/lifewalk")) {
    return null
  }

  return (
    <button
      type="button"
      onClick={openCapture}
      className="fixed top-5 right-5 z-40 w-11 h-11 rounded-full bg-gray-900 text-white text-2xl font-light leading-none shadow-md hover:bg-gray-700 transition-colors flex items-center justify-center"
      aria-label="Add tasks"
    >
      +
    </button>
  )
}
