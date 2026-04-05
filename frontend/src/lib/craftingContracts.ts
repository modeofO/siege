// craftingContracts.ts — wrappers for the crafting_1v1 Dojo system
import type { AccountInterface, Call } from "starknet";
import { RESOURCE_TOKENS } from "./useResourceBalances";

// Crafting contract address — set via NEXT_PUBLIC_CRAFTING_1V1_ADDRESS in .env.local
export const CRAFTING_1V1_ADDRESS =
  process.env.NEXT_PUBLIC_CRAFTING_1V1_ADDRESS ||
  "0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235";

// Ability definitions — must stay in sync with src/systems/crafting_1v1.cairo
export const ABILITIES = [
  {
    id: 1,
    name: "Siege Sword",
    effect: "Max damage (10) to one gate for 1 round",
    cost: { iron: 3, wood: 2 },
  },
  {
    id: 2,
    name: "Stone Cloak",
    effect: "Block all gate damage for 1 round",
    cost: { stone: 3, linen: 2 },
  },
  {
    id: 3,
    name: "Ember Blast",
    effect: "Deal 5 direct damage bypassing gates",
    cost: { ember: 3, seeds: 2 },
  },
  {
    id: 4,
    name: "Hex",
    effect: "Opponent's budget reduced by 7 for 1 round",
    cost: { iron: 2, stone: 2, ember: 1 },
  },
  {
    id: 5,
    name: "Fortify",
    effect: "Double defense on all gates for 1 round",
    cost: { stone: 2, linen: 2, wood: 1 },
  },
] as const;

export type AbilityCost = Record<string, number>;

export function canAfford(cost: AbilityCost, balances: Record<string, number>): boolean {
  return Object.entries(cost).every(
    ([resource, amount]) => (balances[resource] || 0) >= amount,
  );
}

// Approve each required token for the crafting contract, then craft the ability in a single multicall.
export async function craftAbility(
  account: AccountInterface,
  abilityId: number,
  cost: AbilityCost,
): Promise<string> {
  const calls: Call[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, amount.toString(), "0"], // u256 (low, high)
    });
  }

  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability",
    calldata: [abilityId.toString()],
  });

  const result = await account.execute(calls);
  return result.transaction_hash;
}
