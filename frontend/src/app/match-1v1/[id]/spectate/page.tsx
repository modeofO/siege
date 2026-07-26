// frontend/src/app/match-1v1/[id]/spectate/page.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useRoundModifiers1v1,
  useMatchStakes1v1,
  MODIFIER_NAMES,
} from "@/lib/gameState1v1";
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";
import { BattlefieldView } from "@/components/BattlefieldView";
import { BattleAnimation } from "@/components/BattleAnimation";
import { MatchStakesHeader } from "@/components/MatchStakesHeader";
import { HoldStatusStrip } from "@/components/HoldStatusStrip";
import { usePlayerCosmetics } from "@/lib/cosmetics";
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
import { CIRCUITS } from "@/lib/forge/circuits";
import { ABILITIES } from "@/lib/craftingContracts";

/* ------------------------------------------------------------------ */
/*  RoundHistorySection — reusable war dispatch log for spectator view */
/* ------------------------------------------------------------------ */

function RoundHistorySection({ history }: { history: RoundResult1v1[] }) {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714]">
      <div className="px-4 pt-3 pb-2">
        <span className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif">War Dispatch Log</span>
      </div>
      {history.length === 0 ? (
        <div className="px-4 pb-3 text-sm text-[#7a7060]">No rounds played yet</div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {history.map((r: RoundResult1v1) => {
            const dmgToB = r.damageToB;
            const dmgToA = r.damageToA;
            const aTraps = r.aTraps;
            const bTraps = r.bTraps;
            const aTrapDmg = aTraps.filter((t) => t > 0).length * 5;
            const bTrapDmg = bTraps.filter((t) => t > 0).length * 5;
            const aTotalDealt = dmgToB + aTrapDmg;
            const bTotalDealt = dmgToA + bTrapDmg;
            const isExpanded = expandedRounds.has(r.round);
            const gateNames = ["East", "West", "Underground"];

            return (
              <div key={r.round} className="border-t border-[#252019]">
                <button
                  onClick={() => toggleRound(r.round)}
                  className="w-full px-4 py-2 flex items-center justify-between text-xs hover:bg-[#252019] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[#7a7060] text-[10px]">{isExpanded ? "▼" : "▶"}</span>
                    <span className="text-[#d4cfc6] font-bold">R{r.round}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#c8a44e]">A: {aTotalDealt} dmg</span>
                    <span className="text-[#7a7060]">/</span>
                    <span className="text-[#ff3344]">B: {bTotalDealt} dmg</span>
                  </div>
                </button>

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
                        return (
                          <div key={i} className="bg-[#252019] rounded p-2 space-y-1 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[#d4cfc6] font-bold">{gateNames[i]}</span>
                              {gate.modifier !== 0 && <span className={`${modColor} text-[10px]`}>{modName}</span>}
                            </div>
                            <div className="text-[#7a7060]">
                              A: {gate.attackA} atk / {gate.defenseA} def
                            </div>
                            <div className="text-[#7a7060]">
                              B: {gate.attackB} atk / {gate.defenseB} def
                            </div>
                            <div>
                              {gate.dmgToB > 0 && <span className="text-[#c8a44e]">A deals {gate.dmgToB} </span>}
                              {gate.dmgToA > 0 && <span className="text-[#ff3344]">B deals {gate.dmgToA}</span>}
                              {gate.dmgToA === 0 && gate.dmgToB === 0 && <span className="text-[#7a7060]">0</span>}
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
                            const aTrap = r.aTraps[ni];
                            const bTrap = r.bTraps[ni];
                            if (aTrap) {
                              return (
                                <div key={`at${ni}`} className="text-[#daa520]">
                                  A trapped {nodeNames[ni]} — B takes{" "}
                                  <span className="text-[#ff3344] font-bold">5 damage</span> if they captured it
                                </div>
                              );
                            }
                            if (bTrap) {
                              return (
                                <div key={`bt${ni}`} className="text-[#ff3344]">
                                  B trapped {nodeNames[ni]} — A takes{" "}
                                  <span className="font-bold">5 damage</span> if they captured it
                                </div>
                              );
                            }
                            return null;
                          });
                        })()}
                      </div>
                    )}
                    {(r.aAbilityId > 0 || r.bAbilityId > 0) && (
                      <div className="text-xs border-t border-[#3d3428] pt-2 space-y-1">
                        <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Abilities Used</div>
                        {(() => {
                          const abilityGateNames = ["East Gate", "West Gate", "Underground Gate"];
                          const getAbilityName = (id: number) => ABILITIES[id - 1]?.name || `Ability #${id}`;
                          return (
                            <>
                              {r.aAbilityId > 0 && (
                                <div className="text-[#c8a44e]">
                                  A used <span className="font-bold">{getAbilityName(r.aAbilityId)}</span>
                                  {r.aAbilityTarget > 0 && ` on ${abilityGateNames[r.aAbilityTarget - 1] || `target ${r.aAbilityTarget}`}`}
                                </div>
                              )}
                              {r.bAbilityId > 0 && (
                                <div className="text-[#ff8800]">
                                  B used <span className="font-bold">{getAbilityName(r.bAbilityId)}</span>
                                  {r.bAbilityTarget > 0 && ` on ${abilityGateNames[r.bAbilityTarget - 1] || `target ${r.bAbilityTarget}`}`}
                                </div>
                              )}
                            </>
                          );
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
  );
}

/* ------------------------------------------------------------------ */
/*  SpectatorPage — read-only view of a live 1v1 match                */
/* ------------------------------------------------------------------ */

export default function SpectatorPage() {
  const params = useParams();
  const matchId = params.id as string;

  const { state, loading, refreshKey } = useMatchState1v1(matchId);
  const history = useRoundHistory1v1(matchId);
  const roundStatus = useRoundStatus1v1(matchId, state?.round ?? 1, refreshKey);
  const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);
  const matchStakes = useMatchStakes1v1(matchId, refreshKey);

  const cosmeticsA = usePlayerCosmetics(state?.playerA ?? undefined);
  const cosmeticsB = usePlayerCosmetics(state?.playerB ?? undefined);

  const [pendingResult, setPendingResult] = useState<RoundResult1v1 | null>(null);
  const [heldHp, setHeldHp] = useState<{ a: number; b: number } | null>(null);
  const [prevNodes, setPrevNodes] = useState<[NodeOwner, NodeOwner, NodeOwner]>(["neutral", "neutral", "neutral"]);
  const prevRoundRef = useRef<number>(0);

  useEffect(() => {
    if (!state || !history.length) return;
    const currentRound = state.round;
    if (prevRoundRef.current > 0 && currentRound > prevRoundRef.current) {
      const justResolved = history.find((r) => r.round === prevRoundRef.current);
      if (justResolved) {
        setHeldHp({ a: state.vaultAHp + justResolved.damageToA, b: state.vaultBHp + justResolved.damageToB });
        setPendingResult(justResolved);
      }
    }
    if (currentRound !== prevRoundRef.current) {
      setPrevNodes(state.nodes);
      prevRoundRef.current = currentRound;
    }
  }, [state?.round, history, state]);

  const handleResolutionComplete = useCallback(() => {
    setPendingResult(null);
    setHeldHp(null);
  }, []);

  // Loading
  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  const displayAHp = heldHp ? heldHp.a : state.vaultAHp;
  const displayBHp = heldHp ? heldHp.b : state.vaultBHp;
  const vaultAPct = Math.max(0, Math.min(100, (displayAHp / 50) * 100));
  const vaultBPct = Math.max(0, Math.min(100, (displayBHp / 50) * 100));
  const hpBarColor = (pct: number) => (pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500");

  // SAFETY CRITICAL: Only derive allocations from fully resolved rounds.
  // During commit/reveal we show the previous round's state, never partial reveals.
  const lastResolved = history.length > 0 ? history[0] : null;
  const aAllocations = lastResolved
    ? [...lastResolved.aAttack, ...lastResolved.aDefense, 0, ...Array(3).fill(0), ...lastResolved.aTraps]
    : new Array(13).fill(0);
  const bAllocations = lastResolved
    ? [...lastResolved.bAttack, ...lastResolved.bDefense, 0, ...Array(3).fill(0), ...lastResolved.bTraps]
    : new Array(13).fill(0);

  // Phase status text — neutral language
  let phaseText = "";
  if (state.phase === "committing") {
    if (roundStatus.commitCount === 0) {
      phaseText = "Both players committing...";
    } else {
      phaseText = `Waiting for commits (${roundStatus.commitCount}/2)...`;
    }
  } else if (state.phase === "revealing") {
    phaseText = `Waiting for reveals (${roundStatus.revealCount}/2)...`;
  } else if (state.phase === "resolving") {
    phaseText = "Round resolving...";
  } else if (state.phase === "finished") {
    phaseText = "Match finished";
  }

  // Determine winner label
  const isFinished = state.phase === "finished" && state.winner !== null;
  let winnerLabel = "";
  if (isFinished) {
    if (state.winner === 1) winnerLabel = "Player A wins";
    else if (state.winner === 2) winnerLabel = "Player B wins";
    else winnerLabel = "Draw";
  }

  return (
    <div className="space-y-2 max-w-7xl mx-auto">
      {/* ===== 1. HEADER BANNER ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] space-y-0 panel-header">
        {/* Row 1: Title, round, match ID, spectating badge */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-wider font-serif">SIEGE</span>
            <span className="text-sm font-bold text-[#d4cfc6] bg-[#252019] px-2 py-0.5 rounded">
              Round {state.round}
            </span>
            <span className="text-xs text-[#7a7060]">#{matchId}</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold tracking-wider px-2 py-0.5 rounded border"
              style={{ color: "#ff8800", borderColor: "rgba(255,136,0,0.4)", backgroundColor: "rgba(255,136,0,0.1)" }}
            >
              SPECTATING
            </span>
          </div>
        </div>

        {/* Finished banner */}
        {isFinished && (
          <div className="px-4 pb-2">
            <div className="border border-[#c8a44e]/30 rounded-lg bg-[#c8a44e]/5 px-4 py-3 text-center space-y-1">
              <div className="text-xl font-bold tracking-wider font-serif text-[#c8a44e]">MATCH COMPLETE</div>
              <div className="text-sm font-bold text-[#d4cfc6]">{winnerLabel}</div>
              <div className="text-xs text-[#7a7060]">{history.length} round{history.length !== 1 ? "s" : ""} played</div>
            </div>
          </div>
        )}

        {/* Row 2: Citadels as centerpieces with HP bars below */}
        <div className="grid grid-cols-2 gap-6 px-4 pb-3">
          {/* Player A Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const bannerKey = cosmeticsA?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Player A Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(200,164,78,0.3)]"
            />
            <span className="text-xs tracking-wider text-[#c8a44e] uppercase font-bold mt-1">Player A</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${vaultAPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {displayAHp} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(vaultAPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(vaultAPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${vaultAPct}%` }}
                />
              </div>
            </div>
          </div>
          {/* Player B Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const bannerKey = cosmeticsB?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Player B Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(255,51,68,0.3)]"
              style={{ filter: "hue-rotate(340deg) saturate(1.5)" }}
            />
            <span className="text-xs tracking-wider text-[#ff3344] uppercase font-bold mt-1">Player B</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${vaultBPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {displayBHp} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(vaultBPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(vaultBPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${vaultBPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 1b. STAKES + HOLD STATUS ===== */}
      <MatchStakesHeader stakes={matchStakes} isPlayerA={true} />
      <HoldStatusStrip playerA={state.playerA} playerB={state.playerB} isPlayerA={true} refreshKey={refreshKey} />

      {/* ===== 2. BATTLEFIELD + WAR LOG (side-by-side) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2">
        {/* Left: Animated Battlefield */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <BattlefieldView
              allocations={aAllocations}
              isPlayerA={true}
              committed={true}
              modifiers={modifiers}
              opponentAllocations={bAllocations}
            >
              {pendingResult && heldHp && (
                <BattleAnimation
                  result={pendingResult}
                  prevNodes={prevNodes}
                  newNodes={state.nodes}
                  isPlayerA={true}
                  heldHp={heldHp}
                  onComplete={handleResolutionComplete}
                />
              )}
            </BattlefieldView>
          </div>

          {/* War Dispatch Log */}
          <RoundHistorySection history={history} />
        </div>

        {/* Right: Phase status panel (no controls) */}
        <div className="flex flex-col gap-2">
          <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] flex-1">
            <div className="p-3 flex flex-col items-center justify-center gap-3 h-full min-h-[200px]">
              {/* Phase status */}
              <span
                className={`text-sm tracking-wide ${state.phase === "finished" ? "text-[#c8a44e]" : "text-[#7a7060] animate-pulse"}`}
              >
                {phaseText}
              </span>

              {/* Node ownership summary */}
              {state.nodes.some((n) => n !== "neutral") && (
                <div className="flex items-center gap-3 mt-2">
                  {["Forge", "Quarry", "Grove"].map((name, i) => {
                    const owner = state.nodes[i];
                    const color =
                      owner === "teamA"
                        ? "text-[#c8a44e] border-[#c8a44e]/30"
                        : owner === "teamB"
                          ? "text-[#ff3344] border-[#ff3344]/30"
                          : "text-[#7a7060] border-[#3d3428]";
                    const label = owner === "teamA" ? "A" : owner === "teamB" ? "B" : "-";
                    return (
                      <div key={name} className={`flex flex-col items-center gap-0.5 px-2 py-1 border rounded ${color}`}>
                        <span className="text-[9px] text-[#7a7060]">{name}</span>
                        <span className="text-xs font-bold">{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Match info */}
              <div className="text-[10px] text-[#7a7060] space-y-1 text-center mt-4">
                <div>Player A budget: <span className="text-[#d4cfc6] font-bold">{state.budgetA}</span></div>
                <div>Player B budget: <span className="text-[#d4cfc6] font-bold">{state.budgetB}</span></div>
              </div>

              {/* Finished summary */}
              {isFinished && (
                <div className="mt-4 border-t border-[#3d3428] pt-4 w-full text-center space-y-2">
                  <div className="text-lg font-bold font-serif text-[#c8a44e]">{winnerLabel}</div>
                  <div className="flex justify-center gap-6 text-sm">
                    <div>
                      <span className="text-[#7a7060]">A: </span>
                      <span className="text-[#d4cfc6] font-bold">{state.vaultAHp} HP</span>
                    </div>
                    <div>
                      <span className="text-[#7a7060]">B: </span>
                      <span className="text-[#d4cfc6] font-bold">{state.vaultBHp} HP</span>
                    </div>
                  </div>
                  <div className="text-xs text-[#7a7060]">
                    {history.length} round{history.length !== 1 ? "s" : ""} played
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-[#3d3428] text-center pb-4">
        Spectator view — read-only. Allocations shown only after round resolution.
      </div>
    </div>
  );
}
