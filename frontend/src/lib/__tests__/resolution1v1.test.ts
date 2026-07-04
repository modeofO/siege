import { describe, it, expect } from "vitest";
import {
  abilityType,
  abilityTier,
  resolveNodeContests,
  computeGateStage,
  resolveRoundLocal,
} from "@/lib/resolution1v1";
import type { RoundInputs } from "@/lib/resolution1v1";

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

function baseInputs(partial: Partial<RoundInputs> = {}): RoundInputs {
  return {
    moveA: { ...MOVE0 },
    moveB: { ...MOVE0 },
    nodeOwners: ["neutral", "neutral", "neutral"],
    modifiers: [0, 0, 0],
    vaultAHp: 50,
    vaultBHp: 50,
    round: 1,
    ...partial,
  };
}

describe("resolveRoundLocal pipeline", () => {
  it("hex reduces total incoming damage (T1: 3, T2: 8, floor 0)", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [4, 4, 0] },       // 8 raw to B
      moveB: { ...MOVE0, abilityId: 9 },            // Hex T2
    }));
    expect(out.totalDamageToB).toBe(0);
    expect(out.vaultBHpAfter).toBe(50);
  });

  it("repair applies before damage and caps at 50", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultBHp: 48,
      moveA: { ...MOVE0, attack: [5, 0, 0] },
      moveB: { ...MOVE0, repair: 4 },               // 48 +4 -> capped 50, then -5
    }));
    expect(out.repairB).toBe(4);
    expect(out.vaultBHpAfter).toBe(45);
  });

  it("enemy T2 stone cloak zeroes repair; T1 does not", () => {
    const t2 = resolveRoundLocal(baseInputs({
      vaultBHp: 40,
      moveA: { ...MOVE0, abilityId: 7 },            // Stone Cloak T2
      moveB: { ...MOVE0, repair: 3 },
    }));
    expect(t2.repairB).toBe(0);
    expect(t2.vaultBHpAfter).toBe(40);
    const t1 = resolveRoundLocal(baseInputs({
      vaultBHp: 40,
      moveA: { ...MOVE0, abilityId: 2 },            // Stone Cloak T1
      moveB: { ...MOVE0, repair: 3 },
    }));
    expect(t1.repairB).toBe(3);
  });

  it("ember blast is direct vault damage after gate damage (T1: 2, T2: 6)", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, abilityId: 8 },            // Ember T2
    }));
    expect(out.emberToB).toBe(6);
    expect(out.vaultBHpAfter).toBe(44);
  });

  it("trap fires only when a trapped node changes owner, 5 dmg, post-repair", () => {
    const out = resolveRoundLocal(baseInputs({
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, traps: [1, 0, 0] },
      moveB: { ...MOVE0, nodeContest: [2, 0, 0], repair: 5 }, // B captures node 0
      vaultBHp: 30,
    }));
    expect(out.nodeOwnersAfter[0]).toBe("teamB");
    expect(out.trapDamageToB).toBe(5);
    expect(out.vaultBHpAfter).toBe(30); // 30 +5 repair -5 trap
  });

  it("vault at 0 finishes the match with the survivor as winner", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultBHp: 3,
      moveA: { ...MOVE0, attack: [5, 0, 0] },
    }));
    expect(out.vaultBHpAfter).toBe(0);
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(1);
    expect(out.events.at(-1)).toEqual({ kind: "match_finished", winnerTeam: 1 });
  });

  it("round 10 finishes by HP comparison", () => {
    const out = resolveRoundLocal(baseInputs({ round: 10, vaultAHp: 20, vaultBHp: 30 }));
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(2);
  });

  it("events are ordered: captures, clashes, repair, damage, ember, traps", () => {
    const out = resolveRoundLocal(baseInputs({
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, attack: [4, 0, 0], traps: [1, 0, 0], abilityId: 3 },
      moveB: { ...MOVE0, nodeContest: [2, 0, 0], repair: 2 },
    }));
    const kinds = out.events.map((e) => e.kind);
    expect(kinds).toEqual([
      "node_captured",
      "troops_clash",
      "vault_repaired",
      "vault_damaged",
      "ember_blast",
      "trap_detonated",
    ]);
  });
});
