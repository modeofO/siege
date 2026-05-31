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
  aAttack: [4, 2, 1],
  aDefense: [1, 2, 1],
  bAttack: [3, 1, 3],
  bDefense: [2, 1, 1],
  damageToA: 5,
  damageToB: 4,
  modifiers: [0, 0, 0],
  gateBreakdown: [
    { gate: 0, modifier: 0, attackA: 4, defenseA: 1, attackB: 3, defenseB: 2, dmgToA: 2, dmgToB: 2 },
    { gate: 1, modifier: 0, attackA: 2, defenseA: 2, attackB: 1, defenseB: 1, dmgToA: 0, dmgToB: 1 },
    { gate: 2, modifier: 0, attackA: 1, defenseA: 1, attackB: 3, defenseB: 1, dmgToA: 2, dmgToB: 0 },
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
