import { abilityType } from "@/lib/resolution1v1";
import type { ReplayedMatch } from "./types";

export type Phase = "early" | "mid" | "endgame";

/** 1-3 early, 4-6 mid, 7+ endgame. */
export function phaseOf(round: number): Phase {
  if (round <= 3) return "early";
  if (round <= 6) return "mid";
  return "endgame";
}

export interface PhaseProfile {
  rounds: number; // sample size
  atkShareByGate: [number, number, number]; // sums to 1 (or all 0 if no attack)
  defShareByGate: [number, number, number];
  avgAttackTotal: number; // mean attack points per round
  avgDefenseTotal: number;
  avgRepair: number; // mean repair HP per round
  avgContest: number; // mean node-contest points per round
}

export interface OpponentProfile {
  matchesAnalyzed: number;
  roundsAnalyzed: number;
  phases: Record<Phase, PhaseProfile>;
  trapRate: number; // traps armed / rounds where they owned >=1 node
  repairWhenLowShare: number; // budget share on repair in rounds entered below 30 HP
  abilityRounds: Record<number, number[]>; // abilityType (1-5) -> rounds used (any tier)
  winRate: number; // wins / decided matches (draws excluded); 0 if none
}

// Cairo-pinned budget: 10 + owned nodes + endgame escalation (rounds 7-10+).
function budgetFor(round: number, nodesBefore: number): number {
  return 10 + nodesBefore + Math.max(0, round - 6);
}

// Mutable accumulator for a single phase.
interface PhaseAccum {
  rounds: number;
  atk: [number, number, number];
  def: [number, number, number];
  atkTotal: number;
  defTotal: number;
  repair: number;
  contest: number;
}

function emptyAccum(): PhaseAccum {
  return {
    rounds: 0,
    atk: [0, 0, 0],
    def: [0, 0, 0],
    atkTotal: 0,
    defTotal: 0,
    repair: 0,
    contest: 0,
  };
}

function shareOf(sums: [number, number, number], total: number): [number, number, number] {
  if (total <= 0) return [0, 0, 0];
  return [sums[0] / total, sums[1] / total, sums[2] / total];
}

function finalizePhase(a: PhaseAccum): PhaseProfile {
  const n = a.rounds;
  return {
    rounds: n,
    atkShareByGate: shareOf(a.atk, a.atkTotal),
    defShareByGate: shareOf(a.def, a.defTotal),
    avgAttackTotal: n === 0 ? 0 : a.atkTotal / n,
    avgDefenseTotal: n === 0 ? 0 : a.defTotal / n,
    avgRepair: n === 0 ? 0 : a.repair / n,
    avgContest: n === 0 ? 0 : a.contest / n,
  };
}

const sum3 = (v: [number, number, number]): number => v[0] + v[1] + v[2];

export function buildProfile(matches: ReplayedMatch[]): OpponentProfile {
  const accums: Record<Phase, PhaseAccum> = {
    early: emptyAccum(),
    mid: emptyAccum(),
    endgame: emptyAccum(),
  };

  let roundsAnalyzed = 0;

  // Trap rate: numerator = rounds with >=1 trap armed, denominator = rounds
  // entered owning >=1 node (can't trap unowned nodes).
  let trapArmed = 0;
  let trapEligible = 0;

  // Repair-when-low: budget share spent on repair in rounds entered below 30 HP.
  let lowRepairSpend = 0;
  let lowBudget = 0;

  const abilityRounds: Record<number, number[]> = {};

  for (const m of matches) {
    for (const r of m.rounds) {
      roundsAnalyzed += 1;
      const acc = accums[phaseOf(r.round)];
      const mv = r.move;

      acc.rounds += 1;
      for (let g = 0; g < 3; g++) {
        acc.atk[g] += mv.attack[g];
        acc.def[g] += mv.defense[g];
      }
      acc.atkTotal += sum3(mv.attack);
      acc.defTotal += sum3(mv.defense);
      acc.repair += mv.repair;
      acc.contest += sum3(mv.nodeContest);

      if (r.nodesBefore >= 1) {
        trapEligible += 1;
        if (sum3(mv.traps) >= 1) trapArmed += 1;
      }

      if (r.hpBefore < 30) {
        lowRepairSpend += mv.repair * 2;
        lowBudget += budgetFor(r.round, r.nodesBefore);
      }

      if (mv.abilityId > 0) {
        const t = abilityType(mv.abilityId);
        (abilityRounds[t] ??= []).push(r.round);
      }
    }
  }

  for (const t of Object.keys(abilityRounds)) {
    abilityRounds[Number(t)].sort((x, y) => x - y);
  }

  const decided = matches.filter((m) => m.opponentWon !== null);
  const wins = decided.filter((m) => m.opponentWon === true).length;

  return {
    matchesAnalyzed: matches.length,
    roundsAnalyzed,
    phases: {
      early: finalizePhase(accums.early),
      mid: finalizePhase(accums.mid),
      endgame: finalizePhase(accums.endgame),
    },
    trapRate: trapEligible === 0 ? 0 : trapArmed / trapEligible,
    repairWhenLowShare: lowBudget === 0 ? 0 : lowRepairSpend / lowBudget,
    abilityRounds,
    winRate: decided.length === 0 ? 0 : wins / decided.length,
  };
}
