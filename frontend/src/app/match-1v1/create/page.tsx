// frontend/src/app/match-1v1/create/page.tsx
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { createMatch1v1, extractErrorMsg } from "@/lib/contracts1v1";
import { createStakedMatch, useAbilityBalances } from "@/lib/stakedMatch";
import { usePlayerKingdom } from "@/lib/worldState";
import { TIER_INFO, tierName } from "@/lib/tiers";
import { AbilityWagerPicker } from "@/components/AbilityWagerPicker";
import { lookupUsernames } from "@cartridge/controller";
import Link from "next/link";

import { toriiSql } from "@/lib/toriiSql";
// Canonical network-aware RPC (mainnet/katana/sepolia/devnet). The old local
// `NEXT_PUBLIC_RPC_URL || "http://localhost:5050"` fallback fetched localhost on
// Vercel and broke ability-balance loads.
import { RPC_URL } from "@/lib/dojoConfig";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMatchCounterValue(): Promise<number | null> {
  const rows = await toriiSql<{ count: number | string }>('SELECT count FROM "siege_dojo-MatchCounter" LIMIT 1');
  const count = rows[0]?.count;
  if (count == null) return null;
  return typeof count === "string" && count.startsWith("0x") ? parseInt(count, 16) : Number(count);
}

type Mode = "practice" | "staked";

