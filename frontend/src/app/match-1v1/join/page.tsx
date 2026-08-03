"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useRouter, useSearchParams } from "next/navigation";
import { joinStakedMatch, useAbilityBalances, useMatchEscrow } from "@/lib/stakedMatch";
import { extractErrorMsg } from "@/lib/contracts1v1";
import { usePlayerKingdom } from "@/lib/worldState";
import { TIER_INFO, tierName } from "@/lib/tiers";
import { AbilityWagerPicker } from "@/components/AbilityWagerPicker";
import { AbilityIcon } from "@/components/AbilityIcon";
import { toriiSql, sqlU64 } from "@/lib/toriiSql";
import Link from "next/link";
// Canonical network-aware RPC (mainnet/katana/sepolia/devnet). The old local
// `NEXT_PUBLIC_RPC_URL || "http://localhost:5050"` fallback fetched localhost on
// Vercel and broke ability-balance loads.
import { RPC_URL } from "@/lib/dojoConfig";

function Join1v1PageInner() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [matchIdInput, setMatchIdInput] = useState(() => searchParams.get("id") ?? "");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alreadyInMatch, setAlreadyInMatch] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string | null>(null);

  const matchId = matchIdInput.trim() || null;
  const escrow = useMatchEscrow(matchId);
  const kingdom = usePlayerKingdom(address ?? null);

  useEffect(() => {
    if (!matchId || !address) { setAlreadyInMatch(false); setMatchStatus(null); return; }
    let cancelled = false;
    (async () => {
      const rows = await toriiSql<{ player_a: string; player_b: string; status: string }>(
        `SELECT player_a, player_b, status FROM "siege_dojo-MatchState1v1" WHERE match_id = ${sqlU64(matchId)}`,
      );
      if (cancelled) return;
      if (rows.length > 0) {
        const addrBig = BigInt(address);
        const isParticipant =
          BigInt(rows[0].player_a) === addrBig || BigInt(rows[0].player_b) === addrBig;
        // player_b is written at create_staked_match, so on a Pending match the
        // challenged player is a participant who has NOT joined yet — they need
        // the wager flow, not the rejoin shortcut.
        const isUnacceptedChallengee =
          String(rows[0].status) === "Pending" && BigInt(rows[0].player_b) === addrBig;
        setAlreadyInMatch(isParticipant && !isUnacceptedChallengee);
        setMatchStatus(String(rows[0].status));
      } else {
        setAlreadyInMatch(false);
        setMatchStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [matchId, address]);

  // A Pending match is a staked challenge by construction (only
  // create_staked_match makes Pending matches). Never treat it as practice —
  // that's the Torii-lag race that let players "join" without staking and
  // land on an unplayable board.
  const isPendingStaked = matchStatus === "Pending";
  const stakedFlow = escrow.isStaked || isPendingStaked;
  const wagerIndexed = escrow.loaded && escrow.isStaked;
  // MatchStakes1v1 has 3 stake slots per side; world_system caps at 3 regardless of tier.
  const maxSlots = Math.min(TIER_INFO[kingdom.tier]?.abilitySlots ?? 1, 3);

  const rpcProvider = useMemo(() => new RpcProvider({ nodeUrl: RPC_URL }), []);
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
  } = useAbilityBalances(escrow.isStaked ? rpcProvider : undefined, escrow.isStaked ? address : null);

  const aStakeCount = escrow.a.filter((x) => x > 0).length;

  const handleJoin = async () => {
    if (!matchId || !account) return;
    setError("");

    // Non-staked (Active) match — no on-chain join, just navigate.
    if (!stakedFlow) {
      router.push(`/match-1v1/${matchId}`);
      return;
    }

    if (!wagerIndexed) {
      setError("Challenger's wager is still indexing — wait a moment and try again.");
      return;
    }

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
      setError(extractErrorMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const canJoin =
    !!matchId &&
    isConnected &&
    !loading &&
    (!stakedFlow || (wagerIndexed && kingdom.registered && !balancesError && selectedIds.length >= 1));

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

      {/* Already in match — rejoin shortcut */}
      {matchId && alreadyInMatch && (
        <>
          <div className="text-[11px] text-[#66cc66] border border-[#66cc66]/30 rounded p-3 bg-[#66cc66]/5">
            You are already in this match. Rejoin to continue playing.
          </div>
          <button
            onClick={() => router.push(`/match-1v1/${matchId}`)}
            className="w-full py-3 bg-[#66cc66]/10 border border-[#66cc66]/40 text-[#66cc66] rounded hover:bg-[#66cc66]/20 transition-colors tracking-wider text-sm"
          >
            REJOIN MATCH
          </button>
        </>
      )}

      {/* Match info (once loaded) — only show join flow if NOT already in the match */}
      {!alreadyInMatch && (
        <>
          {matchId && escrow.loaded && !escrow.exists && !escrow.timedOut && !isPendingStaked && (
            <div className="text-[11px] text-[#7a7060] border border-[#3d3428] rounded p-3 bg-[#1a1714]">
              No stakes found for this ID — joining takes you straight to the match.
            </div>
          )}

          {isPendingStaked && !wagerIndexed && (
            <div className="text-[11px] text-[#c8a44e] border border-[#c8a44e]/40 rounded p-3 bg-[#1a1714]">
              Staked challenge found — loading the challenger&apos;s wager from the indexer...
            </div>
          )}

          {escrow.timedOut && !escrow.exists && (
            <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
              Could not load match data — Torii may be unreachable. Check your connection and refresh.
            </div>
          )}

          {escrow.isStaked && (
            <div className="space-y-3">
              <div className="border border-[#c8a44e]/40 rounded p-3 bg-[#1a1714] space-y-2">
                <div className="text-[10px] tracking-wider text-[#c8a44e] uppercase font-serif text-center">
                  ⚔ Challenger&apos;s Wager ⚔
                </div>
                <div className="flex items-center justify-center gap-2">
                  {escrow.a.map((id, i) => (id > 0 ? <AbilityIcon key={i} tokenId={id} count={1} size={32} /> : null))}
                </div>
                <div className="text-[10px] text-center text-[#7a7060]">
                  {aStakeCount} ability{aStakeCount === 1 ? "" : "s"} escrowed — match this to activate the game. Actual
                  wager = min(yours, theirs); excess is refunded.
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
                    <Link href="/world" className="underline">
                      Go to Marches
                    </Link>
                  </div>
                ) : balancesError ? (
                  <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5 break-all">
                    Could not load ability balances — check your RPC connection and refresh. ({balancesError})
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
            {loading ? "JOINING..." : stakedFlow ? "MATCH WAGER & JOIN" : "JOIN MATCH"}
          </button>
        </>
      )}
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the app router.
export default function Join1v1Page() {
  return (
    <Suspense fallback={null}>
      <Join1v1PageInner />
    </Suspense>
  );
}
