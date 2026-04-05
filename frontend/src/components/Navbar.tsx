"use client";

import Link from "next/link";
import { isDevMode } from "@/app/providers";
import { AccountSelector } from "./AccountSelector";
import { ConnectWallet } from "./ConnectWallet";

export function Navbar() {
  return (
    <nav className="border-b border-[#3d3428] bg-[#0d0b0a]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-widest text-[#c8a44e] font-serif">
            SIEGE
          </Link>
          <Link href="/how-to-play" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            HOW TO PLAY
          </Link>
          <Link href="/craft" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            FORGE
          </Link>
        </div>
        {isDevMode() ? <AccountSelector /> : <ConnectWallet />}
      </div>
    </nav>
  );
}
