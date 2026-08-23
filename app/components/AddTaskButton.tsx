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
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#e8eaf0] text-[#16181c] text-3xl font-light leading-none shadow-lg hover:bg-white transition-colors flex items-center justify-center"
      aria-label="Add tasks"
    >
      +
    </button>
  )
}
