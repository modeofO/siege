// frontend/src/lib/worldState.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type PlayerKingdom as PlayerKingdomModel,
} from "@/bindings/typescript/models.gen";
import { toriiSql, toNum } from "./toriiSql";

const POLL_INTERVAL = 4000;

function safeNum(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

// --- Parcel data ---

export interface ParcelData {
  tileId: number;
  sectorId: number;
  tileShape: number; // 0=square, 1=rhombus
  zone: number;      // 0=core, 1=mid, 2=frontier
  parcelType: number;
  owner: string;
  isHome: boolean;
  isStranded: boolean;
}

export function useWorldParcels(refreshKey?: number) {
  const [parcels, setParcels] = useState<ParcelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const doFetch = async () => {
      const rows = await toriiSql<{
        tile_id: number;
        sector_id: number;
        tile_shape: number;
        zone: number;
        parcel_type: number;
        owner: string;
        is_home: number;
        is_stranded: number;
      }>('SELECT tile_id, sector_id, tile_shape, zone, parcel_type, owner, is_home, is_stranded FROM "siege_dojo-Parcel"');

      if (rows.length > 0) {
        setParcels(
          rows.map((r) => ({
            tileId: toNum(r.tile_id),
            sectorId: toNum(r.sector_id),
            tileShape: toNum(r.tile_shape),
            zone: toNum(r.zone),
            parcelType: toNum(r.parcel_type),
            owner: r.owner || "0x0",
            isHome: !!r.is_home,
            isStranded: !!r.is_stranded,
          })),
        );
      }
      setLoading(false);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refreshKey]);

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

// --- Tile adjacency ---

export interface TileAdjacencyData {
  tileId: number;
  edgeIndex: number;
  neighborTileId: number;
}

export function useTileAdjacency(refreshKey?: number) {
  const [adjacency, setAdjacency] = useState<TileAdjacencyData[]>([]);

  useEffect(() => {
    const doFetch = async () => {
      const rows = await toriiSql<{
        tile_id: number;
        edge_index: number;
        neighbor_tile_id: number;
      }>('SELECT tile_id, edge_index, neighbor_tile_id FROM "siege_dojo-TileAdjacency"');

      setAdjacency(
        rows.map((r) => ({
          tileId: toNum(r.tile_id),
          edgeIndex: toNum(r.edge_index),
          neighborTileId: toNum(r.neighbor_tile_id),
        })),
      );
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refreshKey]);

  return adjacency;
}

// --- World fold state ---

export interface WorldFoldState {
  isWorldFolded: boolean;
  foldEpoch: number;
  totalFolds: number;
}

export function useWorldFoldState(refreshKey?: number) {
  const [foldState, setFoldState] = useState<WorldFoldState>({
    isWorldFolded: false,
    foldEpoch: 0,
    totalFolds: 0,
  });

  useEffect(() => {
    const doFetch = async () => {
      const rows = await toriiSql<{
        is_world_folded: number;
        fold_epoch: number;
        total_folds: number;
      }>('SELECT is_world_folded, fold_epoch, total_folds FROM "siege_dojo-WorldConfig" WHERE id = 0');

      if (rows.length > 0) {
        setFoldState({
          isWorldFolded: !!rows[0].is_world_folded,
          foldEpoch: toNum(rows[0].fold_epoch),
          totalFolds: toNum(rows[0].total_folds),
        });
      }
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refreshKey]);

  return foldState;
}
