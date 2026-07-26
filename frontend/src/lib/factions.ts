import { useMemo } from "react";
import type { AccountInterface } from "starknet";
import { useModels } from "@dojoengine/sdk/react";
import {
  ModelsMapping,
  type Faction as FactionModel,
  type FactionInvite as FactionInviteModel,
  type FactionMember as FactionMemberModel,
} from "@/bindings/typescript/models.gen";
import { WORLD_SYSTEM_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { feltToStr } from "./toriiSql";
import { safeBigIntEq, safeNum, flatModels, toBigIntOrNull } from "./modelUtils";
import { useNowSeconds } from "./useNow";

// Every hook in this file is a pure selector over the Dojo store that
// `useWorldSubscription` populates — see worldSubscription.ts. They return
// empty data on a page that has not opened that subscription.

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

const LEAVE_COOLDOWN_SECONDS = 86400;

function toFactionData(f: FactionModel): FactionData {
  return {
    factionId: safeNum(f.faction_id),
    leader: f.leader,
    name: feltToStr(String(f.name ?? "")),
    tag: feltToStr(String(f.tag ?? "")),
    memberCount: safeNum(f.member_count),
    createdAt: safeNum(f.created_at),
    dissolved: !!f.dissolved,
  };
}

function toMemberData(m: FactionMemberModel): FactionMemberData {
  return {
    player: m.player,
    factionId: safeNum(m.faction_id),
    joinedAt: safeNum(m.joined_at),
    lastLeaveTime: safeNum(m.last_leave_time),
  };
}

export function useFaction(factionId: number | null): FactionData | null {
  const factions = useModels(ModelsMapping.Faction);

  return useMemo(() => {
    if (!factionId) return null;
    const f = flatModels<FactionModel>(factions).find((x) => safeNum(x.faction_id) === factionId);
    return f ? toFactionData(f) : null;
  }, [factions, factionId]);
}

export function usePlayerFaction(playerAddress: string | null): {
  member: FactionMemberData | null;
  faction: FactionData | null;
  cooldownRemaining: number;
} {
  const members = useModels(ModelsMapping.FactionMember);
  const factions = useModels(ModelsMapping.Faction);
  // The cooldown is derived from a wall-clock delta, so it needs its own tick
  // to keep counting down between store updates. Displayed at minute
  // granularity by formatCooldown, hence 30s rather than 1s.
  const now = useNowSeconds(30_000);

  return useMemo(() => {
    const addr = toBigIntOrNull(playerAddress);
    if (addr === null) return { member: null, faction: null, cooldownRemaining: 0 };

    const raw = flatModels<FactionMemberModel>(members).find((m) => safeBigIntEq(m.player, addr));
    const member = raw ? toMemberData(raw) : null;

    let faction: FactionData | null = null;
    if (member && member.factionId > 0) {
      const f = flatModels<FactionModel>(factions).find(
        (x) => safeNum(x.faction_id) === member.factionId,
      );
      if (f && !f.dissolved) faction = toFactionData(f);
    }

    const cooldownRemaining =
      member && member.lastLeaveTime > 0
        ? Math.max(0, member.lastLeaveTime + LEAVE_COOLDOWN_SECONDS - now)
        : 0;

    return { member, faction, cooldownRemaining };
  }, [members, factions, playerAddress, now]);
}

export function usePendingInvites(playerAddress: string | null): FactionInviteData[] {
  const invites = useModels(ModelsMapping.FactionInvite);

  return useMemo(() => {
    const addr = toBigIntOrNull(playerAddress);
    if (addr === null) return [];
    return flatModels<FactionInviteModel>(invites)
      .filter((i) => safeBigIntEq(i.target, addr) && !i.used)
      .map((i) => ({
        target: i.target,
        factionId: safeNum(i.faction_id),
        invitedBy: i.invited_by,
        invitedAt: safeNum(i.invited_at),
        used: !!i.used,
      }));
  }, [invites, playerAddress]);
}

export function useAllFactions(): FactionData[] {
  const factions = useModels(ModelsMapping.Faction);

  return useMemo(
    () =>
      flatModels<FactionModel>(factions)
        .map(toFactionData)
        .filter((f) => !f.dissolved && f.factionId > 0)
        .sort((a, b) => b.memberCount - a.memberCount),
    [factions],
  );
}

export function useFactionMembers(factionId: number | null): FactionMemberData[] {
  const members = useModels(ModelsMapping.FactionMember);

  return useMemo(() => {
    if (!factionId || factionId <= 0) return [];
    return flatModels<FactionMemberModel>(members)
      .map(toMemberData)
      .filter((m) => m.factionId === factionId)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [members, factionId]);
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
