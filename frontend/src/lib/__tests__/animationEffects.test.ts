import { describe, it, expect } from "vitest";
import {
  buildGateImpacts,
  buildDamageNumbers,
  buildNodeFlips,
  buildTrapEffects,
  buildAbilityEffect,
  type EffectDescriptor,
} from "../animationEffects";
import type { RoundResult1v1 } from "../gameState1v1";
import type { NodeOwner } from "../gameState1v1";

const baseResult: RoundResult1v1 = {
  round: 1,
  aAttack: [3, 2, 1],
  aDefense: [2, 1, 0],
  bAttack: [1, 2, 3],
  bDefense: [0, 1, 2],
  damageToA: 3,
  damageToB: 5,
  modifiers: [0, 0, 0],
  gateBreakdown: [
    { gate: 0, modifier: 0, attackA: 3, defenseA: 2, attackB: 1, defenseB: 0, dmgToA: 0, dmgToB: 3 },
    { gate: 1, modifier: 0, attackA: 2, defenseA: 1, attackB: 2, defenseB: 1, dmgToA: 1, dmgToB: 1 },
    { gate: 2, modifier: 0, attackA: 1, defenseA: 0, attackB: 3, defenseB: 2, dmgToA: 2, dmgToB: 0 },
  ],
  aTraps: [0, 0, 0],
  bTraps: [0, 0, 0],
  trapDmgToA: 0,
  trapDmgToB: 0,
  aAbilityId: 0,
  aAbilityTarget: 0,
  bAbilityId: 0,
  bAbilityTarget: 0,
};

describe("buildGateImpacts", () => {
  it("creates effects only for gates with damage", () => {
    const effects = buildGateImpacts(baseResult, true);
    const nonZero = effects.filter((e: EffectDescriptor) => e.type === "gate-flash");
    expect(nonZero.length).toBe(3);
    expect(nonZero[0].gateIndex).toBe(0);
    expect(nonZero[1].gateIndex).toBe(1);
    expect(nonZero[2].gateIndex).toBe(2);
  });

  it("skips gates with zero damage", () => {
    const zeroDmgResult: RoundResult1v1 = {
      ...baseResult,
      gateBreakdown: [
        { gate: 0, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
        { gate: 1, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
        { gate: 2, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
      ],
    };
    const effects = buildGateImpacts(zeroDmgResult, true);
    expect(effects).toHaveLength(0);
  });

  it("scales intensity by total damage amount", () => {
    const effects = buildGateImpacts(baseResult, true);
    const gate0 = effects.find((e: EffectDescriptor) => e.gateIndex === 0)!;
    const gate1 = effects.find((e: EffectDescriptor) => e.gateIndex === 1)!;
    expect(gate0.intensity).toBeGreaterThan(gate1.intensity);
  });
});

describe("buildDamageNumbers", () => {
  it("creates per-gate damage numbers for dealt and taken", () => {
    const effects = buildDamageNumbers(baseResult, true);
    const dealt = effects.filter((e: EffectDescriptor) => e.variant === "dealt");
    const taken = effects.filter((e: EffectDescriptor) => e.variant === "taken");
    expect(dealt.length).toBeGreaterThan(0);
    expect(taken.length).toBeGreaterThan(0);
  });

  it("creates no numbers for zero total damage", () => {
    const noDmg: RoundResult1v1 = {
      ...baseResult,
      damageToA: 0,
      damageToB: 0,
      gateBreakdown: baseResult.gateBreakdown.map((g) => ({ ...g, dmgToA: 0, dmgToB: 0 })),
    };
    const effects = buildDamageNumbers(noDmg, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildNodeFlips", () => {
  it("creates effects only for nodes that changed ownership", () => {
    const prevNodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "teamA", "neutral"];
    const newNodes: [NodeOwner, NodeOwner, NodeOwner] = ["teamA", "teamA", "teamB"];
    const effects = buildNodeFlips(prevNodes, newNodes, true);
    expect(effects).toHaveLength(2);
    expect(effects[0].nodeIndex).toBe(0);
    expect(effects[1].nodeIndex).toBe(2);
  });

  it("creates no effects when nodes stay the same", () => {
    const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["teamA", "neutral", "teamB"];
    const effects = buildNodeFlips(nodes, nodes, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildTrapEffects", () => {
  it("creates trap ring + damage number for active traps", () => {
    const result: RoundResult1v1 = {
      ...baseResult,
      aTraps: [1, 0, 0],
      bTraps: [0, 0, 1],
    };
    const effects = buildTrapEffects(result, true);
    const rings = effects.filter((e: EffectDescriptor) => e.type === "trap-ring");
    const numbers = effects.filter((e: EffectDescriptor) => e.type === "trap-number");
    expect(rings).toHaveLength(2);
    expect(numbers).toHaveLength(2);
  });

  it("creates no effects when no traps active", () => {
    const effects = buildTrapEffects(baseResult, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildAbilityEffect", () => {
  it("returns slash effect for Siege Sword (type 1)", () => {
    const effect = buildAbilityEffect(1, 1, true);
    expect(effect).not.toBeNull();
    expect(effect!.type).toBe("ability-slash");
  });

  it("returns shield effect for Stone Cloak (type 2)", () => {
    const effect = buildAbilityEffect(2, 0, true);
    expect(effect!.type).toBe("ability-shield");
  });

  it("returns ember effect for Ember Blast (type 3)", () => {
    const effect = buildAbilityEffect(3, 0, true);
    expect(effect!.type).toBe("ability-ember");
  });

  it("returns hex effect for Hex (type 4)", () => {
    const effect = buildAbilityEffect(4, 0, true);
    expect(effect!.type).toBe("ability-hex");
  });

  it("returns fortify effect for Fortify (type 5)", () => {
    const effect = buildAbilityEffect(5, 0, true);
    expect(effect!.type).toBe("ability-fortify");
  });

  it("returns T2 variant with higher intensity for T2 abilities", () => {
    const t1 = buildAbilityEffect(1, 1, true);
    const t2 = buildAbilityEffect(6, 1, true);
    expect(t1!.tier).toBe(1);
    expect(t2!.tier).toBe(2);
    expect(t2!.intensity).toBeGreaterThan(t1!.intensity);
  });

  it("returns null for ability ID 0", () => {
    const effect = buildAbilityEffect(0, 0, true);
    expect(effect).toBeNull();
  });
});
