// craftingContracts.ts — wrappers for the crafting_1v1 Dojo system
import type { AccountInterface, Call } from "starknet";
import { CRAFTING_1V1_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { RESOURCE_TOKENS } from "./useResourceBalances";

export type AbilityId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export { CRAFTING_1V1_ADDRESS };

export type AbilityCost = Record<string, number>;

export interface AbilityDef {
  id: AbilityId;
  type: number; // 1-5
  tier: 1 | 2;
  name: string;
  effect: string;
  cost: AbilityCost;
  requiresT1?: boolean;
}

// 10 abilities: IDs 1-5 are T1, 6-10 are T2
export const ABILITIES: readonly AbilityDef[] = [
  // T1
  {
    id: 1,
    type: 1,
    tier: 1,
    name: "Siege Sword",
    effect: "Set attack on target gate to 5",
    cost: { iron: 8, wood: 5 },
  },
  { id: 2, type: 2, tier: 1, name: "Stone Cloak", effect: "Halve all gate damage taken", cost: { stone: 8, linen: 5 } },
  {
    id: 3,
    type: 3,
    tier: 1,
    name: "Ember Blast",
    effect: "Deal 2 direct damage bypassing gates",
    cost: { ember: 8, seeds: 5 },
  },
  {
    id: 4,
    type: 4,
    tier: 1,
    name: "Hex",
    effect: "Reduce opponent total damage by 3",
    cost: { iron: 5, stone: 5, ember: 3 },
  },
  {
    id: 5,
    type: 5,
    tier: 1,
    name: "Fortify",
    effect: "Add 1 to defense at all gates",
    cost: { stone: 5, linen: 5, wood: 3 },
  },
  // T2
  {
    id: 6,
    type: 1,
    tier: 2,
    name: "Siege Sword (T2)",
    effect: "Set attack on target gate to 10",
    cost: { iron: 30, wood: 20, ember: 10 },
    requiresT1: true,
  },
  {
    id: 7,
    type: 2,
    tier: 2,
    name: "Stone Cloak (T2)",
    effect: "Halve all gate damage taken; enemy repair heals nothing this round",
    cost: { stone: 30, linen: 20, seeds: 10 },
    requiresT1: true,
  },
  {
    id: 8,
    type: 3,
    tier: 2,
    name: "Ember Blast (T2)",
    effect: "Deal 6 direct damage bypassing gates",
    cost: { ember: 30, seeds: 20, iron: 10 },
    requiresT1: true,
  },
  {
    id: 9,
    type: 4,
    tier: 2,
    name: "Hex (T2)",
    effect: "Reduce opponent total damage by 8",
    cost: { iron: 20, stone: 20, ember: 10, wood: 10 },
    requiresT1: true,
  },
  {
    id: 10,
    type: 5,
    tier: 2,
    name: "Fortify (T2)",
    effect: "Double defense at all gates",
    cost: { stone: 20, linen: 20, wood: 10 },
    requiresT1: true,
  },
] as const;

// Helpers matching the Cairo versions
export function abilityType(id: number): number {
  return ((id - 1) % 5) + 1;
}

export function abilityTier(id: number): number {
  return Math.floor((id - 1) / 5) + 1;
}

export function tokenIdFrom(type: number, tier: number): AbilityId {
  return ((tier - 1) * 5 + type) as AbilityId;
}

export function canAfford(cost: AbilityCost, balances: Record<string, number>, quantity = 1): boolean {
  return Object.entries(cost).every(([resource, amount]) => (balances[resource] || 0) >= amount * quantity);
}

export function maxAffordable(cost: AbilityCost, balances: Record<string, number>): number {
  let max = Infinity;
  for (const [resource, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    max = Math.min(max, Math.floor((balances[resource] || 0) / amount));
  }
  return max === Infinity ? 0 : max;
}

// Approve required tokens then batch-craft T1 abilities in one multicall.
export async function craftAbility(account: AccountInterface, abilityId: number, cost: AbilityCost, quantity = 1): Promise<string> {
  const calls: Call[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, (amount * quantity).toString(), "0"],
    });
  }

  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability_batch",
    calldata: [abilityId.toString(), quantity.toString()],
  });

  const result = await resilientExecute(account, calls);
  return result.transaction_hash;
}

// Approve required tokens then batch-craft T2 abilities (burns T1 + resources).
export async function craftAbilityTier2(
  account: AccountInterface,
  abilityTypeId: number,
  cost: AbilityCost,
  quantity = 1,
): Promise<string> {
  const calls: Call[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, (amount * quantity).toString(), "0"],
    });
  }

  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability_tier2_batch",
    calldata: [abilityTypeId.toString(), quantity.toString()],
  });

  const result = await resilientExecute(account, calls);
  return result.transaction_hash;
}
