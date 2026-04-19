"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "@/app/providers";
import { AbilityIcon } from "./AbilityIcon";
import { useMatchEscrow, useClaimCandidates, settleMatch, claimParcel } from "@/lib/stakedMatch";
import { extractErrorMsg } from "@/lib/contracts1v1";
import { usePlayerKingdom } from "@/lib/worldState";
import { tierName } from "@/lib/tiers";

interface MatchEndActionsProps {
  matchId: string;
  winner: 0 | 1 | 2; // 0 = draw
  isPlayerA: boolean;
  isPlayerB: boolean;
  playerAAddr: string;
  playerBAddr: string;
  vaultAHp: number;
  vaultBHp: number;
  roundsPlayed: number;
}

const PARCEL_TYPE_LABELS = ["Forge", "Quarry", "Grove"] as const;
const PARCEL_TYPE_COLORS = ["#b87333", "#8a8a9a", "#4a7c59"] as const;

function ParcelBadge({ type, col, row }: { type: number; col: number; row: number }) {
  const isUntyped = type === 255;
  const label = isUntyped ? "Unclaimed" : (PARCEL_TYPE_LABELS[type] ?? `Type ${type}`);
  return (
    <div className="flex flex-col items-center gap-0.5 border border-[#3d3428] rounded px-2 py-1.5 bg-[#1a1714] min-w-[72px]">
      <span className={`text-[10px] font-serif tracking-wider ${isUntyped ? "text-[#7a7060]" : "text-[#c8a44e]"}`}>{label}</span>
      <span className="text-[10px] text-[#7a7060] font-mono">
        ({col},{row})
      </span>
    </div>
  );
}

function StakeRow({ label, ids }: { label: string; ids: [number, number, number] }) {
  const owned = ids.filter((id) => id > 0);
  return (
    <div className="flex items-center justify-between border border-[#3d3428] rounded p-2 bg-[#1a1714]">
      <span className="text-[10px] tracking-wider text-[#7a7060] uppercase">{label}</span>
      {owned.length === 0 ? (
        <span className="text-[10px] text-[#7a7060] italic">none</span>
      ) : (
        <div className="flex items-center gap-1">
          {ids.map((id, i) => (id > 0 ? <AbilityIcon key={i} tokenId={id} count={1} size={28} /> : null))}
        </div>
      )}
    </div>
  );
}

