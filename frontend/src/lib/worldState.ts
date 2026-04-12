// frontend/src/lib/worldState.ts
"use client";

import { useEffect, useState } from "react";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

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
  owner: string;      // hex address, "0x0" = unclaimed
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

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
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

export function usePlayerKingdom(playerAddress: string | null, refreshKey?: number) {
  const [kingdom, setKingdom] = useState<PlayerKingdomData>({
    registered: false,
    home0: 0, home1: 0, home2: 0,
    parcelCount: 0,
    freeCraftUsed: false,
    tier: 0,
    totalWins: 0,
    factionReinforcementEnabled: false,
  });

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoPlayerKingdomModels: GraphEdges<{
          registered: boolean;
          home_0: string;
          home_1: string;
          home_2: string;
          parcel_count: string;
          free_craft_used: boolean;
          tier: string;
          total_wins: string;
          faction_reinforcement_enabled: boolean;
        }>;
      }>(`
        query {
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node {
              registered home_0 home_1 home_2 parcel_count free_craft_used
              tier total_wins faction_reinforcement_enabled
            } }
          }
        }
      `);

      const node = data?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;
      if (node) {
        setKingdom({
          registered: !!node.registered,
          home0: toNum(node.home_0),
          home1: toNum(node.home_1),
          home2: toNum(node.home_2),
          parcelCount: toNum(node.parcel_count),
          freeCraftUsed: !!node.free_craft_used,
          tier: toNum(node.tier),
          totalWins: toNum(node.total_wins),
          factionReinforcementEnabled: !!node.faction_reinforcement_enabled,
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress, refreshKey]);

  return kingdom;
}
