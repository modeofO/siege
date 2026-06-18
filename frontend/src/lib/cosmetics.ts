import { useState, useMemo } from "react";
import { cairo } from "starknet";
import type { AccountInterface, UniversalDetails } from "starknet";
import { WORLD_SYSTEM_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { toriiSql, feltToStr, sqlAddr } from "./toriiSql";
import { usePoll } from "./usePoll";
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

export function usePlayerCosmetics(
  playerAddress: string | undefined,
  refreshKey?: number,
): PlayerCosmeticsData {
  const [data, setData] = useState<PlayerCosmeticsData>(EMPTY_COSMETICS);

  usePoll(
    async (alive) => {
      if (!playerAddress) return;
      const rows = await toriiSql<{
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(
        `SELECT banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics" WHERE player = ${sqlAddr(playerAddress)}`,
      );
      if (!alive()) return;

      if (rows.length === 0) {
        setData(EMPTY_COSMETICS);
        return;
      }

      const row = rows[0];
      setData({
        banner: feltToCircuitKey(row.banner),
        parcelSkin: feltToCircuitKey(row.parcel_skin),
        holdDecoration: feltToCircuitKey(row.hold_decoration),
      });
    },
    4000,
    [playerAddress, refreshKey],
    !!playerAddress,
  );

  return data;
}

export function useBulkPlayerCosmetics(
  playerAddresses: string[],
  refreshKey?: number,
): Record<string, PlayerCosmeticsData> {
  const [data, setData] = useState<Record<string, PlayerCosmeticsData>>({});

  // Stable key so the poll restarts when the set of addresses actually
  // changes, not just its length.
  const addrsKey = useMemo(() => {
    const normalized: string[] = [];
    for (const a of playerAddresses) {
      try {
        normalized.push(sqlAddr(a));
      } catch {
        // skip malformed addresses
      }
    }
    return normalized.sort().join(",");
  }, [playerAddresses]);

  usePoll(
    async (alive) => {
      if (!addrsKey) return;
      const rows = await toriiSql<{
        player: string;
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(
        `SELECT player, banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics" WHERE player IN (${addrsKey})`,
      );
      if (!alive()) return;

      const map: Record<string, PlayerCosmeticsData> = {};
      for (const row of rows) {
        map[normalizeAddr(row.player)] = {
          banner: feltToCircuitKey(row.banner),
          parcelSkin: feltToCircuitKey(row.parcel_skin),
          holdDecoration: feltToCircuitKey(row.hold_decoration),
        };
      }
      setData(map);
    },
    4000,
    [addrsKey, refreshKey],
    addrsKey.length > 0,
  );

  return data;
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
