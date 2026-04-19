// abilityToken.ts — wrappers for reading ERC-1155 ability balances
import { byteArray, type RpcProvider } from "starknet";

// Deployed ability token address — override via NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb";

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
  "hex", // id 4
  "fortify", // id 5
];

/**
 * Fetch all 5 ability balances for a player via balance_of_batch.
 *
 * Calldata layout for `balance_of_batch(accounts: Array<ContractAddress>, token_ids: Array<u256>)`:
 *   [accounts_len, ...accounts, token_ids_len, ...token_ids_flat_u256]
 * where each u256 is two felts (low, high).
 */
export async function fetchAbilityBalances(provider: RpcProvider, playerAddress: string): Promise<AbilityInventory> {
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

/**
 * Fetch balances for all 10 ability token IDs (T1: 1-5, T2: 6-10).
 * Returns a map keyed by token ID. Missing IDs default to 0.
 */
export async function fetchAllAbilityBalances(
  provider: RpcProvider,
  playerAddress: string,
): Promise<Record<number, number>> {
  const ids = Array.from({ length: 10 }, (_, i) => i + 1);
  const accounts = ids.map(() => playerAddress);
  const tokenIdsFlat: string[] = [];
  for (const id of ids) tokenIdsFlat.push(id.toString(), "0");

  const result = await provider.callContract({
    contractAddress: ABILITY_TOKEN_ADDRESS,
    entrypoint: "balance_of_batch",
    calldata: [accounts.length.toString(), ...accounts, ids.length.toString(), ...tokenIdsFlat],
  });

  const balances: Record<number, number> = {};
  for (let i = 1; i <= 10; i++) balances[i] = 0;
  // Layout: [array_len, bal1_low, bal1_high, ...]
  for (let i = 0; i < 10 && 1 + i * 2 < result.length; i++) {
    const low = result[1 + i * 2];
    balances[i + 1] = Number(BigInt(low || 0));
  }
  return balances;
}

export interface AbilityMetadata {
  name: string;
  description: string;
  image: string; // Full data URI, e.g. "data:image/svg+xml;utf8,<svg ...>"
}

/**
 * Decode a Cairo ByteArray serialised as a felt array (from callContract) back
 * into a JS string. Layout: [num_full_words, ...words, pending_word, pending_word_len].
 */
function decodeByteArrayFelts(felts: string[]): string {
  if (!felts.length) return "";
  const numFullWords = Number(BigInt(felts[0]));
  const data = felts.slice(1, 1 + numFullWords);
  const pending_word = felts[1 + numFullWords] ?? "0";
  const pending_word_len = felts[2 + numFullWords] ?? "0";
  return byteArray.stringFromByteArray({ data, pending_word, pending_word_len });
}

// Module-level cache: metadata is immutable per token ID (admin-settable SVGs
// but the app reloads on deploy, and content rarely changes at runtime).
const metadataCache = new Map<number, AbilityMetadata>();
const inflight = new Map<number, Promise<AbilityMetadata | null>>();

/**
 * Read AbilityToken.uri(id) and return parsed metadata. Decodes the returned
 * ByteArray → base64 JSON data-URI → JSON. Caches the result in-memory.
 */
export async function fetchAbilityMetadata(provider: RpcProvider, tokenId: number): Promise<AbilityMetadata | null> {
  const cached = metadataCache.get(tokenId);
  if (cached) return cached;
  const existing = inflight.get(tokenId);
  if (existing) return existing;

  const job = (async () => {
    try {
      const result = await provider.callContract({
        contractAddress: ABILITY_TOKEN_ADDRESS,
        entrypoint: "uri",
        calldata: [tokenId.toString(), "0"],
      });
      const uri = decodeByteArrayFelts(result);
      // Expected: "data:application/json;base64,<base64>"
      const commaIdx = uri.indexOf(",");
      if (commaIdx < 0) return null;
      const base64 = uri.slice(commaIdx + 1);
      const json = JSON.parse(
        typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("utf-8"),
      );
      const meta: AbilityMetadata = {
        name: json.name ?? "",
        description: json.description ?? "",
        image: json.image ?? "",
      };
      metadataCache.set(tokenId, meta);
      return meta;
    } catch {
      return null;
    } finally {
      inflight.delete(tokenId);
    }
  })();

  inflight.set(tokenId, job);
  return job;
}
