// frontend/src/app/match-1v1/[id]/page.tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useAccount } from "@/app/providers";
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useCommitmentStatus1v1,
  useRoundModifiers1v1,
  useMatchAbilities1v1,
  MODIFIER_NAMES,
  MODIFIER_DESCRIPTIONS,
} from "@/lib/gameState1v1";
import type { RoundResult1v1 } from "@/lib/gameState1v1";
import { generateSalt, computeCommitment1v1, storeSalt1v1, storeMove1v1, getSalt1v1, getMove1v1 } from "@/lib/crypto";
import { commitMove1v1, revealMove1v1, extractErrorMsg } from "@/lib/contracts1v1";
import { useResourceBalances } from "@/lib/useResourceBalances";
import { AllocationForm1v1 } from "@/components/AllocationForm1v1";
import { MatchStakesHeader } from "@/components/MatchStakesHeader";
import { MatchEndActions } from "@/components/MatchEndActions";
import { HoldStatusStrip } from "@/components/HoldStatusStrip";
import { useMatchStakes1v1 } from "@/lib/gameState1v1";

export default function Match1v1Page() {
  const params = useParams();
  const matchId = params.id as string;
  const { account, address } = useAccount();

  const { state, loading, refresh, refreshKey } = useMatchState1v1(matchId);
  const history = useRoundHistory1v1(matchId);
  const resources = useResourceBalances(address);

  // Role detection
  const addrMatch = (a: string | undefined, b: string | undefined) => {
    if (!a || !b) return false;
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  };

  let isPlayerA = false;
  let isPlayerB = false;
  let role: 0 | 1 = 0;
  if (state && address) {
    isPlayerA = addrMatch(state.playerA, address);
    isPlayerB = addrMatch(state.playerB, address);
    role = isPlayerA ? 0 : 1;
  }
  const roleFound = isPlayerA || isPlayerB;

  // Commitment status from chain — refreshKey ensures these re-fetch when match state updates
  const { committed, revealed } = useCommitmentStatus1v1(matchId, state?.round ?? 1, role, refreshKey);

  // Round status for polling commit/reveal counts
  const roundStatus = useRoundStatus1v1(matchId, state?.round ?? 1, refreshKey);

  // Gate modifiers for current round
  const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);

  // Ability selection state
  const [selectedAbility, setSelectedAbility] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(0);

  const matchAbilities = useMatchAbilities1v1(matchId, address || null, state?.playerA || null, refreshKey);

  // Stakes for the match header (#4) — both sides' wagered abilities.
  const matchStakes = useMatchStakes1v1(matchId, refreshKey);

  const handleAbilitySelect = useCallback((abilityId: number, target: number) => {
    setSelectedAbility(abilityId);
    setSelectedTarget(target);
  }, []);

  // Reset ability selection when round changes
  useEffect(() => {
    setSelectedAbility(0);
    setSelectedTarget(0);
  }, [state?.round]);

  // Allocations: [p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2]
  const [allocations, setAllocations] = useState<number[]>(new Array(13).fill(0));
  const [submitting, setSubmitting] = useState(false);
  // After a commit tx resolves, we stay in `confirming` until Torii reports
  // the committed flag on-chain. Keeps the button disabled in a visibly
  // pending state during the ~5-10s indexing lag (issue #11).
  const [confirming, setConfirming] = useState(false);
  const [autoRevealStatus, setAutoRevealStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [autoRevealError, setAutoRevealError] = useState("");
  const [revealRetry, setRevealRetry] = useState(0);
  const autoRevealLock = useRef(false);
  const commitLock = useRef(false);
  const [error, setError] = useState("");
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const budget = state ? (isPlayerA ? state.budgetA : state.budgetB) : 10;

  // Reset state on round change
  useEffect(() => {
    setAllocations(new Array(13).fill(0));
    setAutoRevealStatus("idle");
    setAutoRevealError("");
    setRevealRetry(0);
    autoRevealLock.current = false;
    commitLock.current = false;
    setSubmitting(false);
    setConfirming(false);
    setError("");
  }, [state?.round]);

  // One-shot mount log — if this never appears in console after reload, the
  // page is serving a stale bundle and a hard refresh is needed.
  useEffect(() => {
    console.log("[siege] match-1v1 page loaded — reveal gate diagnostics v1");
  }, []);

  // Check if an error is a known recoverable case
  const isAlreadyRevealed = (msg: string) =>
    msg.includes("Already revealed") || msg.includes("416c72656164792072657665616c6564");

  // Auto-reveal: when both committed & we haven't revealed yet
  useEffect(() => {
    // Unconditional gate-state log so we can see WHY this effect returns early.
    // If no `[auto-reveal]` log appears at all, the code isn't loaded (stale bundle).
    console.log("[auto-reveal] gate check", {
      hasAccount: !!account,
      hasState: !!state,
      round: state?.round,
      committed,
      revealed,
      commitCount: roundStatus.commitCount,
      revealCount: roundStatus.revealCount,
      locked: autoRevealLock.current,
      status: autoRevealStatus,
    });

    if (!account || !state || !committed || revealed || roundStatus.commitCount < 2 || autoRevealLock.current) return;

    // Claim the lock BEFORE the salt check so this effect doesn't busy-spin
    // across poll refreshes when local data is missing.
    autoRevealLock.current = true;

    const salt = getSalt1v1(matchId, state.round);
    const move = getMove1v1(matchId, state.round);
    if (!salt || !move) {
      console.warn(
        `[auto-reveal] No local commit data for match ${matchId} round ${state.round}. ` +
          `This browser/tab did not store the salt — likely committed from a different device.`,
      );
      setAutoRevealStatus("error");
      setAutoRevealError(
        "Local commit data not found in this browser. Commits must be revealed from " +
          "the same browser they were made in. If you committed in another tab or device, " +
          "reopen the match there to reveal.",
      );
      return;
    }

    setAutoRevealStatus("pending");
    console.log(
      `[auto-reveal] starting reveal for match ${matchId} round ${state.round} (revealCount=${roundStatus.revealCount})`,
    );

    const abilityData = localStorage.getItem(`siege_1v1_ability_${matchId}_${state.round}`);
    const parsedAbility = abilityData ? JSON.parse(abilityData) : { abilityId: 0, abilityTarget: 0 };

    const attemptReveal = async (includeVrf: boolean, alreadyFlipped = false): Promise<void> => {
      try {
        await revealMove1v1(
          account,
          matchId,
          salt,
          move[0].toString(),
          move[1].toString(),
          move[2].toString(),
          move[3].toString(),
          move[4].toString(),
          move[5].toString(),
          move[6].toString(),
          move[7].toString(),
          move[8].toString(),
          move[9].toString(),
          move[10].toString(),
          move[11].toString(),
          move[12].toString(),
          parsedAbility.abilityId.toString(),
          parsedAbility.abilityTarget.toString(),
          includeVrf,
        );
      } catch (e) {
        const msg = extractErrorMsg(e);
        if (isAlreadyRevealed(msg)) {
          console.log("[auto-reveal] Already revealed — round progressed normally.");
          return;
        }
        // Race: we picked includeVrf based on the observed revealCount at
        // submit time, but chain state at inclusion can differ. Flip and
        // retry once.
        if (!alreadyFlipped) {
          console.log(
            `[auto-reveal] reveal failed with includeVrf=${includeVrf}, retrying with includeVrf=${!includeVrf}. Reason: ${msg}`,
          );
          return attemptReveal(!includeVrf, true);
        }
        throw e;
      }
    };

    const delay = 1000 + Math.random() * 2000;
    setTimeout(() => {
      (async () => {
        try {
          const isSecondReveal = roundStatus.revealCount >= 1;
          await attemptReveal(isSecondReveal);
          setAutoRevealStatus("done");
          setAutoRevealError("");
        } catch (e) {
          console.error("Auto-reveal failed:", e);
          setAutoRevealStatus("error");
          setAutoRevealError(extractErrorMsg(e));
        }
        void refresh();
      })();
    }, delay);
  }, [
    account,
    state,
    matchId,
    committed,
    revealed,
    roundStatus.commitCount,
    roundStatus.revealCount,
    refresh,
    revealRetry,
    autoRevealStatus,
  ]);

  const handleRetryReveal = useCallback(() => {
    autoRevealLock.current = false;
    setAutoRevealStatus("idle");
    setAutoRevealError("");
    setRevealRetry((c) => c + 1);
  }, []);

  // Commit handler
  const handleCommit = useCallback(async () => {
    if (!account || !state || commitLock.current) return;
    const trapCost = (allocations[10] + allocations[11] + allocations[12]) * 2;
    const total = allocations.slice(0, 10).reduce((a, b) => a + b, 0) + trapCost;
    if (total !== budget) return;

    commitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const salt = generateSalt();
      storeSalt1v1(matchId, state.round, salt);
      storeMove1v1(matchId, state.round, allocations);

      const commitment = computeCommitment1v1(
        salt,
        allocations[0],
        allocations[1],
        allocations[2],
        allocations[3],
        allocations[4],
        allocations[5],
        allocations[6],
        allocations[7],
        allocations[8],
        allocations[9],
        allocations[10],
        allocations[11],
        allocations[12],
        selectedAbility,
        selectedTarget,
      );

      await commitMove1v1(account, matchId, commitment);
      localStorage.setItem(
        `siege_1v1_ability_${matchId}_${state.round}`,
        JSON.stringify({ abilityId: selectedAbility, abilityTarget: selectedTarget }),
      );
      // Tx submitted — now wait for Torii to reflect `committed`. Button
      // stays disabled with a "CONFIRMING ON-CHAIN..." label until the
      // useEffect below flips `confirming` off.
      setSubmitting(false);
      setConfirming(true);
      void refresh();
    } catch (e) {
      console.error("Commit failed:", e);
      setError(extractErrorMsg(e));
      commitLock.current = false;
      setSubmitting(false);
    }
  }, [account, state, allocations, budget, matchId, refresh, selectedAbility, selectedTarget]);

  // Clear confirming once Torii reports the commit on-chain (ends the
  // 5-10s indexing lag where the button was previously re-enabling).
  useEffect(() => {
    if (committed && confirming) setConfirming(false);
  }, [committed, confirming]);

  // Loading
  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  // Not a player
  if (address && !roleFound) {
    return (
      <div className="max-w-lg mx-auto mt-20 space-y-4 text-center">
        <div className="text-[#ff3344] text-lg font-bold">NOT A PLAYER IN THIS MATCH</div>
        <div className="text-[#7a7060] text-sm">
          Your address: <span className="font-mono text-[#d4cfc6]">{address}</span>
        </div>
        <div className="text-[#7a7060] text-xs space-y-1">
          <div>
            Player A: <span className="font-mono">{state.playerA}</span>
          </div>
          <div>
            Player B: <span className="font-mono">{state.playerB}</span>
          </div>
        </div>
      </div>
    );
  }

  // End screen
  if (state.phase === "finished" && state.winner !== null) {
    const winnerNum = (state.winner === 0 || state.winner === 1 || state.winner === 2 ? state.winner : 0) as 0 | 1 | 2;
    return (
      <MatchEndActions
        matchId={matchId}
        winner={winnerNum}
        isPlayerA={isPlayerA}
        isPlayerB={isPlayerB}
        playerAAddr={state.playerA || ""}
        playerBAddr={state.playerB || ""}
        vaultAHp={state.vaultAHp}
        vaultBHp={state.vaultBHp}
        roundsPlayed={history.length}
      />
    );
  }

  const yourVault = isPlayerA ? state.vaultAHp : state.vaultBHp;
  const enemyVault = isPlayerA ? state.vaultBHp : state.vaultAHp;
  const yourPct = Math.max(0, Math.min(100, (yourVault / 50) * 100));
  const enemyPct = Math.max(0, Math.min(100, (enemyVault / 50) * 100));
  const hpBarColor = (pct: number) => (pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500");

  // Phase status text
  let phaseText = "";
  if (committed && !revealed && roundStatus.commitCount < 2) {
    phaseText = "Waiting for opponent to commit...";
  } else if (committed && !revealed && roundStatus.commitCount >= 2) {
    if (autoRevealStatus === "error") {
      phaseText = "Reveal failed — retry below";
    } else if (autoRevealStatus === "pending") {
      phaseText = "Auto-revealing your move...";
    } else {
      phaseText = "Preparing to reveal...";
    }
  } else if (committed && revealed && roundStatus.revealCount < 2) {
    phaseText = "Waiting for opponent to reveal...";
  } else if (state.phase === "resolving") {
    phaseText = "Resolving round...";
  }

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  return (
    <div className="space-y-2 max-w-4xl mx-auto">
      {/* ===== 1. HEADER BANNER ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] space-y-0 panel-header">
        {/* Row 1: Title, round, match ID, budget, player badge */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-wider font-serif">SIEGE</span>
            <span className="text-sm font-bold text-[#d4cfc6] bg-[#252019] px-2 py-0.5 rounded">
              Round {state.round}
            </span>
            <span className="text-xs text-[#7a7060]">#{matchId}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#daa520] font-bold text-sm">{budget} pts</span>
            <span className="text-[10px] text-[#7a7060] border border-[#3d3428] rounded px-2 py-0.5">
              Player {isPlayerA ? "A" : "B"}
            </span>
          </div>
        </div>

        {/* Row 2: Citadels as centerpieces with HP bars below */}
        <div className="grid grid-cols-2 gap-6 px-4 pb-3">
          {/* Your Citadel */}
          <div className="flex flex-col items-center">
            <Image
              src="/sprites/citadel.png"
              alt="Your Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(200,164,78,0.3)]"
            />
            <span className="text-xs tracking-wider text-[#c8a44e] uppercase font-bold mt-1">Your Citadel</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${yourPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {yourVault} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(yourPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(yourPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${yourPct}%` }}
                />
              </div>
            </div>
          </div>
          {/* Enemy Citadel */}
          <div className="flex flex-col items-center">
            <Image
              src="/sprites/citadel.png"
              alt="Enemy Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(255,51,68,0.3)]"
              style={{ filter: "hue-rotate(340deg) saturate(1.5)" }}
            />
            <span className="text-xs tracking-wider text-[#ff3344] uppercase font-bold mt-1">Enemy Citadel</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span
                  className={`text-sm font-bold ${enemyPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}
                >
                  {enemyVault} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(enemyPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(enemyPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${enemyPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 1b. STAKES + HOLD STATUS ===== */}
      <MatchStakesHeader stakes={matchStakes} isPlayerA={isPlayerA} />
      <HoldStatusStrip playerA={state.playerA} playerB={state.playerB} isPlayerA={isPlayerA} refreshKey={refreshKey} />

      {/* ===== 2. BATTLEFIELD PANEL ===== */}
      <div className="border border-[#3d3428] rounded-lg p-3 bg-[#1a1714]">
        <div className="text-[10px] tracking-wider text-[#7a7060] uppercase mb-2 font-serif">Battlefield</div>

        {/* Fortress Gates — East | Underground (main) | West */}
        {(() => {
          const gateConfig = [
            { idx: 0, name: "East Gate", sprite: "/sprites/gate-east.png" },
            { idx: 2, name: "Underground", sprite: "/sprites/gate-underground.png" },
            { idx: 1, name: "West Gate", sprite: "/sprites/gate-west.png" },
          ];
          return (
            <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-2">
              {gateConfig.map(({ idx, name, sprite }) => {
                const mod = modifiers[idx];
                const modName = MODIFIER_NAMES[mod] || "Normal";
                const modDesc = MODIFIER_DESCRIPTIONS[mod] || "";
                const modColor =
                  mod === 0
                    ? "text-[#7a7060]"
                    : mod === 1
                      ? "text-[#daa520]"
                      : mod === 2
                        ? "text-[#c8a44e]"
                        : mod === 3
                          ? "text-[#ff3344]"
                          : "text-[#ff8800]";
                const modBorder =
                  mod === 0
                    ? "border-[#3d3428]"
                    : mod === 1
                      ? "border-[#daa520]/30"
                      : mod === 2
                        ? "border-[#c8a44e]/30"
                        : mod === 3
                          ? "border-[#ff3344]/30"
                          : "border-[#ff8800]/30";
                const modGlow =
                  mod === 0
                    ? ""
                    : mod === 1
                      ? "shadow-[inset_0_0_12px_rgba(255,215,0,0.08)]"
                      : mod === 2
                        ? "shadow-[inset_0_0_12px_rgba(200,164,78,0.08)]"
                        : mod === 3
                          ? "shadow-[inset_0_0_12px_rgba(255,51,68,0.08)]"
                          : "shadow-[inset_0_0_12px_rgba(255,136,0,0.08)]";
                const isMain = idx === 2;
                const hasModifier = mod !== 0;
                return (
                  <div
                    key={idx}
                    className={`rounded-lg text-center flex flex-col items-center justify-end gap-1 p-2 ${hasModifier ? `bg-[#252019]/50 border border-[#3d3428] ${modGlow}` : ""}`}
                  >
                    <Image
                      src={sprite}
                      alt={name}
                      width={isMain ? 176 : 128}
                      height={isMain ? 176 : 128}
                      className={`object-contain rounded-xl ${isMain ? "w-44 h-44" : "w-32 h-32"}`}
                    />
                    <div
                      className={`font-bold font-serif ${isMain ? "text-sm text-[#d4cfc6]" : "text-xs text-[#d4cfc6]"}`}
                    >
                      {name}
                    </div>
                    <div className={`text-xs font-bold ${modColor}`}>{modName}</div>
                    {modDesc && <div className="text-[10px] text-[#7a7060] leading-tight">{modDesc}</div>}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ===== 3. RESOURCES BAR ===== */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#1a1714] border border-[#3d3428] rounded-lg overflow-x-auto">
        <span className="text-[10px] tracking-wider text-[#7a7060] uppercase shrink-0 mr-2">Resources</span>
        {[
          { label: "Iron", value: resources.iron, color: "text-[#a0a0b0]" },
          { label: "Linen", value: resources.linen, color: "text-[#d4a574]" },
          { label: "Stone", value: resources.stone, color: "text-[#8a8a9a]" },
          { label: "Wood", value: resources.wood, color: "text-[#8b6914]" },
          { label: "Ember", value: resources.ember, color: "text-[#ff6633]" },
          { label: "Seeds", value: resources.seeds, color: "text-[#66cc66]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1 px-2 py-0.5 bg-[#252019] rounded text-xs shrink-0">
            <span className={`font-bold ${color}`}>{value}</span>
            <span className="text-[10px] text-[#7a7060]">{label}</span>
          </div>
        ))}
      </div>

      {/* ===== 4. DEPLOYMENT PANEL ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714]">
        {state.phase === "committing" && (!committed || confirming) ? (
          <AllocationForm1v1
            budget={budget}
            allocations={allocations}
            onChange={setAllocations}
            onCommit={handleCommit}
            submitting={submitting}
            confirming={confirming}
            error={error}
            nodes={state.nodes}
            isPlayerA={isPlayerA}
            abilities={matchAbilities.abilities}
            abilitiesUsed={matchAbilities.used}
            selectedAbility={selectedAbility}
            selectedTarget={selectedTarget}
            onAbilitySelect={handleAbilitySelect}
          />
        ) : (
          <div className="p-3 flex flex-col items-center justify-center gap-2">
            {phaseText ? (
              <span
                className={`text-sm tracking-wide ${autoRevealStatus === "error" ? "text-[#ff9944]" : "text-[#7a7060] animate-pulse"}`}
              >
                {phaseText}
              </span>
            ) : (
              <span className="text-[#7a7060] text-xs">Awaiting next phase...</span>
            )}
            {autoRevealStatus === "error" && (
              <>
                {autoRevealError && (
                  <span className="text-[10px] text-[#7a7060] font-mono max-w-full truncate px-2">
                    {autoRevealError}
                  </span>
                )}
                <button
                  onClick={handleRetryReveal}
                  className="px-4 py-1.5 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] text-xs tracking-wider rounded hover:bg-[#c8a44e]/20 transition-colors"
                >
                  RETRY REVEAL
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && !state.phase && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">{error}</div>
      )}

      {/* ===== 5. WAR DISPATCH LOG ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714]">
        <div className="px-4 pt-3 pb-2">
          <span className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif">War Dispatch Log</span>
        </div>
        {history.length === 0 ? (
          <div className="px-4 pb-3 text-sm text-[#7a7060]">No rounds played yet</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {history.map((r: RoundResult1v1) => {
              const gateDmgDealt = isPlayerA ? r.damageToB : r.damageToA;
              const gateDmgTaken = isPlayerA ? r.damageToA : r.damageToB;
              const myTraps = isPlayerA ? r.aTraps : r.bTraps;
              const theirTraps = isPlayerA ? r.bTraps : r.aTraps;
              const myTrapDmg = myTraps.filter((t) => t > 0).length * 5;
              const theirTrapDmg = theirTraps.filter((t) => t > 0).length * 5;
              const dmgDealt = gateDmgDealt + myTrapDmg;
              const dmgTaken = gateDmgTaken + theirTrapDmg;
              const isExpanded = expandedRounds.has(r.round);
              const gateNames = ["East", "West", "Underground"];

              return (
                <div key={r.round} className="border-t border-[#252019]">
                  {/* Summary row — always visible, clickable */}
                  <button
                    onClick={() => toggleRound(r.round)}
                    className="w-full px-4 py-2 flex items-center justify-between text-xs hover:bg-[#252019] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[#7a7060] text-[10px]">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                      <span className="text-[#d4cfc6] font-bold">R{r.round}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">+{dmgDealt} dealt</span>
                      {myTrapDmg > 0 && <span className="text-[#daa520]">(trap +{myTrapDmg})</span>}
                      <span className="text-[#7a7060]">/</span>
                      <span className="text-red-400">-{dmgTaken} taken</span>
                      {theirTrapDmg > 0 && <span className="text-[#ff3344]">(trap -{theirTrapDmg})</span>}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {r.gateBreakdown.map((gate, i) => {
                          const modName = MODIFIER_NAMES[gate.modifier] || "Normal";
                          const modColor =
                            gate.modifier === 0
                              ? "text-[#7a7060]"
                              : gate.modifier === 1
                                ? "text-[#daa520]"
                                : gate.modifier === 2
                                  ? "text-[#c8a44e]"
                                  : gate.modifier === 3
                                    ? "text-[#ff3344]"
                                    : "text-[#ff8800]";
                          const myDmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
                          const myDmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
                          return (
                            <div key={i} className="bg-[#252019] rounded p-2 space-y-1 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-[#d4cfc6] font-bold">{gateNames[i]}</span>
                                {gate.modifier !== 0 && <span className={`${modColor} text-[10px]`}>{modName}</span>}
                              </div>
                              <div className="text-[#7a7060]">
                                You: {isPlayerA ? gate.attackA : gate.attackB} atk /{" "}
                                {isPlayerA ? gate.defenseA : gate.defenseB} def
                              </div>
                              <div className="text-[#7a7060]">
                                Them: {isPlayerA ? gate.attackB : gate.attackA} atk /{" "}
                                {isPlayerA ? gate.defenseB : gate.defenseA} def
                              </div>
                              <div>
                                {myDmgDealt > 0 && <span className="text-green-400">+{myDmgDealt} </span>}
                                {myDmgTaken > 0 && <span className="text-red-400">-{myDmgTaken}</span>}
                                {myDmgDealt === 0 && myDmgTaken === 0 && <span className="text-[#7a7060]">0</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(r.aTraps.some((t) => t > 0) || r.bTraps.some((t) => t > 0)) && (
                        <div className="text-xs border-t border-[#3d3428] pt-2 space-y-1">
                          <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Node Traps</div>
                          {(() => {
                            const nodeNames = ["Forge", "Quarry", "Grove"];
                            return [0, 1, 2].map((ni) => {
                              const myTrap = isPlayerA ? r.aTraps[ni] : r.bTraps[ni];
                              const theirTrap = isPlayerA ? r.bTraps[ni] : r.aTraps[ni];
                              if (myTrap) {
                                return (
                                  <div key={`mt${ni}`} className="text-[#daa520]">
                                    You trapped {nodeNames[ni]} — opponent takes{" "}
                                    <span className="text-[#ff3344] font-bold">5 damage</span> if they captured it
                                  </div>
                                );
                              }
                              if (theirTrap) {
                                return (
                                  <div key={`tt${ni}`} className="text-[#ff3344]">
                                    Enemy trapped {nodeNames[ni]}! You take <span className="font-bold">5 damage</span>{" "}
                                    if you captured it
                                  </div>
                                );
                              }
                              return null;
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] text-[#3d3428] text-center pb-4">
        Move data stored in localStorage until revealed. Auto-reveal triggers when both players commit.
      </div>
    </div>
  );
}
