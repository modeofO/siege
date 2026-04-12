import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
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

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function feltToStr(felt: string): string {
  if (!felt || felt === "0x0" || felt === "0") return "";
  const hex = felt.startsWith("0x") ? felt.slice(2) : BigInt(felt).toString(16);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes.filter((b) => b > 0));
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

export function useFaction(factionId: number | null): FactionData | null {
  const [data, setData] = useState<FactionData | null>(null);

  useEffect(() => {
    if (!factionId) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionModels: GraphEdges<{
          faction_id: string;
          leader: string;
          name: string;
          tag: string;
          member_count: string;
          created_at: string;
          dissolved: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionModels(where: { faction_id: ${factionId} }) {
            edges { node { faction_id leader name tag member_count created_at dissolved } }
          }
        }
      `);

      const node = result?.siegeDojoFactionModels?.edges?.[0]?.node;
      if (!node) {
        setData(null);
        return;
      }

      setData({
        factionId: toNum(node.faction_id),
        leader: node.leader,
        name: feltToStr(node.name),
        tag: feltToStr(node.tag),
        memberCount: toNum(node.member_count),
        createdAt: toNum(node.created_at),
        dissolved: node.dissolved,
      });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
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
      const result = await toriiQuery<{
        siegeDojoFactionMemberModels: GraphEdges<{
          player: string;
          faction_id: string;
          joined_at: string;
          last_leave_time: string;
        }>;
      }>(`
        query {
          siegeDojoFactionMemberModels(where: { player: "${playerAddress}" }) {
            edges { node { player faction_id joined_at last_leave_time } }
          }
        }
      `);

      const memberNode = result?.siegeDojoFactionMemberModels?.edges?.[0]?.node;
      const member: FactionMemberData | null = memberNode
        ? {
            player: memberNode.player,
            factionId: toNum(memberNode.faction_id),
            joinedAt: toNum(memberNode.joined_at),
            lastLeaveTime: toNum(memberNode.last_leave_time),
          }
        : null;

      let faction: FactionData | null = null;
      if (member && member.factionId > 0) {
        const factionResult = await toriiQuery<{
          siegeDojoFactionModels: GraphEdges<{
            faction_id: string; leader: string; name: string; tag: string;
            member_count: string; created_at: string; dissolved: boolean;
          }>;
        }>(`
          query {
            siegeDojoFactionModels(where: { faction_id: ${member.factionId} }) {
              edges { node { faction_id leader name tag member_count created_at dissolved } }
            }
          }
        `);
        const fn = factionResult?.siegeDojoFactionModels?.edges?.[0]?.node;
        if (fn && !fn.dissolved) {
          faction = {
            factionId: toNum(fn.faction_id),
            leader: fn.leader,
            name: feltToStr(fn.name),
            tag: feltToStr(fn.tag),
            memberCount: toNum(fn.member_count),
            createdAt: toNum(fn.created_at),
            dissolved: fn.dissolved,
          };
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const cooldownRemaining = member && member.lastLeaveTime > 0
        ? Math.max(0, (member.lastLeaveTime + 86400) - now)
        : 0;

      setState({ member, faction, cooldownRemaining });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return state;
}

export function usePendingInvites(playerAddress: string | null): FactionInviteData[] {
  const [data, setData] = useState<FactionInviteData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionInviteModels: GraphEdges<{
          target: string;
          faction_id: string;
          invited_by: string;
          invited_at: string;
          used: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionInviteModels(where: { target: "${playerAddress}" }) {
            edges { node { target faction_id invited_by invited_at used } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionInviteModels?.edges || [])
        .map((e) => ({
          target: e.node.target,
          factionId: toNum(e.node.faction_id),
          invitedBy: e.node.invited_by,
          invitedAt: toNum(e.node.invited_at),
          used: e.node.used,
        }))
        .filter((inv) => !inv.used);

      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function useAllFactions(): FactionData[] {
  const [data, setData] = useState<FactionData[]>([]);

  useEffect(() => {
    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionModels: GraphEdges<{
          faction_id: string; leader: string; name: string; tag: string;
          member_count: string; created_at: string; dissolved: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionModels {
            edges { node { faction_id leader name tag member_count created_at dissolved } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionModels?.edges || [])
        .map((e) => ({
          factionId: toNum(e.node.faction_id),
          leader: e.node.leader,
          name: feltToStr(e.node.name),
          tag: feltToStr(e.node.tag),
          memberCount: toNum(e.node.member_count),
          createdAt: toNum(e.node.created_at),
          dissolved: e.node.dissolved,
        }))
        .filter((f) => !f.dissolved && f.factionId > 0);

      entries.sort((a, b) => b.memberCount - a.memberCount);
      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return data;
}

export function useFactionMembers(factionId: number | null): FactionMemberData[] {
  const [data, setData] = useState<FactionMemberData[]>([]);

  useEffect(() => {
    if (!factionId || factionId <= 0) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionMemberModels: GraphEdges<{
          player: string;
          faction_id: string;
          joined_at: string;
          last_leave_time: string;
        }>;
      }>(`
        query {
          siegeDojoFactionMemberModels(first: 1000) {
            edges { node { player faction_id joined_at last_leave_time } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionMemberModels?.edges || [])
        .map((e) => ({
          player: e.node.player,
          factionId: toNum(e.node.faction_id),
          joinedAt: toNum(e.node.joined_at),
          lastLeaveTime: toNum(e.node.last_leave_time),
        }))
        .filter((m) => m.factionId === factionId);

      entries.sort((a, b) => a.joinedAt - b.joinedAt);
      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
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

export async function createFaction(
  account: AccountInterface,
  name: string,
  tag: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "create_faction",
    calldata: [strToFelt(name), strToFelt(tag)],
  });
  return result.transaction_hash;
}

export async function inviteMember(
  account: AccountInterface,
  target: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "invite_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function acceptInvite(
  account: AccountInterface,
  factionId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "accept_invite",
    calldata: [factionId.toString()],
  });
  return result.transaction_hash;
}

export async function leaveFaction(
  account: AccountInterface,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "leave_faction",
    calldata: [],
  });
  return result.transaction_hash;
}

export async function kickMember(
  account: AccountInterface,
  target: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "kick_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function setFactionReinforcement(
  account: AccountInterface,
  enabled: boolean,
): Promise<string> {
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
