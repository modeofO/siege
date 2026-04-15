// frontend/src/app/match-1v1/join/page.tsx
"use client";

import { useState, useMemo } from "react";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useRouter } from "next/navigation";
import {
  joinStakedMatch,
  useAbilityBalances,
  useMatchEscrow,
} from "@/lib/stakedMatch";
import { usePlayerKingdom } from "@/lib/worldState";
import { TIER_INFO, tierName } from "@/lib/tiers";
import { AbilityWagerPicker } from "@/components/AbilityWagerPicker";
import { AbilityIcon } from "@/components/AbilityIcon";
import Link from "next/link";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:5050";

export default function Join1v1Page() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";
  const router = useRouter();

  const [matchIdInput, setMatchIdInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const matchId = matchIdInput.trim() || null;
  const escrow = useMatchEscrow(matchId);
  const kingdom = usePlayerKingdom(address ?? null);
  const maxSlots = TIER_INFO[kingdom.tier]?.abilitySlots ?? 1;

  const rpcProvider = useMemo(() => new RpcProvider({ nodeUrl: RPC_URL }), []);
  const { balances, loading: balancesLoading } = useAbilityBalances(
    escrow.isStaked ? rpcProvider : undefined,
    escrow.isStaked ? address : null,
  );

  const aStakeCount = escrow.a.filter((x) => x > 0).length;

  const handleJoin = async () => {
    if (!matchId || !account) return;
    setError("");

    // Practice match path — no on-chain join, just navigate.
    if (!escrow.isStaked) {
      router.push(`/match-1v1/${matchId}`);
      return;
    }

    // Staked: require caller to match wager before navigating.
    if (!kingdom.registered) {
      setError("Register your Hold in the Marches before joining a staked match.");
      return;
    }
    if (selectedIds.length < 1 || selectedIds.length > maxSlots) {
      setError(`Pick 1–${maxSlots} abilities to match the wager.`);
      return;
    }

    setLoading(true);
    try {
      const tx = await joinStakedMatch(account, matchId, selectedIds);
      await account.waitForTransaction(tx.transaction_hash, { retryInterval: 2000 });
      router.push(`/match-1v1/${matchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed");
    } finally {
      setLoading(false);
    }
  };

  const canJoin =
    !!matchId &&
    isConnected &&
    !loading &&
    (!escrow.isStaked || (kingdom.registered && selectedIds.length >= 1));

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-6">
      <h1 className="text-2xl font-bold tracking-wider">JOIN 1v1 MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to play.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Match ID</label>
        <input
          type="text"
          value={matchIdInput}
          onChange={(e) => setMatchIdInput(e.target.value)}
          placeholder="Enter match ID"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#ffd700] focus:outline-none transition-colors"
        />
      </div>

      {/* Match info (once loaded) */}
      {matchId && escrow.loaded && !escrow.exists && (
        <div className="text-[11px] text-[#7a7060] border border-[#3d3428] rounded p-3 bg-[#1a1714]">
          No staked match with this ID. If it&apos;s a practice match, you can proceed — the join is implicit.
        </div>
      )}

      {escrow.isStaked && (
        <div className="space-y-3">
          <div className="border border-[#c8a44e]/40 rounded p-3 bg-[#1a1714] space-y-2">
            <div className="text-[10px] tracking-wider text-[#c8a44e] uppercase font-serif text-center">
              ⚔ Challenger&apos;s Wager ⚔
            </div>
            <div className="flex items-center justify-center gap-2">
              {escrow.a.map((id, i) =>
                id > 0 ? <AbilityIcon key={i} tokenId={id} count={1} size={32} /> : null,
              )}
            </div>
            <div className="text-[10px] text-center text-[#7a7060]">
              {aStakeCount} ability{aStakeCount === 1 ? "" : "s"} escrowed — match this to activate the game.
              Actual wager = min(yours, theirs); excess is refunded.
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Your matching wager</label>
              <span className="text-[10px] text-[#7a7060]">
                {tierName(kingdom.tier)} · {selectedIds.length}/{maxSlots} slots
              </span>
            </div>
            {!kingdom.registered ? (
              <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
                Register your Hold in the Marches before staking.{" "}
                <Link href="/world" className="underline">Go to Marches</Link>
              </div>
            ) : (
              <AbilityWagerPicker
                balances={balances}
                selected={selectedIds}
                maxSlots={maxSlots}
                onChange={setSelectedIds}
                balancesLoading={balancesLoading}
              />
            )}
          </div>
        </div>
      )}

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleJoin}
        disabled={!canJoin}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading
          ? "JOINING..."
          : escrow.isStaked
            ? "MATCH WAGER & JOIN"
            : "JOIN MATCH"}
      </button>
    </div>
  );
}
