"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "@/app/providers";
import { useMatchState, useRoundHistory, useMatchPlayers, useCommitmentStatus } from "@/lib/gameState";
import {
  generateSalt,
  computeAttackerCommitment,
  computeDefenderCommitment,
  storeSalt,
  storeMove,
  getSalt,
  getMove,
} from "@/lib/crypto";
import { commitMove, revealAttacker, revealDefender } from "@/lib/contracts";
import { VaultDisplay } from "@/components/VaultDisplay";
import { NodeMap } from "@/components/NodeMap";
import { PressurePointAllocator } from "@/components/PressurePointAllocator";
import { RoundHistory } from "@/components/RoundHistory";
import { MatchStatus } from "@/components/MatchStatus";
import { EndScreen } from "@/components/EndScreen";
import { Timer } from "@/components/Timer";
import { GateDisplay } from "@/components/GateDisplay";

const COMMIT_DEADLINE_OFFSET = 120; // seconds from round start

export default function GamePage() {
  const params = useParams();
  const matchId = params.id as string;
  const { account, address } = useAccount();

  const { state, loading } = useMatchState(matchId);
  const history = useRoundHistory(matchId);
  const players = useMatchPlayers(matchId);

  // Determine team/role from on-chain match state
  // Normalize addresses via BigInt to handle leading-zero differences
  // (Controller returns 0x05298f..., Torii returns 0x5298f...)
  const addrMatch = (a: string | undefined, b: string | undefined) => {
    if (!a || !b) return false;
    return BigInt(a) === BigInt(b);
  };
  let YOUR_TEAM: 1 | 2 = 1;
  let YOUR_ROLE: "attacker" | "defender" = "attacker";
  let roleFound = false;
  if (players && address) {
    if (addrMatch(players.teamAAttacker, address)) {
      YOUR_TEAM = 1;
      YOUR_ROLE = "attacker";
      roleFound = true;
    } else if (addrMatch(players.teamADefender, address)) {
      YOUR_TEAM = 1;
      YOUR_ROLE = "defender";
      roleFound = true;
    } else if (addrMatch(players.teamBAttacker, address)) {
      YOUR_TEAM = 2;
      YOUR_ROLE = "attacker";
      roleFound = true;
    } else if (addrMatch(players.teamBDefender, address)) {
      YOUR_TEAM = 2;
      YOUR_ROLE = "defender";
      roleFound = true;
    }
  }

  // Attacker: 6 slots (3 pressure points + 3 nodes)
  // Defender: 7 slots (3 pressure points + repair + 3 nodes)
  const slotCount = YOUR_ROLE === "attacker" ? 6 : 7;
  const [allocations, setAllocations] = useState<number[]>(new Array(6).fill(0));

  // Reset allocations when role is determined (async player load)
  useEffect(() => {
    setAllocations(new Array(slotCount).fill(0));
  }, [slotCount]);
  const [submitting, setSubmitting] = useState(false);
  const deadlineRef = useRef({ key: "", deadline: 0 });

  // On-chain commitment status — survives page reloads
  const { committed, revealed } = useCommitmentStatus(matchId, state?.round ?? 1, YOUR_TEAM, YOUR_ROLE);

  const budget = state ? (YOUR_TEAM === 1 ? state.team1Budget : state.team2Budget) : 10;

  const handleCommit = useCallback(async () => {
    if (!account || !state) return;
    const total = allocations.reduce((a, b) => a + b, 0);
    if (total !== budget) return;

    setSubmitting(true);
    try {
      const salt = generateSalt();
      storeSalt(matchId, state.round, salt);
      storeMove(matchId, state.round, allocations);

      let commitment: string;
      if (YOUR_ROLE === "attacker") {
        commitment = computeAttackerCommitment(
          salt,
          allocations[0],
          allocations[1],
          allocations[2],
          allocations[3],
          allocations[4],
          allocations[5],
        );
      } else {
        commitment = computeDefenderCommitment(
          salt,
          allocations[0],
          allocations[1],
          allocations[2],
          allocations[3],
          allocations[4],
          allocations[5],
          allocations[6],
        );
      }

      await commitMove(account, matchId, commitment);
    } catch (e) {
      console.error("Commit failed:", e);
    } finally {
      setSubmitting(false);
    }
  }, [account, state, allocations, budget, matchId, YOUR_ROLE]);

  const handleReveal = useCallback(async () => {
    if (!account || !state) return;
    setSubmitting(true);
    try {
      const salt = getSalt(matchId, state.round);
      const move = getMove(matchId, state.round);
      if (!salt || !move) throw new Error("Missing salt/move from localStorage");

      if (YOUR_ROLE === "attacker") {
        await revealAttacker(
          account,
          matchId,
          salt,
          [move[0].toString(), move[1].toString(), move[2].toString()],
          [move[3].toString(), move[4].toString(), move[5].toString()],
        );
      } else {
        await revealDefender(
          account,
          matchId,
          salt,
          [move[0].toString(), move[1].toString(), move[2].toString()],
          move[3].toString(),
          [move[4].toString(), move[5].toString(), move[6].toString()],
        );
      }
    } catch (e) {
      console.error("Reveal failed:", e);
    } finally {
      setSubmitting(false);
    }
  }, [account, state, matchId, YOUR_ROLE]);

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#6a6a7a] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  if (players && address && !roleFound) {
    return (
      <div className="max-w-lg mx-auto mt-20 space-y-4 text-center">
        <div className="text-[#ff3344] text-lg font-bold">NOT A PLAYER IN THIS MATCH</div>
        <div className="text-[#6a6a7a] text-sm">
          Your address: <span className="font-mono text-[#e0e0e8]">{address}</span>
        </div>
        <div className="text-[#6a6a7a] text-xs space-y-1">
          <div>
            Team A Atk: <span className="font-mono">{players.teamAAttacker}</span>
          </div>
          <div>
            Team A Def: <span className="font-mono">{players.teamADefender}</span>
          </div>
          <div>
            Team B Atk: <span className="font-mono">{players.teamBAttacker}</span>
          </div>
          <div>
            Team B Def: <span className="font-mono">{players.teamBDefender}</span>
          </div>
        </div>
      </div>
    );
  }

  // End screen
  if (state.phase === "finished" && state.winner) {
    return (
      <EndScreen
        winner={state.winner as 1 | 2}
        yourTeam={YOUR_TEAM}
        history={history}
        team1Vault={state.team1Vault}
        team2Vault={state.team2Vault}
      />
    );
  }

  const yourVault = YOUR_TEAM === 1 ? state.team1Vault : state.team2Vault;
  const enemyVault = YOUR_TEAM === 1 ? state.team2Vault : state.team1Vault;
  const phaseKey = `${state.round}-${state.phase}`;
  if (deadlineRef.current.key !== phaseKey) {
    deadlineRef.current = { key: phaseKey, deadline: Math.floor(Date.now() / 1000) + COMMIT_DEADLINE_OFFSET };
  }
  const deadline = deadlineRef.current.deadline;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Status bar */}
      <MatchStatus phase={state.phase} round={state.round} budget={budget} />

      {/* Fortresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VaultDisplay label="Your Fortress" hp={yourVault} />
        <VaultDisplay label="Enemy Fortress" hp={enemyVault} isEnemy />
      </div>

      {/* Gates */}
      <GateDisplay yourTeam={YOUR_TEAM} yourRole={YOUR_ROLE} lastRound={history.length > 0 ? history[0] : null} />

      {/* Nodes */}
      <NodeMap nodes={state.nodes} />

      {/* Allocation (only during committing phase) */}
      {state.phase === "committing" && !committed && (
        <PressurePointAllocator role={YOUR_ROLE} budget={budget} allocations={allocations} onChange={setAllocations} />
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div>
          {state.phase === "committing" && !committed && (
            <button
              onClick={handleCommit}
              disabled={submitting || allocations.reduce((a, b) => a + b, 0) !== budget}
              className="px-6 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {submitting ? "COMMITTING..." : "COMMIT MOVE"}
            </button>
          )}
          {state.phase === "committing" && committed && (
            <span className="text-green-400 text-sm">✓ Move committed — waiting for others</span>
          )}
          {state.phase === "revealing" && !revealed && (
            <button
              onClick={handleReveal}
              disabled={submitting}
              className="px-6 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors text-sm disabled:opacity-30"
            >
              {submitting ? "REVEALING..." : "REVEAL MOVE"}
            </button>
          )}
          {state.phase === "revealing" && revealed && (
            <span className="text-green-400 text-sm">✓ Move revealed — waiting for resolution</span>
          )}
          {state.phase === "resolving" && <span className="text-[#6a6a7a] text-sm">⟳ Resolving round...</span>}
        </div>
        <div className="text-sm">
          Timer: <Timer deadline={deadline} />
        </div>
      </div>

      {/* Round history */}
      <RoundHistory history={history} yourTeam={YOUR_TEAM} />

      {/* Salt warning */}
      <div className="text-[10px] text-[#2a2a3a] text-center">
        ⚠ Your move salts are stored in localStorage. Clearing browser data before reveal = lost move.
      </div>
    </div>
  );
}
