import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

export const CONQUEST_ADDRESS = process.env.NEXT_PUBLIC_CONQUEST_ADDRESS || "";

export interface PresetSlot {
  p0: number;
  p1: number;
  p2: number;
  g0: number;
  g1: number;
  g2: number;
}

export interface PresetDefenseData {
  slots: PresetSlot[];
  presetCount: number;
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
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

export function usePresetDefense(playerAddress: string | null): PresetDefenseData | null {
  const [data, setData] = useState<PresetDefenseData | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPresetDefenseModels: GraphEdges<{
          p0_p0: string;
          p0_p1: string;
          p0_p2: string;
          p0_g0: string;
          p0_g1: string;
          p0_g2: string;
          p1_p0: string;
          p1_p1: string;
          p1_p2: string;
          p1_g0: string;
          p1_g1: string;
          p1_g2: string;
          p2_p0: string;
          p2_p1: string;
          p2_p2: string;
          p2_g0: string;
          p2_g1: string;
          p2_g2: string;
          p3_p0: string;
          p3_p1: string;
          p3_p2: string;
          p3_g0: string;
          p3_g1: string;
          p3_g2: string;
          preset_count: string;
        }>;
      }>(`
        query {
          siegeDojoPresetDefenseModels(where: { player: "${playerAddress}" }) {
            edges { node {
              p0_p0 p0_p1 p0_p2 p0_g0 p0_g1 p0_g2
              p1_p0 p1_p1 p1_p2 p1_g0 p1_g1 p1_g2
              p2_p0 p2_p1 p2_p2 p2_g0 p2_g1 p2_g2
              p3_p0 p3_p1 p3_p2 p3_g0 p3_g1 p3_g2
              preset_count
            } }
          }
        }
      `);

      const node = result?.siegeDojoPresetDefenseModels?.edges?.[0]?.node;
      if (!node) {
        setData({ slots: [], presetCount: 0 });
        return;
      }

      const slots: PresetSlot[] = [
        {
          p0: toNum(node.p0_p0),
          p1: toNum(node.p0_p1),
          p2: toNum(node.p0_p2),
          g0: toNum(node.p0_g0),
          g1: toNum(node.p0_g1),
          g2: toNum(node.p0_g2),
        },
        {
          p0: toNum(node.p1_p0),
          p1: toNum(node.p1_p1),
          p2: toNum(node.p1_p2),
          g0: toNum(node.p1_g0),
          g1: toNum(node.p1_g1),
          g2: toNum(node.p1_g2),
        },
        {
          p0: toNum(node.p2_p0),
          p1: toNum(node.p2_p1),
          p2: toNum(node.p2_p2),
          g0: toNum(node.p2_g0),
          g1: toNum(node.p2_g1),
          g2: toNum(node.p2_g2),
        },
        {
          p0: toNum(node.p3_p0),
          p1: toNum(node.p3_p1),
          p2: toNum(node.p3_p2),
          g0: toNum(node.p3_g0),
          g1: toNum(node.p3_g1),
          g2: toNum(node.p3_g2),
        },
      ];

      setData({ slots, presetCount: toNum(node.preset_count) });
    };

    const t = setTimeout(() => {
      void doFetch();
    }, 0);
    const i = setInterval(() => {
      void doFetch();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [playerAddress]);

  return data;
}

export async function setPresetDefense(
  account: AccountInterface,
  index: number,
  p0: number,
  p1: number,
  p2: number,
  g0: number,
  g1: number,
  g2: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "set_preset_defense",
    calldata: [
      index.toString(),
      p0.toString(),
      p1.toString(),
      p2.toString(),
      g0.toString(),
      g1.toString(),
      g2.toString(),
    ],
  });
  return result.transaction_hash;
}

export async function initiateConquest(
  account: AccountInterface,
  targetParcelId: number,
  p0: number,
  p1: number,
  p2: number,
  g0: number,
  g1: number,
  g2: number,
  abilityId: number,
  abilityTarget: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "initiate_conquest",
    calldata: [
      targetParcelId.toString(),
      p0.toString(),
      p1.toString(),
      p2.toString(),
      g0.toString(),
      g1.toString(),
      g2.toString(),
      abilityId.toString(),
      abilityTarget.toString(),
    ],
  });
  return result.transaction_hash;
}

export const DEFENDER_BUDGET = 12;
export const ATTACKER_BUDGET = 10;
