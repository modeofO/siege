// frontend/src/app/sandbox/animations/mockData.ts
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";

export const MOCK_ALLOCATIONS_A = [3, 2, 0, 2, 1, 0, 1, 1, 0, 0];
export const MOCK_ALLOCATIONS_B = [2, 1, 2, 1, 2, 1, 0, 0, 1, 0];
export const MOCK_MODIFIERS: [number, number, number] = [0, 2, 0];

export const MOCK_PREV_NODES: [NodeOwner, NodeOwner, NodeOwner] = [
  "neutral",
  "teamA",
  "neutral",
];
export const MOCK_NEW_NODES: [NodeOwner, NodeOwner, NodeOwner] = [
  "teamA",
  "teamA",
  "teamB",
];

export const MOCK_RESULT: RoundResult1v1 = {
  round: 3,
  aAttack: [3, 2, 0],
  aDefense: [2, 1, 0],
  bAttack: [2, 1, 2],
  bDefense: [1, 2, 1],
  damageToA: 3,
  damageToB: 4,
  modifiers: [0, 2, 0],
  gateBreakdown: [
    { gate: 0, modifier: 0, attackA: 3, defenseA: 2, attackB: 2, defenseB: 1, dmgToA: 0, dmgToB: 2 },
    { gate: 1, modifier: 2, attackA: 2, defenseA: 1, attackB: 1, defenseB: 2, dmgToA: 0, dmgToB: 0 },
    { gate: 2, modifier: 0, attackA: 0, defenseA: 0, attackB: 2, defenseB: 0, dmgToA: 2, dmgToB: 0 },
  ],
  aTraps: [1, 0, 0],
  bTraps: [0, 0, 1],
  trapDmgToA: 5,
  trapDmgToB: 5,
  aAbilityId: 1,
  aAbilityTarget: 0,
  bAbilityId: 3,
  bAbilityTarget: 1,
};

export function mockResultWithAbility(abilityId: number, target: number): RoundResult1v1 {
  return { ...MOCK_RESULT, aAbilityId: abilityId, aAbilityTarget: target, bAbilityId: 0, bAbilityTarget: 0 };
}

export const MOCK_VAULT_BREACH_RESULT: RoundResult1v1 = {
  ...MOCK_RESULT,
  damageToB: 12,
  gateBreakdown: [
    { ...MOCK_RESULT.gateBreakdown[0], dmgToB: 5 },
    { ...MOCK_RESULT.gateBreakdown[1], dmgToB: 4 },
    { ...MOCK_RESULT.gateBreakdown[2], dmgToB: 3 },
  ],
};
