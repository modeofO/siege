"use client";

import { useEffect, useMemo, useState } from "react";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type Parcel as ParcelModel,
  type PlayerKingdom as PlayerKingdomModel,
} from "@/bindings/typescript/models.gen";
import { safeNum, flatModels } from "./modelUtils";
import { useVisibilityReseed } from "./useReseed";

// --- Parcel data ---

export interface ParcelData {
  parcelId: number;
  col: number;
  row: number;
  parcelType: number; // 0=Forge, 1=Quarry, 2=Grove, 255=Untyped
  owner: string; // hex address, "0x0" = unclaimed
  isHome: boolean;
}

/**
 * How long to wait before treating an empty store as a genuinely empty world
 * rather than a subscription that has not delivered its first page yet. The
 * SQL poller could distinguish the two (a response arrived, it had no rows);
 * a store selector cannot, so `loading` needs a floor. Exported for other
 * store-backed panels with the same ambiguity (Live Battles).
 */
export const INITIAL_LOAD_GRACE_MS = 2500;

export function useSettled(ms: number): boolean {
  const [settled, setSettled] = useState(false);
  // setState lives in the timeout callback, not the effect body — required by
  // react-hooks/set-state-in-effect (see frontend/CLAUDE.md).
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return settled;
}

/** Reads the store populated by `useWorldSubscription` — see worldSubscription.ts. */
export function useWorldParcels() {
  const parcelModels = useModels(ModelsMapping.Parcel);
  const settled = useSettled(INITIAL_LOAD_GRACE_MS);

  const parcels = useMemo<ParcelData[]>(
    () =>
      flatModels<ParcelModel>(parcelModels)
        .map((p) => ({
          parcelId: safeNum(p.parcel_id),
          col: safeNum(p.col),
          row: safeNum(p.row),
          parcelType: safeNum(p.parcel_type),
          owner: p.owner || "0x0",
          isHome: !!p.is_home,
        }))
        // The store is keyed by entity id and has no inherent order; the SQL
        // path returned insertion order. Sort so renders stay stable.
        .sort((a, b) => a.parcelId - b.parcelId),
    [parcelModels],
  );

  return { parcels, loading: parcels.length === 0 && !settled };
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

/**
 * Static query — deliberately NOT keyed by the player address. A query that
 * changes after mount (e.g. when the wallet connects) routes the SDK through
 * its updateEntitySubscription path, which re-keys the live stream but never
 * re-runs the seed fetch — the new address's data then appears only as it
 * next changes on-chain (see frontend/CLAUDE.md "Reads"). A query that never
 * changes never takes that path. The selector filters by address instead;
 * PlayerKingdom is player-count sized, so the wildcard stays cheap.
 */
export function playerKingdomQuery() {
  return new ToriiQueryBuilder<SchemaType>()
    .withClause(KeysClause<SchemaType>([ModelsMapping.PlayerKingdom], [undefined], "VariableLen").build())
    .withEntityModels([ModelsMapping.PlayerKingdom])
    .withLimit(10_000)
    .includeHashedKeys();
}

function kingdomReseedQueries() {
  return [playerKingdomQuery()];
}

export function usePlayerKingdom(playerAddress: string | null, _refreshKey?: number) {
  useEntityQuery(playerKingdomQuery());
  useVisibilityReseed(kingdomReseedQueries);

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
