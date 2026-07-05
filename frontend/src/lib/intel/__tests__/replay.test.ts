import { describe, it, expect } from "vitest";
import { replayMatch } from "../replay";
import type { HistoricalRound } from "../types";
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

const MODS0: [number, number, number] = [0, 0, 0];

// A two-round match: round 1 A captures node 0 and both sides trade damage;
// round 2 both attack again. Engine outputs (verified against resolveRoundLocal):
//   R1: A attack[5,0,0] nc[2,0,0]; B attack[4,0,0]
//       -> A captures node 0; dmgToB=5 (hpB 50->45); dmgToA=4-1(node def)=3 (hpA 50->47)
//   R2: A attack[2,0,0]; B attack[1,0,0]
//       -> dmgToB=2 (hpB 45->43); dmgToA=1-1(node def)=0 (hpA stays 47)
const twoRound: HistoricalRound[] = [
  {
    round: 1,
    moveA: move({ attack: [5, 0, 0], nodeContest: [2, 0, 0] }),
    moveB: move({ attack: [4, 0, 0] }),
    modifiers: MODS0,
  },
  {
    round: 2,
    moveA: move({ attack: [2, 0, 0] }),
    moveB: move({ attack: [1, 0, 0] }),
    modifiers: MODS0,
  },
];

describe("replayMatch", () => {
  it("hpBefore sequence follows the engine's per-round outputs (opponent = A)", () => {
    const res = replayMatch("m1", twoRound, true);
    expect(res.rounds.map((r) => r.hpBefore)).toEqual([50, 47]);
    // round 2 hpBefore equals vaultAHpAfter of round 1
    expect(res.rounds[1].hpBefore).toBe(47);
  });

  it("hpBefore sequence follows the engine's per-round outputs (opponent = B)", () => {
    const res = replayMatch("m1", twoRound, false);
    expect(res.rounds.map((r) => r.hpBefore)).toEqual([50, 45]);
  });

  it("nodesBefore updates after a capture", () => {
    // A captures node 0 in round 1, so entering round 2 A holds 1 node.
    const asA = replayMatch("m1", twoRound, true);
    expect(asA.rounds.map((r) => r.nodesBefore)).toEqual([0, 1]);
    // B never owns a node.
    const asB = replayMatch("m1", twoRound, false);
    expect(asB.rounds.map((r) => r.nodesBefore)).toEqual([0, 0]);
  });

  it("normalizes `move` to the opponent's move regardless of slot", () => {
    const asA = replayMatch("m1", twoRound, true);
    expect(asA.rounds[0].move).toBe(twoRound[0].moveA);
    expect(asA.rounds[1].move).toBe(twoRound[1].moveA);

    const asB = replayMatch("m1", twoRound, false);
    expect(asB.rounds[0].move).toBe(twoRound[0].moveB);
    expect(asB.rounds[1].move).toBe(twoRound[1].moveB);
  });

  it("passes matchId through", () => {
    expect(replayMatch("abc123", twoRound, true).matchId).toBe("abc123");
  });

  // --- opponentWon truth table ---
  const winByA: HistoricalRound[] = [
    { round: 1, moveA: move({ attack: [50, 0, 0] }), moveB: MOVE0, modifiers: MODS0 },
  ];
  const winByB: HistoricalRound[] = [
    { round: 1, moveA: MOVE0, moveB: move({ attack: [50, 0, 0] }), modifiers: MODS0 },
  ];
  const draw: HistoricalRound[] = [
    {
      round: 1,
      moveA: move({ attack: [50, 0, 0] }),
      moveB: move({ attack: [50, 0, 0] }),
      modifiers: MODS0,
    },
  ];

  it("opponentWon: winner 1 & opponentIsA -> true", () => {
    expect(replayMatch("m", winByA, true).opponentWon).toBe(true);
  });

  it("opponentWon: winner 2 & !opponentIsA -> true", () => {
    expect(replayMatch("m", winByB, false).opponentWon).toBe(true);
  });

  it("opponentWon: draw (winner 0) -> null", () => {
    expect(replayMatch("m", draw, true).opponentWon).toBeNull();
    expect(replayMatch("m", draw, false).opponentWon).toBeNull();
  });

  it("opponentWon: unfinished -> null", () => {
    // twoRound never finishes (nobody hits 0, fewer than 10 rounds).
    expect(replayMatch("m", twoRound, true).opponentWon).toBeNull();
  });

  it("opponentWon: winner 1 & !opponentIsA -> false (a loss)", () => {
    expect(replayMatch("m", winByA, false).opponentWon).toBe(false);
    // symmetric loss: winner 2 & opponentIsA -> false
    expect(replayMatch("m", winByB, true).opponentWon).toBe(false);
  });

  it("stops replaying once a round finishes the match", () => {
    const finishesEarly: HistoricalRound[] = [
      { round: 1, moveA: move({ attack: [50, 0, 0] }), moveB: MOVE0, modifiers: MODS0 },
      { round: 2, moveA: move({ attack: [1, 0, 0] }), moveB: MOVE0, modifiers: MODS0 },
    ];
    const res = replayMatch("m", finishesEarly, true);
    expect(res.rounds).toHaveLength(1);
    expect(res.opponentWon).toBe(true);
  });
});
