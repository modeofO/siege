"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useWorldParcels, usePlayerKingdom, type ParcelData } from "@/lib/worldState";
import { HexGrid } from "@/components/HexGrid";
import { RegisterKingdom } from "@/components/RegisterKingdom";
import { fetchAllAbilityBalances } from "@/lib/abilityToken";
import { AbilityIcon } from "@/components/AbilityIcon";
import { FactionPanel } from "@/components/FactionPanel";
import { PresetDefensePanel } from "@/components/conquest/PresetDefensePanel";
import { ConquestModal } from "@/components/conquest/ConquestModal";
import {
  getAttackability,
  useConquestCooldown,
  useOwnerFactionIds,
  sameAddress,
} from "@/lib/conquest";
import { usePlayerFaction } from "@/lib/factions";
import { usePlayerCosmetics, useBulkPlayerCosmetics } from "@/lib/cosmetics";
import { WORLD_SYSTEM_ADDRESS } from "@/lib/contractAddresses";
import { resilientExecute } from "@/lib/controllerSession";
import { toriiSql, toNum } from "@/lib/toriiSql";
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
import { CIRCUITS } from "@/lib/forge/circuits";
import styles from "./parchment.module.css";
// RPC follows the active network (see lib/network) — a local copy here would
// keep using the build's endpoint after a switch, and had no katana branch.
import { RPC_URL } from "@/lib/network";


const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
};

