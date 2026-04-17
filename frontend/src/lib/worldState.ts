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

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
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

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

// --- Parcel data ---

export interface ParcelData {
  parcelId: number;
  col: number;
  row: number;
  parcelType: number; // 0=Forge, 1=Quarry, 2=Grove
  owner: string; // hex address, "0x0" = unclaimed
  isHome: boolean;
}

export function useWorldParcels(refreshKey?: number) {
  const [parcels, setParcels] = useState<ParcelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoParcelModels: GraphEdges<{
          parcel_id: string;
          col: string;
          row: string;
          parcel_type: string;
          owner: string;
          is_home: boolean;
        }>;
      }>(`
        query {
          siegeDojoParcelModels(first: 500) {
            edges { node {
              parcel_id col row parcel_type owner is_home
            } }
          }
        }
      `);

      const edges = data?.siegeDojoParcelModels?.edges;
      if (edges) {
        setParcels(
          edges.map((e) => ({
            parcelId: toNum(e.node.parcel_id),
            col: toNum(e.node.col),
            row: toNum(e.node.row),
            parcelType: toNum(e.node.parcel_type),
            owner: e.node.owner || "0x0",
            isHome: !!e.node.is_home,
          })),
        );
      }
      setLoading(false);
    };

    const t = setTimeout(() => {
      void fetch();
    }, 0);
    const i = setInterval(() => {
      void fetch();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
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
