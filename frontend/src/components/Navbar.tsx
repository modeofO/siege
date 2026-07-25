"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDevMode } from "@/app/providers";
import { useToriiHealth } from "@/lib/usePoll";
import { AccountSelector } from "./AccountSelector";
import { ConnectWallet } from "./ConnectWallet";
import { NetworkSwitcher } from "./NetworkSwitcher";

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
  const toriiHealthy = useToriiHealth();

  return (
    <nav className="border-b border-[#3d3428] bg-[#0d0b0a]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-widest text-[#c8a44e] font-serif">
            SIEGE
          </Link>
          <Link href="/craft" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            CRAFT
          </Link>
          <Link href="/forge" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            CIRCUIT FORGE
          </Link>
          <Link href="/world" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            WORLD
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <NetworkSwitcher />
          {!toriiHealthy && (
            <span
              className="text-[10px] tracking-wider text-[#b5523a] border border-[#b5523a]/40 rounded px-2 py-0.5"
              title="Game data is not refreshing — the indexer is unreachable. Shown values may be stale."
            >
              CONNECTION LOST
            </span>
          )}
          {isDevMode() ? <AccountSelector /> : <ConnectWallet />}
        </div>
      </div>
    </nav>
  );
}
