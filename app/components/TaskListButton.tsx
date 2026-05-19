"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function TaskListButton() {
  const pathname = usePathname()

  if (pathname.startsWith("/auth") || pathname.startsWith("/lifewalk")) {
    return null
  }

  return (
    <Link
      href="/tasks"
      className="fixed top-5 left-5 z-40 w-11 h-11 rounded-full bg-gray-900 text-white shadow-md hover:bg-gray-700 transition-colors flex items-center justify-center"
      aria-label="Task list"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M3 4.5H15M3 9H15M3 13.5H15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </Link>
  )
}
