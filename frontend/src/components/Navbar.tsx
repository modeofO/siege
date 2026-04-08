"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDevMode } from "@/app/providers";
import { AccountSelector } from "./AccountSelector";
import { ConnectWallet } from "./ConnectWallet";

// Remember the match the player is currently in so pages like /craft can offer a way back.
// Matches /match/<id> and /match-1v1/<id>, ignoring /create and /join subroutes.
const MATCH_PATH = /^\/match(?:-1v1)?\/(?!create|join)[^/]+/;
export const LAST_MATCH_KEY = "siege:lastMatch";

function useTrackLastMatch() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    if (MATCH_PATH.test(pathname)) {
      try {
        sessionStorage.setItem(LAST_MATCH_KEY, pathname);
      } catch {
        // sessionStorage may be unavailable (SSR, privacy mode) — silently skip
      }
    }
  }, [pathname]);
}

export function Navbar() {
  useTrackLastMatch();

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
          <Link href="/world" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            WORLD
          </Link>
        </div>
        {isDevMode() ? <AccountSelector /> : <ConnectWallet />}
      </div>
    </nav>
  );
}
