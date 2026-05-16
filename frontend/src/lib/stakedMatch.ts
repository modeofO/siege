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
import { CONTRACTS_1V1, CONTRACTS_WORLD, vrfRequestRandomCall, waitForReceiptOrThrow } from "@/lib/contracts1v1";
import { ABILITY_TOKEN_ADDRESS, fetchAllAbilityBalances } from "@/lib/abilityToken";
import { toFeltHex } from "@/lib/gameState1v1";
import { useWorldParcels, type ParcelData } from "@/lib/worldState";
import { isNeighbor } from "@/lib/hex";

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

// world_system.create_staked_match calls AbilityToken.safe_transfer_from(caller, world_system, ...).
// OZ ERC-1155 requires the caller of safe_transfer_from to be `from` or an approved operator;
// here msg.sender is world_system, so the user must have approved world_system as operator first.
function approveAbilityTokenForWorldSystem() {
  return {
    contractAddress: ABILITY_TOKEN_ADDRESS,
    entrypoint: "set_approval_for_all",
    calldata: [CONTRACTS_WORLD.WORLD_SYSTEM, "1"],
  };
}

// ---------- Call builders ----------

export async function createStakedMatch(account: AccountInterface, opponent: string, abilities: number[]) {
  // vRF source must be actions_1v1 — create_staked_match forwards to create_match_1v1 where consume_random runs.
  const tx = await account.execute(
    [
      approveAbilityTokenForWorldSystem(),
      vrfRequestRandomCall(CONTRACTS_1V1.ACTIONS),
      {
        contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
        entrypoint: "create_staked_match",
        calldata: [opponent, abilities.length.toString(), ...abilities.map(String)],
      },
    ],
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Create staked match");
  return tx;
}

export async function joinStakedMatch(account: AccountInterface, matchId: string, abilities: number[]) {
  const tx = await account.execute(
    [
      approveAbilityTokenForWorldSystem(),
      {
        contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
        entrypoint: "join_staked_match",
        calldata: [matchId, abilities.length.toString(), ...abilities.map(String)],
      },
    ],
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Join staked match");
  return tx;
}

// Safe on practice matches: Dojo read_model returns a zeroed MatchStakes1v1 default, so the stake-transfer loop iterates zero times.
export async function settleMatch(account: AccountInterface, matchId: string) {
  const tx = await account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "settle_match",
      calldata: [matchId],
    },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Settle match");
  return tx;
}

export async function claimParcel(account: AccountInterface, matchId: string, parcelId: number, parcelType: number) {
  const tx = await account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "claim_parcel",
      calldata: [matchId, parcelId.toString(), parcelType.toString()],
    },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Claim parcel");
  return tx;
}

// ---------- Reads ----------

function safeBigIntEq(a: unknown, b: bigint): boolean {
  try {
    return BigInt(a as string | number | bigint) === b;
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[stakedMatch] safeBigIntEq coercion failed:", a, e);
    return false;
  }
}

function safeNum(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    if (process.env.NODE_ENV === "development") console.warn("[stakedMatch] safeNum coerced to 0:", v);
    return 0;
  }
  return n;
}

function flatModels<T extends object>(store: unknown): T[] {
  const iter = Array.isArray(store) ? store : Object.values(store as Record<string, unknown>);
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
  timedOut: boolean;
}

const EMPTY_ESCROW: MatchEscrowData = {
  a: [0, 0, 0],
  b: [0, 0, 0],
  stakeCount: 0,
  settled: false,
  isStaked: false,
  exists: false,
  loaded: false,
  timedOut: false,
};

const ESCROW_TIMEOUT_MS = 8_000;

// Reads MatchStakes1v1 (escrow + settled). gameState1v1.useMatchStakes1v1 reads MatchAbilities1v1 — different model.
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

  // Timeout: if subscription yields no data after ESCROW_TIMEOUT_MS, surface it.
  const escrowFound = useMemo(() => {
    if (!matchId) return false;
    const idBig = BigInt(matchId);
    return flatModels<MatchStakes1v1Model>(stakes).some((m) => safeBigIntEq(m.match_id, idBig));
  }, [matchId, stakes]);

  const [timeoutTick, setTimeoutTick] = useState(0);
  useEffect(() => {
    if (!matchId || escrowFound) return;
    const timer = setTimeout(() => setTimeoutTick((t) => t + 1), ESCROW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [matchId, escrowFound]);
  // Derived: timed out when we've ticked at least once and still no data.
  const timedOut = timeoutTick > 0 && !escrowFound && !!matchId;

  return useMemo<MatchEscrowData>(() => {
    if (!matchId) return EMPTY_ESCROW;
    const idBig = BigInt(matchId);
    const node = flatModels<MatchStakes1v1Model>(stakes).find((m) => safeBigIntEq(m.match_id, idBig));
    if (!node) return { ...EMPTY_ESCROW, loaded: true, timedOut };
    const a: [number, number, number] = [safeNum(node.a_stake_1), safeNum(node.a_stake_2), safeNum(node.a_stake_3)];
    const b: [number, number, number] = [safeNum(node.b_stake_1), safeNum(node.b_stake_2), safeNum(node.b_stake_3)];
    return {
      a,
      b,
      stakeCount: safeNum(node.stake_count),
      settled: !!node.settled,
      isStaked: a.some((x) => x > 0) || b.some((x) => x > 0),
      exists: true,
      loaded: true,
      timedOut: false,
    };
  }, [matchId, stakes, timedOut]);
}

// ---------- Claim candidates ----------

export interface ClaimCandidatesResult {
  /** Unclaimed parcels adjacent to any of the winner's existing parcels. */
  candidates: ParcelData[];
  loading: boolean;
}

export function useClaimCandidates(
  winnerAddress: string | null | undefined,
): ClaimCandidatesResult {
  const { parcels, loading } = useWorldParcels();

  return useMemo<ClaimCandidatesResult>(() => {
    if (!winnerAddress || loading) {
      return { candidates: [], loading };
    }

    let winnerBig: bigint;
    try {
      winnerBig = BigInt(winnerAddress);
    } catch {
      return { candidates: [], loading };
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
      return { candidates: [], loading };
    }

    const candidates = parcels.filter((p) => {
      if (ownerBig(p.owner) !== BigInt(0)) return false;
      return winnerParcels.some((w) => isNeighbor(w, p));
    });

    return { candidates, loading };
  }, [parcels, loading, winnerAddress]);
}

// ---------- Ability balances hook ----------

export function useAbilityBalances(
  provider: RpcProvider | undefined,
  address: string | null | undefined,
  bumpKey: number = 0,
): { balances: Record<number, number>; loading: boolean; error: string | null } {
  const [balances, setBalances] = useState<Record<number, number>>(() =>
    Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 0])),
  );
  // derived-loading pattern: loading = liveKey !== loadedKey (avoids setState-in-effect for lint).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveKey = provider && address ? `${address}:${bumpKey}` : null;
  const loading = liveKey !== null && loadedKey !== liveKey && error === null;

  useEffect(() => {
    let cancelled = false;
    // Key changed — clear stale state so address A's numbers don't render under address B.
    const zeros = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 0]));
    setBalances(zeros);
    setError(null);
    setLoadedKey(null);
    if (!provider || !address) return;
    const key = `${address}:${bumpKey}`;
    fetchAllAbilityBalances(provider, address)
      .then((result) => {
        if (cancelled) return;
        setBalances(result);
        setLoadedKey(key);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[useAbilityBalances] balance_of_batch failed:", e);
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, address, bumpKey]);

  return { balances, loading, error };
}
