"use client"

import { useRouter } from "next/navigation"

export default function SettingsScreen() {
  const router = useRouter()

  return (
    <>
      <div className="flex-none px-6 py-[22px]">
        <h2 className="text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-[#e8eaf0]">
          Settings
        </h2>
      </div>
      <div className="border-t-2 border-[#2c3040]">
        <div className="px-6 py-4 border-b border-[#2c3040]">
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-[15px] font-semibold text-[#e8eaf0]">Your list</span>
            <span className="text-[13px] text-[#c2604a]">Hidden on purpose</span>
          </div>
          <p className="mt-[10px] text-[12.5px] leading-[1.5] text-[#9aa0b0] max-w-[290px]">
            Seeing the pile is the injury — you can&rsquo;t do it all, and you can&rsquo;t do only the interesting ones, so nothing gets done. Caddie holds all of it and hands you three.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/lifewalk")}
          className="block w-full text-left px-6 py-4 border-b border-[#2c3040] text-[15px] font-semibold text-[#e8eaf0] hover:bg-[#1e2128] transition-colors"
        >
          Do another life walk
        </button>
      </div>
      <p className="px-6 py-[18px] text-[12px] leading-[1.5] text-[#5a6070]">
        Caddie is holding everything you&rsquo;ve told it. It will never show you the total.
      </p>
    </>
  )
}
