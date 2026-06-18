import { useState } from "react";
import type { AccountInterface } from "starknet";
import { WORLD_SYSTEM_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { toriiSql, toNum, feltToStr, sqlAddr, sqlInt } from "./toriiSql";
import { usePoll } from "./usePoll";

const POLL_INTERVAL = 4000;

export { WORLD_SYSTEM_ADDRESS };

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

  usePoll(
    async (alive) => {
      if (!factionId) return;
      const rows = await toriiSql<{
        faction_id: number;
        leader: string;
        name: string;
        tag: string;
        member_count: number;
        created_at: number;
        dissolved: number | boolean;
      }>(`SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction" WHERE faction_id = ${sqlInt(factionId)}`);
      if (!alive()) return;

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
    },
    POLL_INTERVAL,
    [factionId],
    !!factionId,
  );

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

  usePoll(
    async (alive) => {
      if (!playerAddress) return;
      // Single round-trip: member row joined with its faction row.
      const rows = await toriiSql<{
        player: string;
        faction_id: number;
        joined_at: number;
        last_leave_time: number;
        f_faction_id: number | null;
        leader: string | null;
        name: string | null;
        tag: string | null;
        member_count: number | null;
        created_at: number | null;
        dissolved: number | boolean | null;
      }>(
        `SELECT m.player, m.faction_id, m.joined_at, m.last_leave_time, f.faction_id AS f_faction_id, f.leader, f.name, f.tag, f.member_count, f.created_at, f.dissolved FROM "siege_dojo-FactionMember" m LEFT JOIN "siege_dojo-Faction" f ON f.faction_id = m.faction_id WHERE m.player = ${sqlAddr(playerAddress)}`,
      );
      if (!alive()) return;

      const row = rows[0];
      const member: FactionMemberData | null = row
        ? {
            player: row.player,
            factionId: toNum(row.faction_id),
            joinedAt: toNum(row.joined_at),
            lastLeaveTime: toNum(row.last_leave_time),
          }
        : null;

      let faction: FactionData | null = null;
      if (member && member.factionId > 0 && row.f_faction_id !== null && !row.dissolved) {
        faction = {
          factionId: toNum(row.f_faction_id),
          leader: row.leader ?? "0x0",
          name: feltToStr(row.name ?? ""),
          tag: feltToStr(row.tag ?? ""),
          memberCount: toNum(row.member_count),
          createdAt: toNum(row.created_at),
          dissolved: !!row.dissolved,
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const cooldownRemaining =
        member && member.lastLeaveTime > 0 ? Math.max(0, member.lastLeaveTime + 86400 - now) : 0;

      setState({ member, faction, cooldownRemaining });
    },
    POLL_INTERVAL,
    [playerAddress],
    !!playerAddress,
  );

  return state;
}

export function usePendingInvites(playerAddress: string | null): FactionInviteData[] {
  const [data, setData] = useState<FactionInviteData[]>([]);

  usePoll(
    async (alive) => {
      if (!playerAddress) return;
      const rows = await toriiSql<{
        target: string;
        faction_id: number;
        invited_by: string;
        invited_at: number;
        used: number | boolean;
      }>(`SELECT target, faction_id, invited_by, invited_at, used FROM "siege_dojo-FactionInvite" WHERE target = ${sqlAddr(playerAddress)}`);
      if (!alive()) return;

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
    },
    POLL_INTERVAL,
    [playerAddress],
    !!playerAddress,
  );

  return data;
}

export function useAllFactions(): FactionData[] {
  const [data, setData] = useState<FactionData[]>([]);

  usePoll(
    async (alive) => {
      const rows = await toriiSql<{
        faction_id: number;
        leader: string;
        name: string;
        tag: string;
        member_count: number;
        created_at: number;
        dissolved: number | boolean;
      }>('SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction"');
      if (!alive()) return;

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
    },
    POLL_INTERVAL,
    [],
  );

  return data;
}

export function useFactionMembers(factionId: number | null): FactionMemberData[] {
  const [data, setData] = useState<FactionMemberData[]>([]);

  usePoll(
    async (alive) => {
      if (!factionId || factionId <= 0) return;
      const rows = await toriiSql<{
        player: string;
        faction_id: number;
        joined_at: number;
        last_leave_time: number;
      }>(`SELECT player, faction_id, joined_at, last_leave_time FROM "siege_dojo-FactionMember" WHERE faction_id = ${sqlInt(factionId)}`);
      if (!alive()) return;

      const entries = rows.map((r) => ({
        player: r.player,
        factionId: toNum(r.faction_id),
        joinedAt: toNum(r.joined_at),
        lastLeaveTime: toNum(r.last_leave_time),
      }));

      entries.sort((a, b) => a.joinedAt - b.joinedAt);
      setData(entries);
    },
    POLL_INTERVAL,
    [factionId],
    !!factionId && factionId > 0,
  );

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
  const result = await resilientExecute(account, {
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "create_faction",
    calldata: [strToFelt(name), strToFelt(tag)],
  });
  return result.transaction_hash;
}

export async function inviteMember(account: AccountInterface, target: string): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "invite_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function acceptInvite(account: AccountInterface, factionId: number): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "accept_invite",
    calldata: [factionId.toString()],
  });
  return result.transaction_hash;
}

export async function leaveFaction(account: AccountInterface): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "leave_faction",
    calldata: [],
  });
  return result.transaction_hash;
}

export async function kickMember(account: AccountInterface, target: string): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "kick_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function setFactionReinforcement(account: AccountInterface, enabled: boolean): Promise<string> {
  const result = await resilientExecute(account, {
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
