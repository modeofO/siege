"use client";

import { setNetwork } from "@/lib/network";
import { useNetwork } from "@/lib/useNetwork";

// Shown whenever the active network is not mainnet. Reads the network through
// useNetwork() rather than the NETWORK constant so the markup matches on
// hydration for a player who has switched — the server always renders the
// build's own network.
//
// Says the one thing a player needs: nothing here carries over. Mainnet is a
// separate world with separate token contracts, so practice progress is not
// portable — that is also what makes the chain safe to leave wide open.
//
// It deliberately does NOT warn that the chain's admin keys are public (they
// are — katana's default dev seed owns the world and mints every token). That
// is true but reads as a security warning about assets nobody can lose: there
// is nothing on this chain worth stealing, which is the entire design. Realms
// ships the same public-key setup on their slot chain with no warning at all.
export function TestNetworkBanner() {
  const network = useNetwork();

  if (network === "mainnet") return null;

  return (
    <div className="border-b border-[#b5523a]/40 bg-[#b5523a]/10">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tracking-wider">
        <span className="text-[#b5523a] font-bold">PRACTICE</span>
        <span className="text-[#7a7060]">
          Free practice — no stakes, and nothing here carries over to mainnet.
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
