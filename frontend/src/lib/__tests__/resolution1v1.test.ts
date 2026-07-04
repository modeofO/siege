import { describe, it, expect } from "vitest";
import {
  abilityType,
  abilityTier,
  resolveNodeContests,
  computeGateStage,
} from "@/lib/resolution1v1";

const MOVE0 = {
  attack: [0, 0, 0] as [number, number, number],
  defense: [0, 0, 0] as [number, number, number],
  repair: 0,
  nodeContest: [0, 0, 0] as [number, number, number],
  traps: [0, 0, 0] as [number, number, number],
  abilityId: 0,
  abilityTarget: 0,
};
const NO_NODES: ["neutral", "neutral", "neutral"] = ["neutral", "neutral", "neutral"];

describe("ability decode", () => {
  it("id 0 is none", () => {
    expect(abilityType(0)).toBe(0);
    expect(abilityTier(0)).toBe(0);
  });
  it("ids 1-5 are tier 1 types 1-5", () => {
    expect(abilityType(1)).toBe(1); // Siege Sword T1
    expect(abilityType(2)).toBe(2); // Stone Cloak T1
    expect(abilityType(5)).toBe(5); // Fortify T1
    expect(abilityTier(3)).toBe(1);
  });
  it("ids 6-10 are tier 2 types 1-5", () => {
    expect(abilityType(6)).toBe(1); // Siege Sword T2
    expect(abilityType(10)).toBe(5); // Fortify T2
    expect(abilityTier(7)).toBe(2);
  });
});

describe("node contests", () => {
  it("strictly greater contest captures; tie holds", () => {
    const { owners, captures } = resolveNodeContests(
      [2, 1, 0],           // A's contest points per node
      [1, 1, 3],           // B's contest points per node
      ["neutral", "teamB", "teamA"],
    );
    expect(owners).toEqual(["teamA", "teamB", "teamB"]);
    expect(captures).toEqual([
      { node: 0, from: "neutral", to: "teamA" },
      { node: 2, from: "teamA", to: "teamB" },
    ]);
  });
});

describe("gate stage", () => {
  it("basic damage: attack minus defense, floored at 0", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [5, 2, 0] },
      { ...MOVE0, defense: [3, 4, 0] },
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([2, 0, 0]);
    expect(s.dmgToA).toEqual([0, 0, 0]);
  });

  it("narrow pass caps all four values at 3", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [8, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0] },
      [1, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB[0]).toBe(1); // min(8,3) - min(2,3)
  });

  it("mirror swaps attack and defense per player", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [0, 0, 0], defense: [4, 0, 0] },
      { ...MOVE0, attack: [0, 0, 0], defense: [1, 0, 0] },
      [2, 0, 0],
      NO_NODES,
    );
    // A's effective attack = 4 (was defense), B's effective defense = 0 (was attack)
    expect(s.dmgToB[0]).toBe(4);
  });

  it("deadlock deals no damage", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [9, 0, 0] },
      MOVE0,
      [3, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([0, 0, 0]);
  });

  it("reflection splits overflow to other gates minus unused defense", () => {
    // Gate 0 Reflection: A overflow = 6. per_gate = 3 to gates 1 and 2.
    // B's unused defense at gate 1 = 2 (def 2, atk 0) -> 1 lands; gate 2 = 0 -> 3 lands.
    const s = computeGateStage(
      { ...MOVE0, attack: [6, 0, 0] },
      { ...MOVE0, defense: [0, 2, 0] },
      [4, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([0, 1, 3]);
  });

  it("fortify T1 adds 1 defense everywhere; T2 doubles", () => {
    const t1 = computeGateStage(
      { ...MOVE0, attack: [3, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0], abilityId: 5 },
      [0, 0, 0],
      NO_NODES,
    );
    expect(t1.dmgToB[0]).toBe(0); // 3 - (2+1)
    const t2 = computeGateStage(
      { ...MOVE0, attack: [5, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0], abilityId: 10 },
      [0, 0, 0],
      NO_NODES,
    );
    expect(t2.dmgToB[0]).toBe(1); // 5 - (2*2)
  });

  it("siege sword overrides attack at target gate only", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [1, 1, 0], abilityId: 6, abilityTarget: 0 }, // T2 -> 10
      { ...MOVE0, defense: [3, 0, 0] },
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([7, 1, 0]); // gate 0 overridden to 10, gate 1 untouched
  });

  it("owning node g grants +1 defense at gate g", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [2, 0, 0] },
      { ...MOVE0, defense: [1, 0, 0] },
      [0, 0, 0],
      ["teamB", "neutral", "neutral"],
    );
    expect(s.dmgToB[0]).toBe(0); // 2 - (1+1)
  });

  it("stone cloak halves per-gate damage to caster before reflection lands", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [5, 0, 0] },
      { ...MOVE0, defense: [0, 0, 0], abilityId: 2 }, // B cloaks T1
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB[0]).toBe(2); // floor(5/2)
  });
});
