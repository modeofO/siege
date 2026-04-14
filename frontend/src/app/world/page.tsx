"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useWorldParcels, usePlayerKingdom } from "@/lib/worldState";
import { HexGrid } from "@/components/HexGrid";
import { RegisterKingdom } from "@/components/RegisterKingdom";
import { fetchAllAbilityBalances } from "@/lib/abilityToken";
import { AbilityIcon } from "@/components/AbilityIcon";
import { FactionPanel } from "@/components/FactionPanel";
import styles from "./parchment.module.css";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

// World system contract address — will need env var for Sepolia
const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "0x0";

const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
};

function TorchOverlay() {
  const positions = [
    { top: "9%", left: "5%" },
    { top: "9%", right: "5%" },
    { bottom: "4%", left: "3%" },
    { bottom: "4%", right: "3%" },
  ];

  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} className={styles.torch} style={pos}>
          <span className={styles.torchGlow} />
        </div>
      ))}
    </>
  );
}

function CloudDrift() {
  const clouds = [
    { top: "30%", duration: "45s", delay: "0s", scale: 1.0 },
    { top: "55%", duration: "65s", delay: "-20s", scale: 0.7 },
    { top: "15%", duration: "55s", delay: "-40s", scale: 1.2 },
  ];

  return (
    <div className={styles.cloudClip}>
      {clouds.map((c, i) => (
        <svg
          key={i}
          className={styles.cloud}
          style={
            {
              top: c.top,
              transform: `scale(${c.scale})`,
              "--cloud-duration": c.duration,
              "--cloud-delay": c.delay,
            } as React.CSSProperties
          }
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
        >
          <ellipse cx="40" cy="30" rx="35" ry="14" fill="#f0e8d8" />
          <ellipse cx="85" cy="25" rx="45" ry="18" fill="#f0e8d8" />
          <ellipse cx="140" cy="32" rx="38" ry="15" fill="#f0e8d8" />
          <ellipse cx="175" cy="28" rx="22" ry="12" fill="#f0e8d8" />
        </svg>
      ))}
    </div>
  );
}

export default function WorldPage() {
  const { account, address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const { parcels, loading } = useWorldParcels(refreshKey);
  const kingdom = usePlayerKingdom(address || null, refreshKey);
  const [abilities, setAbilities] = useState<Record<number, number>>({});

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Fetch ability balances (all 10 token IDs — T1 1..5, T2 6..10)
  useEffect(() => {
    if (!address) return;
    const fetchAb = async () => {
      try {
        const provider = new RpcProvider({ nodeUrl: RPC_URL });
        const balances = await fetchAllAbilityBalances(provider, address);
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
          THE MARCHES
        </h1>
        {kingdom.registered && (
          <div className="text-xs text-[#7a7060]">
            {kingdom.parcelCount} parcels owned
          </div>
        )}
      </div>

      {/* Hex grid — parchment frame */}
      <div className={styles.parchmentFrame}>
        <img
          src="/sprites/parchment-map.png"
          alt=""
          className={styles.parchmentImage}
        />
        <div className={styles.hexGridWrapper}>
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
        <CloudDrift />
        <TorchOverlay />
      </div>

      {/* Hold summary */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
            Your Hold
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
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(abilities)
                  .filter(([, count]) => count > 0)
                  .map(([id, count]) => (
                    <AbilityIcon key={id} tokenId={Number(id)} count={count} size={40} />
                  ))}
                {Object.values(abilities).every((c) => c === 0) && (
                  <div className="text-[10px] text-[#7a7060]">None</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Battles */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
            Battles
          </div>
          <div className="text-[11px] text-[#7a7060] leading-relaxed">
            Challenge another player to a staked 1v1 match.
          </div>
          <div className="flex gap-3">
            <Link
              href="/match-1v1/create"
              className="flex-1 text-center px-4 py-2 bg-[#c8a44e]/10 border-2 border-[#c8a44e]/60 text-[#c8a44e] rounded font-bold tracking-wider text-sm font-serif hover:bg-[#c8a44e]/20 hover:border-[#c8a44e] transition-all"
            >
              CREATE MATCH
            </Link>
            <Link
              href="/match-1v1/join"
              className="flex-1 text-center px-4 py-2 bg-[#252019] border border-[#3d3428] text-[#7a7060] rounded font-bold tracking-wider text-sm hover:text-[#c8a44e] hover:border-[#c8a44e]/50 transition-all"
            >
              JOIN MATCH
            </Link>
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
