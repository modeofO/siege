import { describe, expect, it } from "vitest";
import type { GateDamage, RoundResult1v1 } from "@/lib/gameState1v1";
import { deriveAftermath } from "../aftermath";

// Build a minimal RoundResult1v1 carrying only the fields deriveAftermath reads:
// per-gate dmgToA/dmgToB and the damageToA/damageToB totals. Everything else is
// filled with inert defaults so the shape type-checks.
function gate(gateIdx: number, dmgToA: number, dmgToB: number): GateDamage {
  return {
    gate: gateIdx,
    modifier: 0,
    attackA: 0,
    defenseA: 0,
    attackB: 0,
    defenseB: 0,
    dmgToA,
    dmgToB,
  };
}

function round(gates: GateDamage[]): RoundResult1v1 {
  const damageToA = gates.reduce((s, g) => s + g.dmgToA, 0);
  const damageToB = gates.reduce((s, g) => s + g.dmgToB, 0);
  return {
    round: 1,
    aAttack: [0, 0, 0],
    aDefense: [0, 0, 0],
    bAttack: [0, 0, 0],
    bDefense: [0, 0, 0],
    damageToA,
    damageToB,
    modifiers: [0, 0, 0],
    gateBreakdown: gates,
    aTraps: [0, 0, 0],
    bTraps: [0, 0, 0],
    trapDmgToA: 0,
    trapDmgToB: 0,
    aAbilityId: 0,
    aAbilityTarget: 0,
    bAbilityId: 0,
    bAbilityTarget: 0,
  };
}

describe("deriveAftermath", () => {
  it("returns all zeros for empty history", () => {
    const out = deriveAftermath([], true);
    expect(out.gateScorch).toEqual([0, 0, 0]);
    expect(out.myVaultWear).toBe(0);
    expect(out.enemyVaultWear).toBe(0);
  });

  it("accumulates per-gate scorch across multiple rounds (both directions)", () => {
    // Gate 0: r1 (2+1)=3, r2 (0+3)=3 -> total 6
    // Gate 1: r1 (1+0)=1, r2 (4+2)=6 -> total 7
    // Gate 2: r1 (0+0)=0, r2 (0+0)=0 -> total 0
    const history = [
      round([gate(0, 2, 1), gate(1, 1, 0), gate(2, 0, 0)]),
      round([gate(0, 0, 3), gate(1, 4, 2), gate(2, 0, 0)]),
    ];
    const out = deriveAftermath(history, true);
    expect(out.gateScorch[0]).toBeCloseTo(1 - Math.pow(0.92, 6), 10);
    expect(out.gateScorch[1]).toBeCloseTo(1 - Math.pow(0.92, 7), 10);
    expect(out.gateScorch[2]).toBe(0);
  });

  it("derives vault wear from cumulative damage taken per side (A perspective)", () => {
    // damageToA: r1 = 2+1+0 = 3, r2 = 0+4+0 = 4 -> 7
    // damageToB: r1 = 1+0+0 = 1, r2 = 3+2+0 = 5 -> 6
    const history = [
      round([gate(0, 2, 1), gate(1, 1, 0), gate(2, 0, 0)]),
      round([gate(0, 0, 3), gate(1, 4, 2), gate(2, 0, 0)]),
    ];
    const out = deriveAftermath(history, true);
    expect(out.myVaultWear).toBeCloseTo(1 - Math.pow(0.92, 7), 10);
    expect(out.enemyVaultWear).toBeCloseTo(1 - Math.pow(0.92, 6), 10);
  });

  it("swaps vault wear when the viewer is player B", () => {
    const history = [
      round([gate(0, 2, 1), gate(1, 1, 0), gate(2, 0, 0)]),
      round([gate(0, 0, 3), gate(1, 4, 2), gate(2, 0, 0)]),
    ];
    const out = deriveAftermath(history, false);
    // My side is now B: cumulative damageToB = 6; enemy is A: 7.
    expect(out.myVaultWear).toBeCloseTo(1 - Math.pow(0.92, 6), 10);
    expect(out.enemyVaultWear).toBeCloseTo(1 - Math.pow(0.92, 7), 10);
    // Gate scorch is perspective-independent.
    expect(out.gateScorch[0]).toBeCloseTo(1 - Math.pow(0.92, 6), 10);
  });
});