export function MatchEndActions({
  matchId,
  winner,
  isPlayerA,
  isPlayerB,
  playerAAddr,
  playerBAddr,
  vaultAHp,
  vaultBHp,
  roundsPlayed,
}: MatchEndActionsProps) {
  const { account, address } = useAccount();
  const isDraw = winner === 0;
  const didWin = (winner === 1 && isPlayerA) || (winner === 2 && isPlayerB);

  const winnerAddr = winner === 1 ? playerAAddr : winner === 2 ? playerBAddr : null;
  const isParticipant = isPlayerA || isPlayerB;

  const escrow = useMatchEscrow(matchId);
  const winnerKingdom = usePlayerKingdom(didWin ? (address ?? null) : null);
  const {
    candidates,
    atCap,
    nonHomeCount,
    parcelCap,
    loading: candidatesLoading,
  } = useClaimCandidates(didWin ? winnerAddr : null, winnerKingdom.tier, winnerKingdom.parcelCount);

  const [settling, setSettling] = useState(false);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [txError, setTxError] = useState("");

  const onSettle = async () => {
    if (!account) return;
    setSettling(true);
    setTxError("");
    try {
      await settleMatch(account, matchId);
    } catch (e) {
      setTxError(extractErrorMsg(e));
    } finally {
      setSettling(false);
    }
  };

  const onClaim = async () => {
    if (!account || selectedCandidate === null || selectedType === null) return;
    setClaiming(selectedCandidate);
    setTxError("");
    try {
      await claimParcel(account, matchId, selectedCandidate, selectedType);
      setClaimed(selectedCandidate);
    } catch (e) {
      setTxError(extractErrorMsg(e));
    } finally {
      setClaiming(null);
    }
  };

  const title = isDraw ? "DRAW" : didWin ? "VICTORY" : "DEFEAT";
  const titleColor = isDraw ? "text-[#daa520]" : didWin ? "text-[#c8a44e]" : "text-[#ff3344]";

  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/95 z-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="text-center space-y-6 max-w-md w-full px-4">
        <div className="space-y-2">
          <div className={`text-6xl font-bold tracking-widest font-serif ${titleColor}`}>{title}</div>
          {didWin && !isDraw && (
            <div className="text-[#7a7060] text-xs tracking-wider">
              {tierName(winnerKingdom.tier).toUpperCase()}
              <span className="mx-2">·</span>
              {winnerKingdom.totalWins} wins
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="border border-[#3d3428] rounded p-3 bg-[#1a1714]">
            <div className="text-[#7a7060] text-xs mb-1">Your Vault</div>
            <div className="text-xl font-bold">{isPlayerA ? vaultAHp : vaultBHp} HP</div>
          </div>
          <div className="border border-[#3d3428] rounded p-3 bg-[#1a1714]">
            <div className="text-[#7a7060] text-xs mb-1">Enemy Vault</div>
            <div className="text-xl font-bold">{isPlayerA ? vaultBHp : vaultAHp} HP</div>
          </div>
        </div>
        <div className="text-[#7a7060] text-xs">{roundsPlayed} rounds played</div>

        {escrow.loaded && escrow.isStaked && (
          <div className="space-y-2">
            <div className="text-[10px] tracking-wider text-[#c8a44e] uppercase font-serif">⚔ Stakes ⚔</div>
            <StakeRow label={isPlayerA ? "Your wager" : "Opponent wager"} ids={escrow.a} />
            <StakeRow label={isPlayerA ? "Opponent wager" : "Your wager"} ids={escrow.b} />
          </div>
        )}

        {isParticipant && escrow.loaded && escrow.exists && !escrow.settled && (
          <div className="space-y-2">
            <button
              onClick={onSettle}
              disabled={settling || !account}
              className="w-full py-3 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] rounded hover:bg-[#c8a44e]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed font-serif"
            >
              {settling ? "SETTLING..." : "SETTLE MATCH"}
            </button>
            <div className="text-[10px] text-[#7a7060] leading-snug">
              {escrow.isStaked
                ? didWin
                  ? "Claim the escrowed abilities, release loser's furthest parcel, and record the win."
                  : isDraw
                    ? "Return escrowed stakes to both players."
                    : "Return escrowed stakes; opponent takes any wagered abilities."
                : "Record the win, release loser's furthest parcel, and update reputation."}
            </div>
          </div>
        )}

        {didWin && escrow.loaded && escrow.settled && claimed === null && (
          <div className="space-y-2">
            <div className="text-[10px] tracking-wider text-[#c8a44e] uppercase font-serif">Claim a Parcel</div>
            {atCap ? (
              <div className="text-[11px] text-[#7a7060] border border-[#3d3428] rounded p-3 bg-[#1a1714]">
                Parcel cap reached ({nonHomeCount}/{parcelCap}). Upgrade your Hold to claim more.
              </div>
            ) : candidatesLoading ? (
              <div className="text-[11px] text-[#7a7060]">Scanning Marches...</div>
            ) : candidates.length === 0 ? (
              <div className="text-[11px] text-[#7a7060] border border-[#3d3428] rounded p-3 bg-[#1a1714]">
                No unclaimed parcels adjacent to your territory.
              </div>
            ) : (
              <>
                <div className="text-[10px] text-[#7a7060] mb-1">Select a parcel location:</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {candidates.map((p) => (
                    <button
                      key={p.parcelId}
                      onClick={() => { setSelectedCandidate(p.parcelId); setSelectedType(null); }}
                      disabled={claiming !== null}
                      className={`disabled:opacity-40 hover:scale-105 transition-transform disabled:cursor-not-allowed rounded ${
                        selectedCandidate === p.parcelId ? "ring-2 ring-[#c8a44e]" : ""
                      }`}
                    >
                      <ParcelBadge type={p.parcelType} col={p.col} row={p.row} />
                    </button>
                  ))}
                </div>

                {selectedCandidate !== null && (
                  <div className="space-y-2 mt-3">
                    <div className="text-[10px] text-[#7a7060]">Choose parcel type:</div>
                    <div className="flex gap-2 justify-center">
                      {PARCEL_TYPE_LABELS.map((label, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedType(i)}
                          disabled={claiming !== null}
                          className={`px-3 py-1.5 rounded border text-[11px] tracking-wider font-serif transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            selectedType === i
                              ? "border-[#c8a44e] bg-[#c8a44e]/20 text-[#c8a44e]"
                              : "border-[#3d3428] bg-[#1a1714] text-[#7a7060] hover:border-[#5a5040]"
                          }`}
                          style={selectedType === i ? { borderColor: PARCEL_TYPE_COLORS[i] } : undefined}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCandidate !== null && selectedType !== null && (
                  <button
                    onClick={onClaim}
                    disabled={claiming !== null}
                    className="w-full py-2 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] rounded hover:bg-[#c8a44e]/20 transition-colors tracking-wider text-[11px] font-serif disabled:opacity-30 disabled:cursor-not-allowed mt-2"
                  >
                    {claiming !== null ? "CLAIMING..." : `CLAIM AS ${PARCEL_TYPE_LABELS[selectedType].toUpperCase()}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {claimed !== null && (
          <div className="text-[11px] text-[#c8a44e] border border-[#c8a44e]/40 rounded p-3 bg-[#c8a44e]/5">
            Parcel {claimed} claimed. The Marches widen.
          </div>
        )}

        {txError && (
          <div className="text-[11px] text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5 break-all">
            {txError}
          </div>
        )}

        <Link
          href="/"
          className="inline-block px-8 py-3 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] rounded hover:bg-[#c8a44e]/20 transition-colors tracking-wider text-sm"
        >
          RETURN HOME
        </Link>
      </div>
    </div>
  );
}
