"use client"

import { useRouter } from "next/navigation"

export default function SettingsScreen() {
  const router = useRouter()

  return (
    <>
      <div className="flex-none px-6 py-[22px]">
        <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-fg">
          Settings
        </h2>
      </div>
      <div className="border-t-2 border-border">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-md font-semibold text-fg">Your list</span>
            <span className="text-sm text-accent">Hidden on purpose</span>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.5] text-subtle max-w-[290px]">
            Seeing the pile is the injury — you can&rsquo;t do it all, and you can&rsquo;t do only the interesting ones, so nothing gets done. Caddie holds all of it and hands you three.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/lifewalk")}
          className="block w-full text-left px-6 py-4 border-b border-border text-md font-semibold text-fg hover:bg-surface transition-colors"
        >
          Do another life walk
        </button>
      </div>
      <p className="px-6 py-[18px] text-[12px] leading-[1.5] text-muted">
        Caddie is holding everything you&rsquo;ve told it. It will never show you the total.
      </p>
    </>
  )
}
