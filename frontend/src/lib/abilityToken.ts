// abilityToken.ts — wrappers for reading ERC-1155 ability balances
import type { RpcProvider } from "starknet";

// Deployed ability token address — override via NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "0x6de8e6addfd54cb600d5a7549e92fa5b275379ff85364626874a00bc138d37c";

export type AbilityInventory = {
  siege_sword: number;
  stone_cloak: number;
  ember_blast: number;
  hex: number;
  fortify: number;
};

export const EMPTY_ABILITY_INVENTORY: AbilityInventory = {
  siege_sword: 0,
  stone_cloak: 0,
  ember_blast: 0,
  hex: 0,
  fortify: 0,
};

// Token ID → inventory field name. Order matches ability IDs 1..5.
const ABILITY_FIELD_BY_ID: (keyof AbilityInventory)[] = [
  "siege_sword", // id 1
  "stone_cloak", // id 2
  "ember_blast", // id 3
  "hex",         // id 4
  "fortify",     // id 5
];

/**
 * Fetch all 5 ability balances for a player via balance_of_batch.
 *
 * Calldata layout for `balance_of_batch(accounts: Array<ContractAddress>, token_ids: Array<u256>)`:
 *   [accounts_len, ...accounts, token_ids_len, ...token_ids_flat_u256]
 * where each u256 is two felts (low, high).
 */
export async function fetchAbilityBalances(
  provider: RpcProvider,
  playerAddress: string,
): Promise<AbilityInventory> {
  try {
    // Build calldata: 5 accounts (all the same player), 5 token ids (1..5)
    const accountsLen = "5";
    const accountRepeats = [playerAddress, playerAddress, playerAddress, playerAddress, playerAddress];
    const tokenIdsLen = "5";
    // Each u256 is two felts: (low, high). All IDs fit in low.
    const tokenIds = ["1", "0", "2", "0", "3", "0", "4", "0", "5", "0"];

    const result = await provider.callContract({
      contractAddress: ABILITY_TOKEN_ADDRESS,
      entrypoint: "balance_of_batch",
      calldata: [accountsLen, ...accountRepeats, tokenIdsLen, ...tokenIds],
    });

    // Result layout: [array_len, balance1_low, balance1_high, balance2_low, balance2_high, ...]
    // We expect array_len == 5
    if (result.length < 11) {
      return EMPTY_ABILITY_INVENTORY;
    }

    const inventory: AbilityInventory = { ...EMPTY_ABILITY_INVENTORY };
    for (let i = 0; i < 5; i++) {
      const lowFelt = result[1 + i * 2];
      // values are small — just use the low felt
      const count = Number(BigInt(lowFelt || 0));
      const field = ABILITY_FIELD_BY_ID[i];
      inventory[field] = count;
    }
    return inventory;
  } catch {
    return EMPTY_ABILITY_INVENTORY;
  }
}