function TorchOverlay() {
  const positions = [
    { top: "12%", left: "4%" },
    { top: "12%", right: "4%" },
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

function SnowEffect() {
  const flakes = Array.from({ length: 40 }, (_, i) => ({
    "--x": `${((i * 37 + 13) % 100)}%`,
    "--size": `${2 + ((i * 53 + 7) % 30) / 10}px`,
    "--opacity": `${0.5 + ((i * 71 + 3) % 40) / 100}`,
    "--dur": `${3.5 + ((i * 43 + 17) % 50) / 10}s`,
    "--del": `${-((i * 67 + 11) % 80) / 10}s`,
    "--drift": `${-20 + ((i * 29 + 5) % 40)}px`,
  }) as React.CSSProperties);

  return (
    <div className={styles.snowZone}>
      {flakes.map((style, i) => (
        <span key={i} className={styles.snowflake} style={style} />
      ))}
    </div>
  );
}

function RainEffect() {
  const drops = Array.from({ length: 40 }, (_, i) => ({
    "--x": `${((i * 41 + 7) % 100)}%`,
    "--len": `${8 + ((i * 59 + 13) % 14)}px`,
    "--opacity": `${0.3 + ((i * 37 + 19) % 40) / 100}`,
    "--dur": `${0.7 + ((i * 47 + 3) % 40) / 25}s`,
    "--del": `${-((i * 73 + 11) % 60) / 20}s`,
  }) as React.CSSProperties);

  return (
    <div className={styles.rainZone}>
      {drops.map((style, i) => (
        <span key={i} className={styles.raindrop} style={style} />
      ))}
    </div>
  );
}

function WindEffect() {
  const streaks = Array.from({ length: 15 }, (_, i) => ({
    "--y": `${8 + ((i * 47 + 13) % 84)}%`,
    "--len": `${10 + ((i * 53 + 7) % 16)}%`,
    "--opacity": `${0.25 + ((i * 31 + 3) % 25) / 100}`,
    "--dur": `${4 + ((i * 41 + 17) % 50) / 10}s`,
    "--del": `${-((i * 67 + 5) % 80) / 10}s`,
    "--wave": `${3 + ((i * 29 + 11) % 8)}px`,
    "--thick": `${1.5 + ((i * 43 + 3) % 20) / 10}px`,
  }) as React.CSSProperties);

  return (
    <div className={styles.windZone}>
      {streaks.map((style, i) => (
        <span key={i} className={styles.windStreak} style={style} />
      ))}
    </div>
  );
}

function DustEffect() {
  const motes = Array.from({ length: 45 }, (_, i) => ({
    "--y": `${3 + ((i * 43 + 11) % 94)}%`,
    "--rx": `${-2 + ((i * 61 + 7) % 40)}%`,
    "--size": `${2 + ((i * 59 + 7) % 40) / 10}px`,
    "--opacity": `${0.5 + ((i * 37 + 13) % 40) / 100}`,
    "--dur": `${4 + ((i * 47 + 3) % 60) / 10}s`,
    "--del": `${-((i * 71 + 17) % 90) / 10}s`,
    "--dx": `${-5 - ((i * 31 + 5) % 12)}vw`,
    "--dy": `${-20 + ((i * 53 + 19) % 40)}px`,
    "--dx2": `${-12 - ((i * 29 + 7) % 14)}vw`,
    "--dy2": `${-15 + ((i * 67 + 3) % 30)}px`,
    "--glow": `${2 + ((i * 41 + 9) % 4)}px`,
  }) as React.CSSProperties);

  return (
    <div className={styles.dustZone}>
      {motes.map((style, i) => (
        <span key={i} className={styles.dustMote} style={style} />
      ))}
    </div>
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

interface ActiveBattle {
  matchId: number;
  playerA: string;
  playerB: string;
  round: number;
  vaultAHp: number;
  vaultBHp: number;
  status: number;
}

function useActiveBattles(refreshKey: number): { battles: ActiveBattle[]; loading: boolean } {
  const [battles, setBattles] = useState<ActiveBattle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchBattles = async () => {
      const rows = await toriiSql<Record<string, unknown>>(
        `SELECT match_id, player_a, player_b, current_round, vault_a_hp, vault_b_hp, status FROM "siege_dojo-MatchState1v1" WHERE status = 'Active' ORDER BY match_id DESC LIMIT 20`
      );
      if (cancelled) return;
      setBattles(
        rows.map((r) => ({
          matchId: toNum(r.match_id),
          playerA: String(r.player_a ?? ""),
          playerB: String(r.player_b ?? ""),
          round: toNum(r.current_round),
          vaultAHp: toNum(r.vault_a_hp),
          vaultBHp: toNum(r.vault_b_hp),
          status: toNum(r.status),
        }))
      );
      setLoading(false);
    };
    void fetchBattles();
    const interval = setInterval(fetchBattles, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshKey]);

  return { battles, loading };
}

function truncAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "???";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WorldPage() {
  const { account, address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const { parcels, loading } = useWorldParcels(refreshKey);
  const kingdom = usePlayerKingdom(address || null, refreshKey);
  const [abilities, setAbilities] = useState<Record<number, number>>({});
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const ownerAddresses = parcels.map((p) => p.owner).filter((o) => o && o !== "0x0");
  const cosmeticsMap = useBulkPlayerCosmetics(ownerAddresses, refreshKey);
  const myCosmetics = usePlayerCosmetics(address ?? undefined, refreshKey);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const { battles, loading: battlesLoading } = useActiveBattles(refreshKey);

  // --- Conquest state ---
  const [selectedParcel, setSelectedParcel] = useState<ParcelData | null>(null);
  const [warCouncilOpen, setWarCouncilOpen] = useState(false);
  const { member } = usePlayerFaction(address ?? null);
  const myFactionId = member?.factionId ?? 0;
  const ownerFactionIds = useOwnerFactionIds(ownerAddresses);
  const conquestCooldown = useConquestCooldown(address ?? null);

  const myOwnedParcels = useMemo(
    () => (address ? parcels.filter((p) => sameAddress(p.owner, address)) : []),
    [parcels, address],
  );

  const attackableParcelIds = useMemo(() => {
    const ids = new Set<number>();
    if (!address) return ids;
    for (const p of parcels) {
      if (getAttackability(p, myOwnedParcels, myFactionId, ownerFactionIds).attackable) {
        ids.add(p.parcelId);
      }
    }
    return ids;
  }, [parcels, address, myOwnedParcels, myFactionId, ownerFactionIds]);

  const claimDrip = useCallback(async () => {
    if (!account) return;
    setClaiming(true);
    setClaimError("");
    try {
      await resilientExecute(account, {
        contractAddress: WORLD_SYSTEM_ADDRESS,
        entrypoint: "claim_drip",
        calldata: [],
      });
      refresh();
    } catch (e) {
      console.error("Claim drip failed:", e);
      setClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }, [account, refresh]);

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
    ? [kingdom.home0, kingdom.home1, kingdom.home2].map((id) => parcels.find((p) => p.parcelId === id)).filter(Boolean)
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
        <RegisterKingdom account={account} worldSystemAddress={WORLD_SYSTEM_ADDRESS} onRegistered={refresh} />
      )}

      {/* Map header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">THE MARCHES</h1>
        {kingdom.registered && <div className="text-xs text-[#7a7060]">{kingdom.parcelCount} parcels owned</div>}
      </div>

      {/* Hex grid — parchment frame */}
      <div className={styles.parchmentFrame}>
        <Image src="/sprites/parchment-map.png" alt="" fill priority sizes="100vw" className={styles.parchmentImage} />
        <SnowEffect />
        <RainEffect />
        <WindEffect />
        <DustEffect />
        <div className={styles.hexGridWrapper}>
          {parcels.length === 0 ? (
            <div className="text-center text-[#7a7060] py-12">World not initialized. No parcels found.</div>
          ) : (
            <HexGrid
              parcels={parcels}
              playerAddress={address}
              homeParcelIds={kingdom.registered ? [kingdom.home0, kingdom.home1, kingdom.home2] : []}
              cosmeticsMap={cosmeticsMap}
              selectedParcel={selectedParcel}
              onSelectParcel={setSelectedParcel}
              attackableParcelIds={kingdom.registered ? attackableParcelIds : undefined}
              attackRingsDimmed={conquestCooldown.remainingSeconds > 0}
            />
          )}
        </div>
        <CloudDrift />
        <TorchOverlay />
      </div>

      {/* Selection bar */}
      {kingdom.registered && selectedParcel && (
        <SelectionBar
          parcel={selectedParcel}
          isOwn={sameAddress(selectedParcel.owner, address)}
          attackability={getAttackability(selectedParcel, myOwnedParcels, myFactionId, ownerFactionIds)}
          cooldownRemaining={conquestCooldown.remainingSeconds}
          onOpenWarCouncil={() => setWarCouncilOpen(true)}
        />
      )}

      {/* Hold summary */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Your Hold</div>

          <div className="grid grid-cols-3 gap-4">
            {/* Home parcels */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Home Parcels</div>
              <div className="flex gap-2">
                {homeParcelTypes.map((p, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 rounded text-[10px] font-bold border border-[#daa520]/30"
                    style={{
                      color: p ? { 0: "#b87333", 1: "#8a8a9a", 2: "#4a7c59" }[p.parcelType as 0 | 1 | 2] : "#7a7060",
                    }}
                  >
                    {p ? PARCEL_TYPE_NAMES[p.parcelType] : "?"}
                  </div>
                ))}
              </div>
            </div>

            {/* Hold decoration */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Hold Crest</div>
              {myCosmetics?.holdDecoration && CIRCUITS[myCosmetics.holdDecoration] ? (
                <div className="flex justify-center">
                  <ArcaneSeal
                    circuit={CIRCUITS[myCosmetics.holdDecoration]}
                    name={myCosmetics.holdDecoration}
                    size={120}
                  />
                </div>
              ) : (
                <div className="text-[10px] text-[#7a7060]">None equipped</div>
              )}
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

          {/* Claim drip button */}
          <div className="pt-2 border-t border-[#3d3428]">
            <button
              onClick={claimDrip}
              disabled={claiming}
              className="w-full px-4 py-2 bg-[#daa520]/10 border border-[#daa520]/50 text-[#daa520] rounded font-bold tracking-wider text-xs font-serif hover:bg-[#daa520]/20 hover:border-[#daa520] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claiming ? "CLAIMING..." : "CLAIM RESOURCES"}
            </button>
            {claimError && (
              <div className="mt-1 text-[10px] text-red-400">{claimError}</div>
            )}
          </div>
        </div>
      )}

      {/* Standing defenses */}
      {kingdom.registered && (
        <PresetDefensePanel account={account} address={address} tier={kingdom.tier} refresh={refresh} />
      )}

      {/* Battles */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Battles</div>
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

      {/* Live Battles */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Live Battles</div>
          {battlesLoading ? (
            <div className="text-[11px] text-[#7a7060] animate-pulse">Loading...</div>
          ) : battles.length === 0 ? (
            <div className="text-[11px] text-[#7a7060]">No active battles</div>
          ) : (
            <div className="space-y-2">
              {battles.map((b) => {
                const aPct = Math.max(0, Math.min(100, (b.vaultAHp / 50) * 100));
                const bPct = Math.max(0, Math.min(100, (b.vaultBHp / 50) * 100));
                return (
                  <Link
                    key={b.matchId}
                    href={`/match-1v1/${b.matchId}/spectate`}
                    className="block border border-[#3d3428] rounded p-2 hover:border-[#c8a44e]/50 hover:bg-[#252019] transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#7a7060]">#{b.matchId}</span>
                        <span className="text-xs text-[#d4cfc6]">
                          {truncAddr(b.playerA)} vs {truncAddr(b.playerB)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#7a7060]">R{b.round}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-[#252019] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${aPct > 50 ? "bg-green-500" : aPct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${aPct}%` }}
                        />
                      </div>
                      <div className="flex-1 h-1.5 bg-[#252019] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${bPct > 50 ? "bg-green-500" : bPct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${bPct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Faction panel */}
      {kingdom.registered && <FactionPanel account={account} address={address} kingdom={kingdom} refresh={refresh} />}

      {/* War Council modal */}
      {warCouncilOpen && selectedParcel && (
        <ConquestModal
          account={account}
          attacker={address}
          target={selectedParcel}
          myOwnedParcels={myOwnedParcels}
          abilities={abilities}
          onClose={() => {
            setWarCouncilOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

interface SelectionBarProps {
  parcel: ParcelData;
  isOwn: boolean;
  attackability: ReturnType<typeof getAttackability>;
  cooldownRemaining: number;
  onOpenWarCouncil: () => void;
}

function SelectionBar({ parcel, isOwn, attackability, cooldownRemaining, onOpenWarCouncil }: SelectionBarProps) {
  const typeName = PARCEL_TYPE_NAMES[parcel.parcelType] ?? "Untyped";
  const coords = `(${parcel.col}, ${parcel.row})`;

  if (isOwn) {
    return (
      <div className="border border-[#daa520]/30 rounded-lg bg-[#1a1714] px-4 py-3 flex items-center justify-between">
        <div className="text-[11px] text-[#d4cfc6]">
          <span className="text-[#daa520] font-serif font-bold">{typeName}</span> {coords} — your holding
        </div>
        <span className="text-[10px] text-[#7a7060] tracking-wider uppercase">Yours</span>
      </div>
    );
  }

  if (!attackability.attackable) {
    return (
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] px-4 py-3 flex items-center justify-between">
        <div className="text-[11px] text-[#7a7060]">
          <span className="text-[#d4cfc6] font-serif">{typeName}</span> {coords}
        </div>
        <span className="text-[10px] text-[#7a7060] tracking-wider uppercase">{attackability.reason}</span>
      </div>
    );
  }

  const onCooldown = cooldownRemaining > 0;

  return (
    <div className="border border-[#c44332]/40 rounded-lg bg-[#1a1714] px-4 py-3 flex items-center justify-between gap-4">
      <div className="text-[11px] text-[#d4cfc6]">
        <span className="text-[#c44332] font-serif font-bold">{typeName}</span> {coords} — raidable border
      </div>
      {onCooldown ? (
        <span className="text-[10px] text-[#7a7060] tracking-wider uppercase shrink-0">
          Next assault in {formatCountdown(cooldownRemaining)}
        </span>
      ) : (
        <button
          onClick={onOpenWarCouncil}
          className="shrink-0 px-4 py-1.5 rounded text-[11px] font-bold tracking-wider font-serif border border-[#c44332] text-[#c44332] hover:bg-[#c44332]/15 transition-colors"
        >
          OPEN WAR COUNCIL
        </button>
      )}
    </div>
  );
}
