// frontend/src/lib/stakedMatch.ts
//
// Staked-match contract wrappers + reads. Pairs with world_system:
//   create_staked_match(opponent, abilities) -> match_id
//   join_staked_match(match_id, abilities)
//   settle_match(match_id)          — asserts !stakes.settled
//   claim_parcel(match_id, parcel_id) — requires stakes.settled, parcel unclaimed
//
// Plus a gRPC subscription on MatchStakes1v1 (with the real `settled` flag —
// unlike useMatchStakes1v1 in gameState1v1.ts which reads MatchAbilities1v1).
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountInterface, RpcProvider, UniversalDetails } from "starknet";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type MatchStakes1v1 as MatchStakes1v1Model,
} from "@/bindings/typescript/models.gen";
import { CONTRACTS_1V1, CONTRACTS_WORLD, vrfRequestRandomCall } from "@/lib/contracts1v1";
import { fetchAllAbilityBalances } from "@/lib/abilityToken";
import { useWorldParcels, type ParcelData } from "@/lib/worldState";
import { isNeighbor } from "@/lib/hex";
import { TIER_INFO } from "@/lib/tiers";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// ---------- Call builders ----------

/**
 * Creates a staked 1v1 match. Caller becomes player_a. `abilities` is 1..3
 * ability token IDs (1-10) that get escrowed on world_system. Match starts in
 * Pending status until the opponent calls joinStakedMatch.
 */
export async function createStakedMatch(
  account: AccountInterface,
  opponent: string,
  abilities: number[],
) {
  // world_system.create_staked_match invokes actions_1v1.create_match_1v1
  // internally, which consumes vRF to roll the first round's gate modifiers.
  // The request_random source must match actions_1v1 (where consume_random
  // runs via get_contract_address), not world_system.
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.ACTIONS),
      {
        contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
        entrypoint: "create_staked_match",
        calldata: [opponent, abilities.length.toString(), ...abilities.map(String)],
      },
    ],
    TX_OPTS,
  );
}

/**
 * Joins a pending staked match. Caller must be match.player_b. Wager is
 * min(a_count, b_count); any excess on either side is refunded. Transitions
 * the match to Active and wires MatchAbilities1v1 for battle use.
 */
export async function joinStakedMatch(
  account: AccountInterface,
  matchId: string,
  abilities: number[],
) {
  return account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "join_staked_match",
      calldata: [matchId, abilities.length.toString(), ...abilities.map(String)],
    },
    TX_OPTS,
  );
}

/**
 * Settles a finished match. Transfers escrowed abilities to the winner (or
 * refunds both on draw), releases the loser's furthest-from-home parcel,
 * updates reputation/match records, grants pillage eligibility if neighbors.
 * Callable on practice matches too — MatchStakes1v1 exists with zeros and
 * the stake-transfer loop becomes a no-op.
 */
export async function settleMatch(account: AccountInterface, matchId: string) {
  return account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "settle_match",
      calldata: [matchId],
    },
    TX_OPTS,
  );
}

/**
 * Winner claims an unclaimed parcel adjacent to their territory. Gated on
 * parcel cap, adjacency, and stakes.settled. Parcel must have owner == 0 —
 * settleMatch releases the loser's furthest parcel, which typically produces
 * the adjacent candidate.
 */
export async function claimParcel(
  account: AccountInterface,
  matchId: string,
  parcelId: number,
) {
  return account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "claim_parcel",
      calldata: [matchId, parcelId.toString()],
    },
    TX_OPTS,
  );
}

// ---------- Reads ----------

function safeBigIntEq(a: unknown, b: bigint): boolean {
  try {
    return BigInt(a as string | number | bigint) === b;
  } catch {
    return false;
  }
}