export default function Create1v1Page() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";

  const [mode, setMode] = useState<Mode>("practice");
  const [opponentInput, setOpponentInput] = useState("");
  const [resolvedAddr, setResolvedAddr] = useState<string | null>(null);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHexAddress = (s: string) => /^0x[0-9a-fA-F]+$/.test(s);
  const opponentAddr = isHexAddress(opponentInput) ? opponentInput : resolvedAddr;

  const kingdom = usePlayerKingdom(address ?? null);
  // MatchStakes1v1 has 3 stake slots per side; world_system caps at 3 regardless of tier.
  const maxSlots = Math.min(TIER_INFO[kingdom.tier]?.abilitySlots ?? 1, 3);

  const rpcProvider = useMemo(() => new RpcProvider({ nodeUrl: RPC_URL }), []);
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
  } = useAbilityBalances(mode === "staked" ? rpcProvider : undefined, mode === "staked" ? address : null);

  useEffect(() => {
    if (mode !== "staked" || !kingdom.registered) {
      setSelectedIds([]);
    }
  }, [mode, kingdom.registered]);

  // Debounced username lookup
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const input = opponentInput.trim();
    setResolvedAddr(null);
    setResolvedUsername(null);
    if (!input || isHexAddress(input)) {
      setLookupLoading(false);
      return;
    }
    setLookupLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await lookupUsernames([input]);
        const addr = results.get(input);
        if (addr) {
          setResolvedAddr(addr);
          setResolvedUsername(input);
        }
      } catch (e) {
        console.error("[create] username lookup failed:", e);
      } finally {
        setLookupLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [opponentInput]);

  const stakedValid =
    mode === "staked" &&
    kingdom.registered &&
    !balancesError &&
    selectedIds.length >= 1 &&
    selectedIds.length <= maxSlots;

  const canCreate = !!account && !!address && !!opponentAddr && (mode === "practice" || stakedValid);

  const handleCreate = async () => {
    if (!account || !address || !opponentAddr) return;

    setLoading(true);
    setError("");

    try {
      const counterBefore = (await fetchMatchCounterValue()) ?? 0;

      if (mode === "staked") {
        await createStakedMatch(account, opponentAddr, selectedIds);
      } else {
        await createMatch1v1(account, address, opponentAddr);
      }

      for (let i = 0; i < 12; i++) {
        await sleep(2000);
        try {
          const counterNow = await fetchMatchCounterValue();
          if (counterNow !== null && counterNow > counterBefore) {
            setMatchId(String(counterNow));
            return;
          }
        } catch {
          // Torii may still be syncing
        }
      }

      setError("Transaction submitted but Torii has not indexed the match yet. Try refreshing.");
    } catch (e: unknown) {
      setError(extractErrorMsg(e));
    } finally {
      setLoading(false);
    }
  };

  if (matchId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-6">
        <div className="text-2xl font-bold text-[#ffd700]">
          {mode === "staked" ? "Staked Match Created" : "1v1 Match Created"}
        </div>
        <div className="text-sm text-[#6a6a7a]">
          {mode === "staked"
            ? "Your wager is escrowed. Share the match ID — your opponent must match your wager to begin."
            : "Share this match ID with your opponent:"}
        </div>
        <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 text-2xl font-bold">{matchId}</div>
        <Link
          href={`/match-1v1/${matchId}`}
          className="inline-block px-6 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded text-sm hover:bg-[#ffd700]/20 transition-colors"
        >
          GO TO MATCH →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-6">
      <h1 className="text-2xl font-bold tracking-wider">CREATE 1v1 MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to create a match
        </div>
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("practice")}
          className={`py-2 px-3 border rounded text-sm tracking-wider transition-colors ${
            mode === "practice"
              ? "border-[#ffd700] bg-[#ffd700]/10 text-[#ffd700]"
              : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#4a4a5a]"
          }`}
        >
          PRACTICE
        </button>
        <button
          onClick={() => setMode("staked")}
          className={`py-2 px-3 border rounded text-sm tracking-wider transition-colors ${
            mode === "staked"
              ? "border-[#c8a44e] bg-[#c8a44e]/10 text-[#c8a44e]"
              : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#4a4a5a]"
          }`}
        >
          STAKED
        </button>
      </div>
      <div className="text-xs text-[#6a6a7a] leading-relaxed -mt-3">
        {mode === "practice"
          ? "Practice match. No abilities wagered, no parcels transferred. Reputation unchanged until the winner settles."
          : "Stake 1–" +
            maxSlots +
            " ability tokens. Winner takes both sides' escrow. Losing releases your furthest-from-home parcel."}
      </div>

      {/* Opponent */}
      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Opponent</label>
        <input
          type="text"
          value={opponentInput}
          onChange={(e) => setOpponentInput(e.target.value)}
          placeholder="Username or wallet address (0x...)"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#ffd700] focus:outline-none transition-colors font-mono"
        />
        {lookupLoading && <div className="text-xs text-[#6a6a7a]">Looking up username...</div>}
        {resolvedUsername && resolvedAddr && (
          <div className="text-xs text-[#33cc66]">
            {resolvedUsername} →{" "}
            <span className="font-mono">
              {resolvedAddr.slice(0, 10)}...{resolvedAddr.slice(-6)}
            </span>
          </div>
        )}
        {!lookupLoading && opponentInput.trim() && !isHexAddress(opponentInput) && !resolvedAddr && (
          <div className="text-xs text-[#ff3344]">Username not found</div>
        )}
      </div>

      {/* Staked wager picker */}
      {mode === "staked" && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Your wager</label>
            <span className="text-[10px] text-[#7a7060]">
              {tierName(kingdom.tier)} · {selectedIds.length}/{maxSlots} slots
            </span>
          </div>

          {!kingdom.registered ? (
            <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
              Register your Hold in the Marches before staking abilities.{" "}
              <Link href="/world" className="underline">
                Go to Marches
              </Link>
            </div>
          ) : (
            <>
              {balancesError ? (
                <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5 break-all">
                  Could not load ability balances — check your RPC connection and refresh. ({balancesError})
                </div>
              ) : (
                <>
                  <AbilityWagerPicker
                    balances={balances}
                    selected={selectedIds}
                    maxSlots={maxSlots}
                    onChange={setSelectedIds}
                    balancesLoading={balancesLoading}
                  />
                  {!balancesLoading && selectedIds.length === 0 && (
                    <div className="text-[11px] text-[#7a7060]">Select at least 1 ability to wager.</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="text-xs text-[#6a6a7a] leading-relaxed">
        You will be Player A. Your opponent joins as Player B using the match ID.
      </div>

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={!canCreate || loading}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "CREATING..." : mode === "staked" ? "CREATE STAKED MATCH" : "CREATE 1v1 MATCH"}
      </button>
    </div>
  );
}
