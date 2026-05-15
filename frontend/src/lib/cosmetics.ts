import { useState, useEffect } from "react";
import { Account, shortString } from "starknet";
import { toriiSql } from "./toriiSql";
import type { CircuitKey, CosmeticType } from "./forge/circuits";

const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "0x0";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
    l2_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
    l1_data_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
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

function feltToCircuitKey(felt: string | null): CircuitKey | null {
  if (!felt || felt === "0x0" || felt === "0") return null;
  try {
    const decoded = shortString.decodeShortString(felt);
    return decoded as CircuitKey;
  } catch {
    return null;
  }
}

export function usePlayerCosmetics(
  playerAddress: string | undefined,
  refreshKey?: number,
): PlayerCosmeticsData {
  const [data, setData] = useState<PlayerCosmeticsData>(EMPTY_COSMETICS);

  useEffect(() => {
    if (!playerAddress) return;

    let cancelled = false;

    const fetchCosmetics = async () => {
      const rows = await toriiSql<{
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(
        `SELECT banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics" WHERE player = '${playerAddress}'`,
      );

      if (cancelled) return;

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
    };

    fetchCosmetics();
    const interval = setInterval(fetchCosmetics, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerAddress, refreshKey]);

  return data;
}

export function useBulkPlayerCosmetics(
  playerAddresses: string[],
  refreshKey?: number,
): Record<string, PlayerCosmeticsData> {
  const [data, setData] = useState<Record<string, PlayerCosmeticsData>>({});

  useEffect(() => {
    if (playerAddresses.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
      const rows = await toriiSql<{
        player: string;
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(`SELECT player, banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics"`);

      if (cancelled) return;

      const map: Record<string, PlayerCosmeticsData> = {};
      for (const row of rows) {
        map[row.player] = {
          banner: feltToCircuitKey(row.banner),
          parcelSkin: feltToCircuitKey(row.parcel_skin),
          holdDecoration: feltToCircuitKey(row.hold_decoration),
        };
      }
      setData(map);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerAddresses.length, refreshKey]);

  return data;
}

const COSMETIC_TYPE_MAP: Record<CosmeticType, string> = {
  banner: "banner",
  parcelSkin: "parcel_skin",
  holdDecoration: "hold_decoration",
};

export async function setCosmetic(
  account: Account,
  cosmeticType: CosmeticType,
  circuitKey: CircuitKey | null,
): Promise<string> {
  const typeStr = COSMETIC_TYPE_MAP[cosmeticType];
  const typeFelt = shortString.encodeShortString(typeStr);
  const keyFelt = circuitKey
    ? shortString.encodeShortString(circuitKey)
    : "0x0";

  const result = await account.execute(
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
