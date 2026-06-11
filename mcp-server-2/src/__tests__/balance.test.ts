import { describe, it, expect } from "vitest";
import { roundBudget, validateMove } from "../move.js";
import { effectiveMoves, postContestOwners } from "../damage.js";
import type { MoveAllocation1v1 } from "../hash.js";

function move(partial: Partial<MoveAllocation1v1>): MoveAllocation1v1 {
  return {
    attack: [0, 0, 0],
    defense: [0, 0, 0],
    repair: 0,
    nodes: [0, 0, 0],
    traps: [0, 0, 0],
    abilityId: 0,
    abilityTarget: 0,
    ...partial,
  };
}

describe("roundBudget", () => {
  it("is 10 + owned nodes through round 6", () => {
    expect(roundBudget(0, 1)).toBe(10);
    expect(roundBudget(2, 6)).toBe(12);
  });

  it("escalates +1 per round above 6", () => {
    expect(roundBudget(0, 7)).toBe(11);
    expect(roundBudget(0, 10)).toBe(14);
    expect(roundBudget(3, 10)).toBe(17);
  });
});

describe("validateMove repair pricing", () => {
  it("charges 2 budget per repair HP", () => {
    expect(validateMove(move({ repair: 5 }), 10)).toBe(10);
  });

  it("rejects repair beyond half the budget", () => {
    expect(() => validateMove(move({ repair: 6 }), 10)).toThrow(/exceeds budget/);
  });

  it("still charges traps at 2 and the rest at 1", () => {
    // 3 attack + 2 defense + 1 node + 1 trap (2) + 1 repair (2) = 10
    expect(
      validateMove(
        move({ attack: [3, 0, 0], defense: [2, 0, 0], nodes: [1, 0, 0], traps: [1, 0, 0], repair: 1 }),
        10,
      ),
    ).toBe(10);
  });
});

describe("postContestOwners", () => {
  it("keeps owners on ties and flips on wins", () => {
    expect(postContestOwners(["a", null, "b"], [0, 2, 1], [0, 2, 4])).toEqual(["a", null, "b"]);
    expect(postContestOwners([null, "a", null], [0, 2, 3], [2, 2, 0])).toEqual(["b", "a", "a"]);
  });
});

describe("effectiveMoves node defense", () => {
  it("adds +1 defense at the owner's gate", () => {
    const eff = effectiveMoves(
      [0, 0, 0],
      { attack: [3, 0, 0], defense: [0, 0, 0] },
      { attack: [0, 2, 0], defense: [1, 0, 0] },
      ["b", "a", null],
    );
    expect(eff?.player_b[0].defense).toBe(2); // B owns node 0
    expect(eff?.player_a[1].defense).toBe(1); // A owns node 1
    expect(eff?.player_a[0].defense).toBe(0);
  });

  it("applies node defense after the narrow pass cap", () => {
    const eff = effectiveMoves(
      [1, 0, 0],
      { attack: [0, 0, 0], defense: [0, 0, 0] },
      { attack: [0, 0, 0], defense: [5, 0, 0] },
      ["b", null, null],
    );
    // Defense capped 5 -> 3, then +1 node defense = 4
    expect(eff?.player_b[0].defense).toBe(4);
  });

  it("leaves moves untouched when no owners are passed", () => {
    const eff = effectiveMoves(
      [0, 0, 0],
      { attack: [3, 0, 0], defense: [0, 0, 0] },
      { attack: [0, 0, 0], defense: [1, 0, 0] },
    );
    expect(eff?.player_b[0].defense).toBe(1);
  });
});
