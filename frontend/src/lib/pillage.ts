import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";
import { toriiSql, toNum } from "./toriiSql";

const POLL_INTERVAL = 4000;

export const WORLD_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "";

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
      const rows = await toriiSql<{
        home_parcel_id: number;
        pillager: string;
        target: string;
        start_time: number;
        expires_at: number;
        last_claim_time: number;
        active: number | boolean;
      }>('SELECT home_parcel_id, pillager, target, start_time, expires_at, last_claim_time, active FROM "siege_dojo-Pillage"');

      const now = Math.floor(Date.now() / 1000);
      const entries = rows
        .map((r) => ({
          homeParcelId: toNum(r.home_parcel_id),
          pillager: r.pillager,
          target: r.target,
          startTime: toNum(r.start_time),
          expiresAt: toNum(r.expires_at),
          lastClaimTime: toNum(r.last_claim_time),
          active: !!r.active,
        }))
        .filter((p) => p.active && p.expiresAt > now);

      const addr = playerAddress.toLowerCase();
      setData({
        asPillager: entries.filter((p) => p.pillager.toLowerCase() === addr),
        asTarget: entries.filter((p) => p.target.toLowerCase() === addr),
      });
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

export function usePillageEligibilities(playerAddress: string | null): PillageEligibilityData[] {
  const [data, setData] = useState<PillageEligibilityData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const rows = await toriiSql<{
        winner: string;
        match_id: number;
        loser: string;
        granted_at: number;
        expires_at: number;
        used: number | boolean;
      }>(`SELECT winner, match_id, loser, granted_at, expires_at, used FROM "siege_dojo-PillageEligibility" WHERE winner = '${playerAddress}'`);

      const now = Math.floor(Date.now() / 1000);
      const entries = rows
        .map((r) => ({
          winner: r.winner,
          matchId: toNum(r.match_id),
          loser: r.loser,
          grantedAt: toNum(r.granted_at),
          expiresAt: toNum(r.expires_at),
          used: !!r.used,
        }))
        .filter((eli) => !eli.used && eli.expiresAt > now);

      setData(entries);
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

export async function claimPillageDrip(account: AccountInterface, homeParcelId: number): Promise<string> {
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
