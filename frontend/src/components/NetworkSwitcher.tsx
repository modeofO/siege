"use client";

import { networkLabel, setNetwork, SWITCHABLE_NETWORKS, SWITCHING_ENABLED } from "@/lib/network";
import { useNetwork } from "@/lib/useNetwork";

// Network picker for the navbar. Both deployments ship it — the hostname only
// sets the default, the same way blitz.realms.world and dev.blitz.realms.world
// both carry Blitz's world switcher.
//
// Selecting a network persists it and hard reloads; see setNetwork() for why a
// reload rather than an in-place swap.
export function NetworkSwitcher() {
  const active = useNetwork();

  if (!SWITCHING_ENABLED) return null;

  return (
    <div className="flex items-center rounded border border-[#3d3428] overflow-hidden">
      {SWITCHABLE_NETWORKS.map((network) => {
        const isActive = network === active;
        return (
          <button
            key={network}
            type="button"
            onClick={() => setNetwork(network)}
            aria-current={isActive ? "true" : undefined}
            title={
              network === "mainnet"
                ? "Starknet mainnet — real stakes"
                : "Free practice chain — nothing is at stake and nothing carries over"
            }
            className={`px-2 py-0.5 text-[10px] tracking-wider uppercase transition-colors ${
              isActive
                ? "bg-[#c8a44e] text-[#0d0b0a] font-bold"
                : "text-[#7a7060] hover:text-[#c8a44e]"
            }`}
          >
            {networkLabel(network)}
          </button>
        );
      })}
    </div>
  );
}
