import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

export const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "";

export interface PillageData {
  homeParcelId: number;
  pillager: string;
  target: string;
  startTime: number;
  expiresAt: number;
  lastClaimTime: number;
  active: boolean;
}

export interface PillageEligibilityData {
  winner: string;
  matchId: number;
  loser: string;
  grantedAt: number;
  expiresAt: number;
  used: boolean;
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

export function useActivePillages(playerAddress: string | null): {
  asPillager: PillageData[];
  asTarget: PillageData[];
} {
  const [data, setData] = useState<{ asPillager: PillageData[]; asTarget: PillageData[] }>({
    asPillager: [],
    asTarget: [],
  });

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPillageModels: GraphEdges<{
          home_parcel_id: string;
          pillager: string;
          target: string;
          start_time: string;
          expires_at: string;
          last_claim_time: string;
          active: boolean;
        }>;
      }>(`
        query {
          siegeDojoPillageModels {
            edges { node {
              home_parcel_id pillager target start_time expires_at last_claim_time active
            } }
          }
        }
      `);

      const now = Math.floor(Date.now() / 1000);
      const entries = (result?.siegeDojoPillageModels?.edges || [])
        .map((e) => ({
          homeParcelId: toNum(e.node.home_parcel_id),
          pillager: e.node.pillager,
          target: e.node.target,
          startTime: toNum(e.node.start_time),
          expiresAt: toNum(e.node.expires_at),
          lastClaimTime: toNum(e.node.last_claim_time),
          active: e.node.active,
        }))
        .filter((p) => p.active && p.expiresAt > now);

      const addr = playerAddress.toLowerCase();
      setData({
        asPillager: entries.filter((p) => p.pillager.toLowerCase() === addr),
        asTarget: entries.filter((p) => p.target.toLowerCase() === addr),
      });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function usePillageEligibilities(playerAddress: string | null): PillageEligibilityData[] {
  const [data, setData] = useState<PillageEligibilityData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPillageEligibilityModels: GraphEdges<{
          winner: string;
          match_id: string;
          loser: string;
          granted_at: string;
          expires_at: string;
          used: boolean;
        }>;
      }>(`
        query {
          siegeDojoPillageEligibilityModels(where: { winner: "${playerAddress}" }) {
            edges { node { winner match_id loser granted_at expires_at used } }
          }
        }
      `);

      const now = Math.floor(Date.now() / 1000);
      const entries = (result?.siegeDojoPillageEligibilityModels?.edges || [])
        .map((e) => ({
          winner: e.node.winner,
          matchId: toNum(e.node.match_id),
          loser: e.node.loser,
          grantedAt: toNum(e.node.granted_at),
          expiresAt: toNum(e.node.expires_at),
          used: e.node.used,
        }))
        .filter((eli) => !eli.used && eli.expiresAt > now);

      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export async function initiatePillage(
  account: AccountInterface,
  matchId: number,
  homeParcelId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "initiate_pillage",
    calldata: [matchId.toString(), homeParcelId.toString()],
  });
  return result.transaction_hash;
}

export async function claimPillageDrip(
  account: AccountInterface,
  homeParcelId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "claim_pillage_drip",
    calldata: [homeParcelId.toString()],
  });
  return result.transaction_hash;
}

export function formatTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const secs = expiresAt - now;
  if (secs <= 0) return "Expired";
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
