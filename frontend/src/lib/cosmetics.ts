import { useMemo } from "react";
import { cairo } from "starknet";
import type { AccountInterface, UniversalDetails } from "starknet";
import { useModels } from "@dojoengine/sdk/react";
import {
  ModelsMapping,
  type PlayerCosmetics as PlayerCosmeticsModel,
} from "@/bindings/typescript/models.gen";
import { WORLD_SYSTEM_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { feltToStr } from "./toriiSql";
import { safeBigIntEq, flatModels, toBigIntOrNull } from "./modelUtils";
import type { CircuitKey, CosmeticType } from "./forge/circuits";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

export interface PlayerCosmeticsData {
  banner: CircuitKey | null;
  parcelSkin: CircuitKey | null;
  holdDecoration: CircuitKey | null;
}

const EMPTY_COSMETICS: PlayerCosmeticsData = {
  banner: null,
  parcelSkin: null,
  holdDecoration: null,
};

function normalizeAddr(a: string): string {
  try {
    return "0x" + BigInt(a).toString(16);
  } catch {
    return a.toLowerCase();
  }
}

function feltToCircuitKey(felt: string | null): CircuitKey | null {
  if (!felt || felt === "0x0" || felt === "0") return null;
  const decoded = feltToStr(felt);
  return decoded ? (decoded as CircuitKey) : null;
}

function toCosmeticsData(c: PlayerCosmeticsModel): PlayerCosmeticsData {
  return {
    banner: feltToCircuitKey(String(c.banner ?? "")),
    parcelSkin: feltToCircuitKey(String(c.parcel_skin ?? "")),
    holdDecoration: feltToCircuitKey(String(c.hold_decoration ?? "")),
  };
}

/** Reads the store populated by `useWorldSubscription` — see worldSubscription.ts. */
export function usePlayerCosmetics(playerAddress: string | undefined): PlayerCosmeticsData {
  const cosmetics = useModels(ModelsMapping.PlayerCosmetics);

  return useMemo(() => {
    const addr = toBigIntOrNull(playerAddress);
    if (addr === null) return EMPTY_COSMETICS;
    const c = flatModels<PlayerCosmeticsModel>(cosmetics).find((x) => safeBigIntEq(x.player, addr));
    return c ? toCosmeticsData(c) : EMPTY_COSMETICS;
  }, [cosmetics, playerAddress]);
}

/** Reads the store populated by `useWorldSubscription` — see worldSubscription.ts. */
export function useBulkPlayerCosmetics(
  playerAddresses: string[],
): Record<string, PlayerCosmeticsData> {
  const cosmetics = useModels(ModelsMapping.PlayerCosmetics);

  // Stable key: parcels.map() hands in a fresh array every render, so
  // memoizing on its identity would recompute constantly.
  const addrsKey = useMemo(
    () => Array.from(new Set(playerAddresses.map(normalizeAddr))).sort().join(","),
    [playerAddresses],
  );

  return useMemo(() => {
    if (!addrsKey) return {};
    const wanted = new Set(addrsKey.split(","));
    const map: Record<string, PlayerCosmeticsData> = {};
    for (const c of flatModels<PlayerCosmeticsModel>(cosmetics)) {
      const addr = normalizeAddr(c.player);
      if (wanted.has(addr)) map[addr] = toCosmeticsData(c);
    }
    return map;
  }, [cosmetics, addrsKey]);
}

const COSMETIC_TYPE_MAP: Record<CosmeticType, string> = {
  banner: "banner",
  parcelSkin: "parcel_skin",
  holdDecoration: "hold_decoration",
};

export async function setCosmetic(
  account: AccountInterface,
  cosmeticType: CosmeticType,
  circuitKey: CircuitKey | null,
): Promise<string> {
  const typeStr = COSMETIC_TYPE_MAP[cosmeticType];
  const typeFelt = cairo.felt(typeStr);
  const keyFelt = circuitKey ? cairo.felt(circuitKey) : "0x0";

  const result = await resilientExecute(
    account,
    [
      {
        contractAddress: WORLD_SYSTEM_ADDRESS,
        entrypoint: "set_cosmetic",
        calldata: [typeFelt, keyFelt],
      },
    ],
    IS_DEVNET ? DEVNET_TX_OPTS : undefined,
  );

  return result.transaction_hash;
}
