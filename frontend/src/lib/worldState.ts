// frontend/src/lib/worldState.ts
"use client";

import { useMemo, useState } from "react";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type PlayerKingdom as PlayerKingdomModel,
} from "@/bindings/typescript/models.gen";
import { toriiSql, toNum } from "./toriiSql";
import { safeNum, flatModels } from "./modelUtils";
import { usePoll } from "./usePoll";

const POLL_INTERVAL = 4000;

// --- Parcel data ---

export interface ParcelData {
  parcelId: number;
  col: number;
  row: number;
  parcelType: number; // 0=Forge, 1=Quarry, 2=Grove, 255=Untyped
  owner: string; // hex address, "0x0" = unclaimed
  isHome: boolean;
}

export function useWorldParcels(refreshKey?: number) {
  const [parcels, setParcels] = useState<ParcelData[]>([]);
  const [loading, setLoading] = useState(true);

  usePoll(
    async (alive) => {
      const rows = await toriiSql<{
        parcel_id: number;
        col: number;
        row: number;
        parcel_type: number;
        owner: string;
        is_home: number;
      }>('SELECT parcel_id, col, row, parcel_type, owner, is_home FROM "siege_dojo-Parcel"');
      if (!alive()) return;

      if (rows.length > 0) {
        setParcels(
          rows.map((r) => ({
            parcelId: toNum(r.parcel_id),
            col: toNum(r.col),
            row: toNum(r.row),
            parcelType: toNum(r.parcel_type),
            owner: r.owner || "0x0",
            isHome: !!r.is_home,
          })),
        );
      }
      setLoading(false);
    },
    POLL_INTERVAL,
    [refreshKey],
  );

  return { parcels, loading };
}

// --- Player kingdom ---

export interface PlayerKingdomData {
  registered: boolean;
  home0: number;
  home1: number;
  home2: number;
  parcelCount: number;
  freeCraftUsed: boolean;
  tier: number;
  totalWins: number;
  factionReinforcementEnabled: boolean;
}

const EMPTY_KINGDOM: PlayerKingdomData = {
  registered: false,
  home0: 0,
  home1: 0,
  home2: 0,
  parcelCount: 0,
  freeCraftUsed: false,
  tier: 0,
  totalWins: 0,
  factionReinforcementEnabled: false,
};

export function usePlayerKingdom(playerAddress: string | null, _refreshKey?: number) {
  useEntityQuery(
    new ToriiQueryBuilder<SchemaType>()
      .withClause(
        KeysClause<SchemaType>([ModelsMapping.PlayerKingdom], [playerAddress ?? undefined], "VariableLen").build(),
      )
      .includeHashedKeys(),
  );

  const kingdoms = useModels(ModelsMapping.PlayerKingdom);

  return useMemo<PlayerKingdomData>(() => {
    if (!playerAddress) return EMPTY_KINGDOM;
    const addr = playerAddress.toLowerCase();
    const k = flatModels<PlayerKingdomModel>(kingdoms).find((x) => String(x.player).toLowerCase() === addr);
    if (!k) return EMPTY_KINGDOM;
    return {
      registered: !!k.registered,
      home0: safeNum(k.home_0),
      home1: safeNum(k.home_1),
      home2: safeNum(k.home_2),
      parcelCount: safeNum(k.parcel_count),
      freeCraftUsed: !!k.free_craft_used,
      tier: safeNum(k.tier),
      totalWins: safeNum(k.total_wins),
      factionReinforcementEnabled: !!k.faction_reinforcement_enabled,
    };
  }, [playerAddress, kingdoms]);
}
