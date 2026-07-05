import { describe, it, expect } from "vitest";
import { detectDeviation } from "../bluff";
import type { OpponentProfile, PhaseProfile } from "../profile";
import type { ReplayedRound } from "../types";
import type { PlayerMove } from "@/lib/resolution1v1";

const MOVE0: PlayerMove = {
  attack: [0, 0, 0],
  defense: [0, 0, 0],
  repair: 0,
  nodeContest: [0, 0, 0],
  traps: [0, 0, 0],
  abilityId: 0,
  abilityTarget: 0,
};

function rr(round: number, attack: [number, number, number]): ReplayedRound {
  return {
    round,
    move: { ...MOVE0, attack },
    hpBefore: 50,
    nodesBefore: 0,
  };
}

function emptyPhase(): PhaseProfile {
  return {
    rounds: 0,
    atkShareByGate: [0, 0, 0],
    defShareByGate: [0, 0, 0],
    avgAttackTotal: 0,
    avgDefenseTotal: 0,
    avgRepair: 0,
    avgContest: 0,
  };
}

function phaseWith(atkShareByGate: [number, number, number], rounds = 5): PhaseProfile {
  return { ...emptyPhase(), rounds, atkShareByGate };
}

function profile(phases: Partial<OpponentProfile["phases"]>): OpponentProfile {
  return {
    matchesAnalyzed: 1,
    roundsAnalyzed: 10,
    phases: {
      early: emptyPhase(),
      mid: emptyPhase(),
      endgame: emptyPhase(),
      ...phases,
    },
    trapRate: 0,
    repairWhenLowShare: 0,
    abilityRounds: {},
    winRate: 0,
  };
}

describe("detectDeviation", () => {
  it("scores 0 when rounds match the profile exactly", () => {
    const p = profile({ early: phaseWith([0.5, 0.5, 0]) });
    // Each round's attack-share is exactly [0.5, 0.5, 0].
    const current = [rr(1, [2, 2, 0]), rr(2, [3, 3, 0])];
    const reading = detectDeviation(current, p);
    expect(reading.score).toBe(0);
    expect(reading.sample).toBe(2);
    expect(reading.note).toBe("Playing to type");
  });

  it("scores 1.0 for a fully inverted attack distribution and names the over-attacked gate", () => {
    // Profile always attacks gate 0 (East); current always attacks gate 1 (West).
    // L1([0,1,0],[1,0,0]) = 2 -> 0.5*2 = 1.0 per round -> mean 1.0.
    const p = profile({ early: phaseWith([1, 0, 0]) });
    const current = [rr(1, [0, 5, 0]), rr(2, [0, 3, 0])];
    const reading = detectDeviation(current, p);
    expect(reading.score).toBeCloseTo(1.0, 10);
    expect(reading.sample).toBe(2);
    expect(reading.note).toBe("Attacking West far more than usual");
  });

  it("names Underground with strong phrasing for a heavy gate-2 lean", () => {
    // Profile splits gate0/gate1; current attacks only gate2.
    // L1([0,0,1],[0.5,0.5,0]) = 2 -> 0.5*2 = 1.0 per round.
    const p = profile({ early: phaseWith([0.5, 0.5, 0]) });
    const current = [rr(1, [0, 0, 4]), rr(2, [0, 0, 6])];
    const reading = detectDeviation(current, p);
    expect(reading.score).toBeCloseTo(1.0, 10);
    expect(reading.note).toBe("Attacking Underground far more than usual");
  });

  it("uses softer phrasing below the strong threshold and names East", () => {
    // Profile [0.5,0.5,0]; current [0.6,0.4,0].
    // L1 = 0.2 -> 0.5*0.2 = 0.1 per round -> score 0.1 (< 0.4).
    const p = profile({ early: phaseWith([0.5, 0.5, 0]) });
    const current = [rr(1, [6, 4, 0]), rr(2, [6, 4, 0])];
    const reading = detectDeviation(current, p);
    expect(reading.score).toBeCloseTo(0.1, 10);
    expect(reading.note).toBe("Leaning on East more than usual");
  });

  it("skips zero-attack rounds (not comparable)", () => {
    const p = profile({ early: phaseWith([1, 0, 0]) });
    const current = [
      rr(1, [0, 5, 0]),
      rr(2, [0, 0, 0]), // zero attack -> skipped
      rr(3, [0, 5, 0]),
    ];
    const reading = detectDeviation(current, p);
    expect(reading.sample).toBe(2);
    expect(reading.score).toBeCloseTo(1.0, 10);
  });

  it("skips rounds whose phase has an empty (rounds===0) profile", () => {
    // early profile populated; endgame profile empty -> endgame round skipped.
    const p = profile({ early: phaseWith([1, 0, 0]) });
    const current = [
      rr(1, [0, 5, 0]),
      rr(2, [0, 5, 0]),
      rr(8, [0, 5, 0]), // endgame, empty profile -> skipped
    ];
    const reading = detectDeviation(current, p);
    expect(reading.sample).toBe(2);
    expect(reading.score).toBeCloseTo(1.0, 10);
  });

  it("returns Not enough data with fewer than 2 comparable rounds", () => {
    const p = profile({ early: phaseWith([1, 0, 0]) });
    const current = [rr(1, [0, 5, 0]), rr(2, [0, 0, 0])]; // only 1 comparable
    const reading = detectDeviation(current, p);
    expect(reading).toEqual({ score: 0, sample: 1, note: "Not enough data" });
  });

  it("returns Not enough data for empty input", () => {
    const reading = detectDeviation([], profile({ early: phaseWith([1, 0, 0]) }));
    expect(reading).toEqual({ score: 0, sample: 0, note: "Not enough data" });
  });
});
