import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";
import { toriiSql, toNum, feltToStr } from "./toriiSql";

const POLL_INTERVAL = 4000;

export const WORLD_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "";

export interface FactionData {
  factionId: number;
  leader: string;
  name: string;
  tag: string;
  memberCount: number;
  createdAt: number;
  dissolved: boolean;
}

export interface FactionMemberData {
  player: string;
  factionId: number;
  joinedAt: number;
  lastLeaveTime: number;
}

export interface FactionInviteData {
  target: string;
  factionId: number;
  invitedBy: string;
  invitedAt: number;
  used: boolean;
}

export function useFaction(factionId: number | null): FactionData | null {
  const [data, setData] = useState<FactionData | null>(null);

  useEffect(() => {
    if (!factionId) return;

    const doFetch = async () => {
      const rows = await toriiSql<{
        faction_id: number;
        leader: string;
        name: string;
        tag: string;
        member_count: number;
        created_at: number;
        dissolved: number | boolean;
      }>(`SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction" WHERE faction_id = ${factionId}`);

      const row = rows[0];
      if (!row) {
        setData(null);
        return;
      }

      setData({
        factionId: toNum(row.faction_id),
        leader: row.leader,
        name: feltToStr(row.name),
        tag: feltToStr(row.tag),
        memberCount: toNum(row.member_count),
        createdAt: toNum(row.created_at),
        dissolved: !!row.dissolved,
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
  }, [factionId]);

  return data;
}

export function usePlayerFaction(playerAddress: string | null): {
  member: FactionMemberData | null;
  faction: FactionData | null;
  cooldownRemaining: number;
} {
  const [state, setState] = useState<{
    member: FactionMemberData | null;
    faction: FactionData | null;
    cooldownRemaining: number;
  }>({ member: null, faction: null, cooldownRemaining: 0 });

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const memberRows = await toriiSql<{
        player: string;
        faction_id: number;
        joined_at: number;
        last_leave_time: number;
      }>(`SELECT player, faction_id, joined_at, last_leave_time FROM "siege_dojo-FactionMember" WHERE player = '${playerAddress}'`);

      const memberRow = memberRows[0];
      const member: FactionMemberData | null = memberRow
        ? {
            player: memberRow.player,
            factionId: toNum(memberRow.faction_id),
            joinedAt: toNum(memberRow.joined_at),
            lastLeaveTime: toNum(memberRow.last_leave_time),
          }
        : null;

      let faction: FactionData | null = null;
      if (member && member.factionId > 0) {
        const factionRows = await toriiSql<{
          faction_id: number;
          leader: string;
          name: string;
          tag: string;
          member_count: number;
          created_at: number;
          dissolved: number | boolean;
        }>(`SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction" WHERE faction_id = ${member.factionId}`);
        const fn = factionRows[0];
        if (fn && !fn.dissolved) {
          faction = {
            factionId: toNum(fn.faction_id),
            leader: fn.leader,
            name: feltToStr(fn.name),
            tag: feltToStr(fn.tag),
            memberCount: toNum(fn.member_count),
            createdAt: toNum(fn.created_at),
            dissolved: !!fn.dissolved,
          };
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const cooldownRemaining =
        member && member.lastLeaveTime > 0 ? Math.max(0, member.lastLeaveTime + 86400 - now) : 0;

      setState({ member, faction, cooldownRemaining });
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

  return state;
}

export function usePendingInvites(playerAddress: string | null): FactionInviteData[] {
  const [data, setData] = useState<FactionInviteData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const rows = await toriiSql<{
        target: string;
        faction_id: number;
        invited_by: string;
        invited_at: number;
        used: number | boolean;
      }>(`SELECT target, faction_id, invited_by, invited_at, used FROM "siege_dojo-FactionInvite" WHERE target = '${playerAddress}'`);

      const entries = rows
        .map((r) => ({
          target: r.target,
          factionId: toNum(r.faction_id),
          invitedBy: r.invited_by,
          invitedAt: toNum(r.invited_at),
          used: !!r.used,
        }))
        .filter((inv) => !inv.used);

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

export function useAllFactions(): FactionData[] {
  const [data, setData] = useState<FactionData[]>([]);

  useEffect(() => {
    const doFetch = async () => {
      const rows = await toriiSql<{
        faction_id: number;
        leader: string;
        name: string;
        tag: string;
        member_count: number;
        created_at: number;
        dissolved: number | boolean;
      }>('SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction"');

      const entries = rows
        .map((r) => ({
          factionId: toNum(r.faction_id),
          leader: r.leader,
          name: feltToStr(r.name),
          tag: feltToStr(r.tag),
          memberCount: toNum(r.member_count),
          createdAt: toNum(r.created_at),
          dissolved: !!r.dissolved,
        }))
        .filter((f) => !f.dissolved && f.factionId > 0);

      entries.sort((a, b) => b.memberCount - a.memberCount);
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
  }, []);

  return data;
}

export function useFactionMembers(factionId: number | null): FactionMemberData[] {
  const [data, setData] = useState<FactionMemberData[]>([]);

  useEffect(() => {
    if (!factionId || factionId <= 0) return;

    const doFetch = async () => {
      const rows = await toriiSql<{
        player: string;
        faction_id: number;
        joined_at: number;
        last_leave_time: number;
      }>(`SELECT player, faction_id, joined_at, last_leave_time FROM "siege_dojo-FactionMember" WHERE faction_id = ${factionId}`);

      const entries = rows.map((r) => ({
        player: r.player,
        factionId: toNum(r.faction_id),
        joinedAt: toNum(r.joined_at),
        lastLeaveTime: toNum(r.last_leave_time),
      }));

      entries.sort((a, b) => a.joinedAt - b.joinedAt);
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
  }, [factionId]);

  return data;
}

function strToFelt(s: string): string {
  let hex = "";
  for (let i = 0; i < s.length && i < 31; i++) {
    hex += s.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return "0x" + (hex || "0");
}

export async function createFaction(account: AccountInterface, name: string, tag: string): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "create_faction",
    calldata: [strToFelt(name), strToFelt(tag)],
  });
  return result.transaction_hash;
}

export async function inviteMember(account: AccountInterface, target: string): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "invite_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function acceptInvite(account: AccountInterface, factionId: number): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "accept_invite",
    calldata: [factionId.toString()],
  });
  return result.transaction_hash;
}

export async function leaveFaction(account: AccountInterface): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "leave_faction",
    calldata: [],
  });
  return result.transaction_hash;
}

export async function kickMember(account: AccountInterface, target: string): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "kick_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function setFactionReinforcement(account: AccountInterface, enabled: boolean): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "set_faction_reinforcement",
    calldata: [enabled ? "1" : "0"],
  });
  return result.transaction_hash;
}

export function formatCooldown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "None";
  const hours = Math.floor(secondsRemaining / 3600);
  const mins = Math.floor((secondsRemaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
