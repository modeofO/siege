"use client";

import { setNetwork } from "@/lib/network";
import { useNetwork } from "@/lib/useNetwork";

// Shown whenever the active network is not mainnet. Reads the network through
// useNetwork() rather than the NETWORK constant so the markup matches on
// hydration for a player who has switched — the server always renders the
// build's own network.
//
// The wording is deliberately blunt about two separate things: the practice
// chain runs katana's default dev seed, so its admin keys are public and any
// balance can be taken; and nothing earned there carries over to mainnet, which
// is a separate world with separate token contracts.
export function TestNetworkBanner() {
  const network = useNetwork();

  if (network === "mainnet") return null;

  return (
    <div className="border-b border-[#b5523a]/40 bg-[#b5523a]/10">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tracking-wider">
        <span className="text-[#b5523a] font-bold">PRACTICE</span>
        <span className="text-[#7a7060]">
          Free sandbox — no stakes, and nothing here carries over to mainnet. The chain&apos;s admin
          keys are public, so any balance or ability can be taken by anyone.
        </span>
        <button
          type="button"
          onClick={() => setNetwork("mainnet")}
          className="ml-auto text-[#c8a44e] hover:text-[#e0bd68] underline underline-offset-2 transition-colors"
        >
          Play on mainnet →
        </button>
      </div>
    </div>
  );
}
