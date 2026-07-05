import { describe, it, expect } from "vitest";
import { phaseOf, buildProfile } from "../profile";
import type { ReplayedMatch, ReplayedRound } from "../types";
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

function move(partial: Partial<PlayerMove>): PlayerMove {
  return { ...MOVE0, ...partial };
}

function rr(
  round: number,
  partial: Partial<PlayerMove>,
  ctx?: { hpBefore?: number; nodesBefore?: number },
): ReplayedRound {
  return {
    round,
    move: move(partial),
    hpBefore: ctx?.hpBefore ?? 50,
    nodesBefore: ctx?.nodesBefore ?? 0,
  };
}

function match(
  matchId: string,
  rounds: ReplayedRound[],
  opponentWon: boolean | null = null,
): ReplayedMatch {
  return { matchId, rounds, opponentWon };
}

const EMPTY_SHARE: [number, number, number] = [0, 0, 0];

describe("phaseOf", () => {
  it("maps rounds to phases (>=7 all endgame)", () => {
    expect(phaseOf(1)).toBe("early");
    expect(phaseOf(3)).toBe("early");
    expect(phaseOf(4)).toBe("mid");
    expect(phaseOf(6)).toBe("mid");
    expect(phaseOf(7)).toBe("endgame");
    expect(phaseOf(10)).toBe("endgame");
    expect(phaseOf(15)).toBe("endgame");
  });
});

describe("buildProfile", () => {
  it("returns a zeroed profile for empty input", () => {
    const p = buildProfile([]);
    expect(p.matchesAnalyzed).toBe(0);
    expect(p.roundsAnalyzed).toBe(0);
    expect(p.trapRate).toBe(0);
    expect(p.repairWhenLowShare).toBe(0);
    expect(p.winRate).toBe(0);
    expect(p.abilityRounds).toEqual({});
    for (const phase of ["early", "mid", "endgame"] as const) {
      const pp = p.phases[phase];
      expect(pp.rounds).toBe(0);
      expect(pp.atkShareByGate).toEqual(EMPTY_SHARE);
      expect(pp.defShareByGate).toEqual(EMPTY_SHARE);
      expect(pp.avgAttackTotal).toBe(0);
      expect(pp.avgDefenseTotal).toBe(0);
      expect(pp.avgRepair).toBe(0);
      expect(pp.avgContest).toBe(0);
    }
  });

  it("normalizes shares per phase across all rounds of that phase", () => {
    // Early (rounds 1-3):
    //   attack sums g0=4+2+0=6, g1=0+2+0=2, g2=0 -> total 8 -> [0.75,0.25,0]
    //   defense sums g0=0+0+1=1, g1=2+0+1=3, g2=0+0+1=1 -> total 5 -> [0.2,0.6,0.2]
    //   avgAttackTotal=8/3, avgDefenseTotal=5/3, rounds=3
    // Mid (rounds 4-5): attack all zero -> [0,0,0]
    //   defense g2 sum=2, total 2 -> [0,0,1]; avgDefenseTotal=1; avgRepair=(3+0)/2=1.5
    const m = match("m1", [
      rr(1, { attack: [4, 0, 0], defense: [0, 2, 0] }),
      rr(2, { attack: [2, 2, 0], defense: [0, 0, 0] }),
      rr(3, { attack: [0, 0, 0], defense: [1, 1, 1] }),
      rr(4, { attack: [0, 0, 0], defense: [0, 0, 2], repair: 3 }),
      rr(5, { attack: [0, 0, 0], defense: [0, 0, 0], repair: 0 }),
    ]);
    const p = buildProfile([m]);

    expect(p.matchesAnalyzed).toBe(1);
    expect(p.roundsAnalyzed).toBe(5);

    const early = p.phases.early;
    expect(early.rounds).toBe(3);
    expect(early.atkShareByGate).toEqual([0.75, 0.25, 0]);
    expect(early.defShareByGate).toEqual([0.2, 0.6, 0.2]);
    expect(early.avgAttackTotal).toBeCloseTo(8 / 3, 10);
    expect(early.avgDefenseTotal).toBeCloseTo(5 / 3, 10);

    const mid = p.phases.mid;
    expect(mid.rounds).toBe(2);
    expect(mid.atkShareByGate).toEqual(EMPTY_SHARE); // all-zero attack
    expect(mid.defShareByGate).toEqual([0, 0, 1]);
    expect(mid.avgDefenseTotal).toBe(1);
    expect(mid.avgRepair).toBe(1.5);

    expect(p.phases.endgame.rounds).toBe(0);
  });

  it("counts trapRate denominator only over rounds with nodesBefore >= 1", () => {
    const m = match("m1", [
      rr(1, { traps: [1, 0, 0] }, { nodesBefore: 1 }), // denom + numer
      rr(2, { traps: [0, 0, 0] }, { nodesBefore: 1 }), // denom only
      rr(3, { traps: [0, 0, 0] }, { nodesBefore: 0 }), // excluded
    ]);
    const p = buildProfile([m]);
    expect(p.trapRate).toBe(0.5); // 1 armed / 2 with nodes
  });

  it("returns trapRate 0 when no round has a node", () => {
    const m = match("m1", [rr(1, { traps: [1, 1, 1] }, { nodesBefore: 0 })]);
    expect(buildProfile([m]).trapRate).toBe(0);
  });

  it("computes repairWhenLowShare with exact budget arithmetic", () => {
    // R1: hp25<30, round1, nodes0 -> budget 10, repair*2 = 6
    // R2: hp20<30, round8, nodes2 -> budget 10+2+2 = 14, repair*2 = 2
    // R3: hp40 -> excluded
    // share = (6+2)/(10+14) = 8/24 = 1/3
    const m = match("m1", [
      rr(1, { repair: 3 }, { hpBefore: 25, nodesBefore: 0 }),
      rr(8, { repair: 1 }, { hpBefore: 20, nodesBefore: 2 }),
      rr(2, { repair: 5 }, { hpBefore: 40, nodesBefore: 0 }),
    ]);
    expect(buildProfile([m]).repairWhenLowShare).toBeCloseTo(1 / 3, 10);
  });

  it("returns repairWhenLowShare 0 when never low", () => {
    const m = match("m1", [rr(1, { repair: 4 }, { hpBefore: 50 })]);
    expect(buildProfile([m]).repairWhenLowShare).toBe(0);
  });

  it("collects ability rounds by type across tiers and sorts them", () => {
    // id 2 (tier1) and id 7 (tier2) both decode to type 2.
    const m1 = match("m1", [rr(3, { abilityId: 7 }), rr(2, { abilityId: 1 })]);
    const m2 = match("m2", [rr(1, { abilityId: 2 }), rr(5, { abilityId: 0 })]);
    const p = buildProfile([m1, m2]);
    expect(p.abilityRounds[2]).toEqual([1, 3]); // sorted, id2 + id7
    expect(p.abilityRounds[1]).toEqual([2]);
    expect(p.abilityRounds[0]).toBeUndefined(); // no "none" bucket
  });

  it("computes winRate excluding draws/nulls", () => {
    const p = buildProfile([
      match("m1", [rr(1, {})], true),
      match("m2", [rr(1, {})], false),
      match("m3", [rr(1, {})], null), // draw excluded
    ]);
    expect(p.winRate).toBe(0.5); // 1 win / 2 decided
    expect(p.matchesAnalyzed).toBe(3);
  });
});
