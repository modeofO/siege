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

// Vectors transcribed verbatim from the Cairo test suite. Every expected value
// is copied from a Cairo `assert(...)`; NONE is computed by the TS engine.
// If one of these fails, the engine diverges from deployed Cairo — fix the
// engine, never the vector.
describe("Cairo-derived vectors", () => {
  // --- src/tests/test_resolution_1v1.cairo (round 1, no modifiers) ---

  // test_damage_calculation_1v1
  it("matches test_damage_calculation_1v1", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, defense: [2, 2, 2], repair: 2 },
    }));
    expect(out.vaultAHpAfter).toBe(50);
    expect(out.vaultBHpAfter).toBe(46);
  });

  // test_node_contest_1v1
  it("matches test_node_contest_1v1", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [2, 2, 0], defense: [2, 2, 0], nodeContest: [2, 0, 0] },
      moveB: { ...MOVE0, attack: [2, 2, 0], defense: [2, 2, 0], nodeContest: [0, 2, 0] },
    }));
    // Node 0: A=2,B=0 -> TeamA; Node 1: A=0,B=2 -> TeamB; Node 2: tie -> None.
    expect(out.nodeOwnersAfter).toEqual(["teamA", "teamB", "neutral"]);
  });

  // test_win_condition_vault_zero_1v1 (vault B starts at 5)
  it("matches test_win_condition_vault_zero_1v1", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultBHp: 5,
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, nodeContest: [5, 3, 2] },
    }));
    // Damage to B: 5+3+2 = 10. HP_B = 5 - 10 -> 0, match finished.
    expect(out.vaultBHpAfter).toBe(0);
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(1);
  });

  // test_no_damage_when_defense_exceeds_attack_1v1
  it("matches test_no_damage_when_defense_exceeds_attack_1v1", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [1, 1, 1], defense: [3, 2, 1], nodeContest: [0, 0, 1] },
      moveB: { ...MOVE0, attack: [1, 1, 1], defense: [3, 2, 1], nodeContest: [0, 0, 1] },
    }));
    expect(out.vaultAHpAfter).toBe(50);
    expect(out.vaultBHpAfter).toBe(50);
  });

  // --- src/tests/test_modifiers_1v1.cairo (round 10, explicit modifiers) ---

  // test_normal_modifiers_no_change
  it("matches test_normal_modifiers_no_change", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [0, 0, 0],
      moveA: { ...MOVE0, attack: [5, 3, 0], nodeContest: [1, 1, 0] },
      moveB: { ...MOVE0, defense: [2, 2, 2], repair: 2, nodeContest: [1, 1, 0] },
    }));
    expect(out.vaultAHpAfter).toBe(50);
    expect(out.vaultBHpAfter).toBe(46);
  });

  // test_narrow_pass_caps_at_3 (gate 0 = Narrow Pass)
  it("matches test_narrow_pass_caps_at_3", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [1, 0, 0],
      moveA: { ...MOVE0, attack: [8, 0, 0], nodeContest: [1, 1, 0] },
      moveB: { ...MOVE0, defense: [5, 0, 0], nodeContest: [2, 2, 1] },
    }));
    expect(out.vaultBHpAfter).toBe(50);
  });

  // test_mirror_gate_swaps_values (gate 0 = Mirror)
  it("matches test_mirror_gate_swaps_values", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [2, 0, 0],
      moveA: { ...MOVE0, defense: [5, 0, 0], nodeContest: [2, 2, 1] },
      moveB: { ...MOVE0 },
    }));
    expect(out.vaultBHpAfter).toBe(45);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // test_deadlock_no_damage (gate 0 = Deadlock)
  it("matches test_deadlock_no_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [3, 0, 0],
      moveA: { ...MOVE0, attack: [10, 0, 0] },
      moveB: { ...MOVE0, nodeContest: [5, 3, 2] },
    }));
    expect(out.vaultBHpAfter).toBe(50);
  });

  // test_overflow_splits_damage (gate 0 = Reflection/Overflow, even)
  it("matches test_overflow_splits_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [4, 0, 0],
      moveA: { ...MOVE0, attack: [6, 0, 0], defense: [0, 2, 2] },
      moveB: { ...MOVE0, attack: [0, 2, 2] },
    }));
    // Overflow 6 -> 3 to each of gates 1 and 2 = 6 total.
    expect(out.vaultBHpAfter).toBe(44);
  });

  // test_overflow_odd_rounds_down (gate 0 = Reflection, odd overflow floors)
  it("matches test_overflow_odd_rounds_down", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      modifiers: [4, 0, 0],
      moveA: { ...MOVE0, attack: [5, 0, 0], nodeContest: [2, 2, 1] },
      moveB: { ...MOVE0 },
    }));
    // Overflow 5 -> floor(5/2)=2 to each of gates 1 and 2 = 4 total.
    expect(out.vaultBHpAfter).toBe(46);
  });

  // --- src/tests/test_traps_1v1.cairo (round 10) ---

  // test_trap_deals_5_damage (A owns+traps node 0, B captures it)
  it("matches test_trap_deals_5_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, traps: [1, 0, 0] },
      moveB: { ...MOVE0, nodeContest: [5, 0, 0] },
    }));
    expect(out.vaultAHpAfter).toBe(50);
    expect(out.vaultBHpAfter).toBe(45);
  });

  // test_trap_not_triggered_if_not_contested (owner unchanged -> no trap)
  it("matches test_trap_not_triggered_if_not_contested", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, traps: [1, 0, 0] },
      moveB: { ...MOVE0 },
    }));
    expect(out.vaultAHpAfter).toBe(50);
    expect(out.vaultBHpAfter).toBe(50);
  });

  // --- src/tests/test_abilities_1v1.cairo (round 10, T1 abilities) ---

  // test_siege_sword_t1_overrides_attack (A: Siege Sword T1, id 1, target gate 0)
  it("matches test_siege_sword_t1_overrides_attack", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [1, 0, 0], abilityId: 1, abilityTarget: 0 },
      moveB: { ...MOVE0, defense: [2, 5, 0] },
    }));
    expect(out.vaultBHpAfter).toBe(47);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // test_stone_cloak_t1_halves_damage (B: Stone Cloak T1, id 2)
  it("matches test_stone_cloak_t1_halves_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, abilityId: 2 },
    }));
    expect(out.vaultBHpAfter).toBe(46);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // test_ember_blast_t1_bypasses_gates (A: Ember T1 id 3; B: Stone Cloak T1 id 2)
  it("matches test_ember_blast_t1_bypasses_gates", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, abilityId: 3 },
      moveB: { ...MOVE0, defense: [5, 5, 0], abilityId: 2 },
    }));
    expect(out.vaultBHpAfter).toBe(48);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // test_hex_t1_reduces_damage (B: Hex T1 id 4)
  it("matches test_hex_t1_reduces_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, abilityId: 4 },
    }));
    expect(out.vaultBHpAfter).toBe(43);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // test_fortify_t1_adds_one_defense (B: Fortify T1 id 5)
  it("matches test_fortify_t1_adds_one_defense", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [4, 3, 3] },
      moveB: { ...MOVE0, defense: [3, 3, 4], abilityId: 5 },
    }));
    expect(out.vaultBHpAfter).toBe(50);
    expect(out.vaultAHpAfter).toBe(50);
  });

  // --- src/tests/test_ability_tiers.cairo (round 10, T2 abilities) ---

  // test_t2_siege_sword_attack_10 (A: Siege Sword T2 id 6, target gate 0)
  it("matches test_t2_siege_sword_attack_10", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [1, 0, 0], abilityId: 6, abilityTarget: 0 },
      moveB: { ...MOVE0, defense: [5, 5, 0] },
    }));
    expect(out.vaultBHpAfter).toBe(45);
  });

  // test_t2_stone_cloak_halves_damage (B: Stone Cloak T2 id 7)
  it("matches test_t2_stone_cloak_halves_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, abilityId: 7 },
    }));
    expect(out.vaultBHpAfter).toBe(46);
  });

  // test_t2_ember_blast_6_damage (A: Ember T2 id 8)
  it("matches test_t2_ember_blast_6_damage", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, abilityId: 8 },
      moveB: { ...MOVE0 },
    }));
    expect(out.vaultBHpAfter).toBe(44);
  });

  // test_t2_hex_reduces_by_8 (B: Hex T2 id 9)
  it("matches test_t2_hex_reduces_by_8", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [5, 3, 2] },
      moveB: { ...MOVE0, abilityId: 9 },
    }));
    expect(out.vaultBHpAfter).toBe(48);
  });

  // test_t2_fortify_doubles_defense (B: Fortify T2 id 10)
  it("matches test_t2_fortify_doubles_defense", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      moveA: { ...MOVE0, attack: [4, 3, 3] },
      moveB: { ...MOVE0, defense: [3, 3, 4], abilityId: 10 },
    }));
    expect(out.vaultBHpAfter).toBe(50);
  });

  // --- Draw-branch pipeline vectors (winner-team-0). No dedicated Cairo test
  // exists for these; expected values follow the Cairo win logic in
  // resolution_1v1.cairo: both HP 0 -> draw; round>=10 equal HP -> draw. ---

  // Mutual destruction: both vaults reach 0 the same round -> draw (winner 0).
  it("mutual destruction draw yields winnerTeam 0", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultAHp: 5,
      vaultBHp: 5,
      moveA: { ...MOVE0, attack: [5, 0, 0] },
      moveB: { ...MOVE0, attack: [5, 0, 0] },
    }));
    expect(out.vaultAHpAfter).toBe(0);
    expect(out.vaultBHpAfter).toBe(0);
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(0);
    expect(out.events.at(-1)).toEqual({ kind: "match_finished", winnerTeam: 0 });
  });

  // Round 10 with equal surviving HP -> draw by HP comparison (winner 0).
  it("round 10 HP tie yields winnerTeam 0", () => {
    const out = resolveRoundLocal(baseInputs({
      round: 10,
      vaultAHp: 30,
      vaultBHp: 30,
    }));
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(0);
    expect(out.events.at(-1)).toEqual({ kind: "match_finished", winnerTeam: 0 });
  });
});