function safeNum(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function flatModels<T extends object>(store: unknown): T[] {
  const iter = Array.isArray(store)
    ? store
    : Object.values(store as Record<string, unknown>);
  const out: T[] = [];
  for (const entry of iter) {
    if (!entry || typeof entry !== "object") continue;
    for (const v of Object.values(entry as Record<string, unknown>)) {
      if (v && typeof v === "object") out.push(v as T);
    }
  }
  return out;
}

export interface MatchEscrowData {
  a: [number, number, number];
  b: [number, number, number];
  stakeCount: number;
  settled: boolean;
  isStaked: boolean;
  exists: boolean;
  loaded: boolean;
}

const EMPTY_ESCROW: MatchEscrowData = {
  a: [0, 0, 0],
  b: [0, 0, 0],
  stakeCount: 0,
  settled: false,
  isStaked: false,
  exists: false,
  loaded: false,
};

function toFeltHex(matchId: string): string {
  try {
    return "0x" + BigInt(matchId).toString(16);
  } catch {
    return matchId;
  }
}

/**
 * Subscribes to the MatchStakes1v1 row for a match via gRPC. Returns the
 * `settled` flag (source of truth for whether settle_match has been called)
 * plus the escrowed stake lists for both sides.
 *
 * Distinct from useMatchStakes1v1 in gameState1v1.ts, which reads
 * MatchAbilities1v1 (the in-round ability model, not the stake escrow).
 */
export function useMatchEscrow(matchId: string | null): MatchEscrowData {
  useEntityQuery(
    new ToriiQueryBuilder<SchemaType>()
      .withClause(
        KeysClause<SchemaType>(
          [ModelsMapping.MatchStakes1v1],
          [matchId ? toFeltHex(matchId) : undefined],
          "VariableLen",
        ).build(),
      )
      .includeHashedKeys(),
  );

  const stakes = useModels(ModelsMapping.MatchStakes1v1);

  return useMemo<MatchEscrowData>(() => {
    if (!matchId) return EMPTY_ESCROW;
    const idBig = BigInt(matchId);
    const node = flatModels<MatchStakes1v1Model>(stakes).find((m) =>
      safeBigIntEq(m.match_id, idBig),
    );
    if (!node) return { ...EMPTY_ESCROW, loaded: true };
    const a: [number, number, number] = [
      safeNum(node.a_stake_1), safeNum(node.a_stake_2), safeNum(node.a_stake_3),
    ];
    const b: [number, number, number] = [
      safeNum(node.b_stake_1), safeNum(node.b_stake_2), safeNum(node.b_stake_3),
    ];
    return {
      a,
      b,
      stakeCount: safeNum(node.stake_count),
      settled: !!node.settled,
      isStaked: a.some((x) => x > 0) || b.some((x) => x > 0),
      exists: true,
      loaded: true,
    };
  }, [matchId, stakes]);
}

// ---------- Claim candidates ----------

export interface ClaimCandidatesResult {
  /** Unclaimed parcels adjacent to any of the winner's existing parcels. */
  candidates: ParcelData[];
  /** True when winner's non-home parcel count has hit tier_parcel_cap. */
  atCap: boolean;
  /** Winner's current non-home parcel count. */
  nonHomeCount: number;
  /** Winner's tier-specific parcel cap. */
  parcelCap: number;
  loading: boolean;
}

/**
 * Returns parcels the winner can claim: owner == 0, hex-adjacent to any parcel
 * the winner already owns, and within tier_parcel_cap. Used by the match-end
 * claim picker. `parcelCount` is the winner's PlayerKingdom.parcel_count, from
 * which we derive non-home count (parcel_count > 3 ? parcel_count - 3 : 0).
 */
export function useClaimCandidates(
  winnerAddress: string | null | undefined,
  winnerTier: number,
  winnerParcelCount: number,
): ClaimCandidatesResult {
  const { parcels, loading } = useWorldParcels();

  return useMemo<ClaimCandidatesResult>(() => {
    const parcelCap = TIER_INFO[winnerTier]?.parcelCap ?? TIER_INFO[0].parcelCap;
    const nonHomeCount = winnerParcelCount > 3 ? winnerParcelCount - 3 : 0;
    const atCap = nonHomeCount >= parcelCap;

    if (!winnerAddress || loading || atCap) {
      return { candidates: [], atCap, nonHomeCount, parcelCap, loading };
    }

    let winnerBig: bigint;
    try {
      winnerBig = BigInt(winnerAddress);
    } catch {
      return { candidates: [], atCap, nonHomeCount, parcelCap, loading };
    }

    const ownerBig = (addr: string): bigint | null => {
      try {
        return BigInt(addr || "0x0");
      } catch {
        return null;
      }
    };

    const winnerParcels = parcels.filter((p) => ownerBig(p.owner) === winnerBig);
    if (winnerParcels.length === 0) {
      return { candidates: [], atCap, nonHomeCount, parcelCap, loading };
    }

    const candidates = parcels.filter((p) => {
      if (ownerBig(p.owner) !== BigInt(0)) return false;
      return winnerParcels.some((w) => isNeighbor(w.col, w.row, p.col, p.row));
    });

    return { candidates, atCap, nonHomeCount, parcelCap, loading };
  }, [parcels, loading, winnerAddress, winnerTier, winnerParcelCount]);
}

// ---------- Ability balances hook ----------

/**
 * Reads the player's ERC-1155 ability balances via balance_of_batch on the
 * AbilityToken contract. Returns a map keyed by token ID (1..10). Refetches
 * when `bumpKey` changes so callers can force a refresh after a tx.
 */
export function useAbilityBalances(
  provider: RpcProvider | undefined,
  address: string | null | undefined,
  bumpKey: number = 0,
): { balances: Record<number, number>; loading: boolean } {
  const [balances, setBalances] = useState<Record<number, number>>(
    () => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 0])),
  );
  // Track which (address, bumpKey) pair the current `balances` were fetched
  // for. `loading` is derived by comparing against the live pair — avoids
  // synchronous setState in the effect body (the project lints strictly).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const liveKey = provider && address ? `${address}:${bumpKey}` : null;
  const loading = liveKey !== null && loadedKey !== liveKey;

  useEffect(() => {
    let cancelled = false;
    if (!provider || !address) return;
    const key = `${address}:${bumpKey}`;
    fetchAllAbilityBalances(provider, address).then((result) => {
      if (!cancelled) {
        setBalances(result);
        setLoadedKey(key);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider, address, bumpKey]);

  return { balances, loading };
}
