"use client";

import { useState, useCallback, useEffect } from "react";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useWorldParcels, usePlayerKingdom } from "@/lib/worldState";
import { HexGrid } from "@/components/HexGrid";
import { RegisterKingdom } from "@/components/RegisterKingdom";
import { fetchAbilityBalances } from "@/lib/abilityToken";
import { FactionPanel } from "@/components/FactionPanel";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

// World system contract address — will need env var for Sepolia
const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "0x0";

const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
};

export default function WorldPage() {
  const { account, address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const { parcels, loading } = useWorldParcels(refreshKey);
  const kingdom = usePlayerKingdom(address || null, refreshKey);
  const [abilities, setAbilities] = useState<Record<string, number>>({});

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Fetch ability balances
  useEffect(() => {
    if (!address) return;
    const fetchAb = async () => {
      try {
        const provider = new RpcProvider({ nodeUrl: RPC_URL });
        const balances = await fetchAbilityBalances(provider, address);
        setAbilities(balances);
      } catch {
        // Ignore — ability token may not be deployed
      }
    };
    void fetchAb();
    const i = setInterval(fetchAb, 8000);
    return () => clearInterval(i);
  }, [address, refreshKey]);

  // Get home parcel types for display
  const homeParcelTypes = kingdom.registered
    ? [kingdom.home0, kingdom.home1, kingdom.home2]
        .map((id) => parcels.find((p) => p.parcelId === id))
        .filter(Boolean)
    : [];

  if (!account || !address) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider">Connect wallet to view the world</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING WORLD...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Registration overlay */}
      {!kingdom.registered && parcels.length > 0 && (
        <RegisterKingdom
          account={account}
          worldSystemAddress={WORLD_SYSTEM_ADDRESS}
          onRegistered={refresh}
        />
      )}

      {/* Map header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">
          THE REALM
        </h1>
        {kingdom.registered && (
          <div className="text-xs text-[#7a7060]">
            {kingdom.parcelCount} parcels owned
          </div>
        )}
      </div>

      {/* Hex grid */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4">
        {parcels.length === 0 ? (
          <div className="text-center text-[#7a7060] py-12">
            World not initialized. No parcels found.
          </div>
        ) : (
          <HexGrid
            parcels={parcels}
            playerAddress={address}
            homeParcelIds={
              kingdom.registered
                ? [kingdom.home0, kingdom.home1, kingdom.home2]
                : []
            }
          />
        )}
      </div>

      {/* Kingdom summary */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
            Your Kingdom
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Home parcels */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Home Parcels</div>
              <div className="flex gap-2">
                {homeParcelTypes.map((p, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 rounded text-[10px] font-bold border border-[#daa520]/30"
                    style={{ color: p ? { 0: "#b87333", 1: "#8a8a9a", 2: "#4a7c59" }[p.parcelType as 0 | 1 | 2] : "#7a7060" }}
                  >
                    {p ? PARCEL_TYPE_NAMES[p.parcelType] : "?"}
                  </div>
                ))}
              </div>
            </div>

            {/* Abilities */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Abilities</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(abilities).map(([name, count]) =>
                  count > 0 ? (
                    <div key={name} className="px-2 py-1 rounded text-[10px] bg-[#252019] text-[#d4cfc6]">
                      {name}: {count}
                    </div>
                  ) : null,
                )}
                {Object.values(abilities).every((c) => c === 0) && (
                  <div className="text-[10px] text-[#7a7060]">None</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Faction panel */}
      {kingdom.registered && (
        <FactionPanel
          account={account}
          address={address}
          kingdom={kingdom}
          refresh={refresh}
        />
      )}
    </div>
  );
}
