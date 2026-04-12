"use client";

import type { AccountInterface } from "starknet";
import {
  usePlayerFaction,
  usePendingInvites,
  useFactionMembers,
  inviteMember,
  acceptInvite,
  leaveFaction,
  kickMember,
  setFactionReinforcement,
  formatCooldown,
} from "@/lib/factions";
import type { PlayerKingdomData } from "@/lib/worldState";

interface FactionPanelProps {
  account: AccountInterface;
  address: string;
  kingdom: PlayerKingdomData;
  worldSystemAddress: string;
  refresh: () => void;
}

// BigInt-safe address equality — handles unpadded/padded Torii variants.
const addrEq = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  try { return BigInt(a) === BigInt(b); } catch { return false; }
};

// Short display form of an address.
const truncAddr = (a: string): string =>
  a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a || "");

// Silence unused-import warnings for functions wired up in later tasks.
// These are referenced here so ESLint doesn't flag the imports while we
// scaffold the panel. They get used inside the state sub-views.
void useFactionMembers;
void inviteMember;
void acceptInvite;
void leaveFaction;
void kickMember;
void setFactionReinforcement;
void formatCooldown;
void addrEq;
void truncAddr;

export function FactionPanel({ account, address, kingdom, worldSystemAddress, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);

  // Silence unused prop warnings on the scaffold — consumed in later tasks.
  void account;
  void worldSystemAddress;
  void refresh;
  void cooldownRemaining;

  const inFaction = member && member.factionId !== 0 && faction;

  if (inFaction) {
    return <InFactionView />;
  }

  if (invites.length > 0) {
    return <InvitesView />;
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return <UnalignedView />;
}

function PolisLockedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Factions
      </div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Reach <span className="text-[#daa520] font-bold">Strategos</span> tier to form or join a faction. Factions share borders, reinforce each other in conquest fights, and pool contributions toward campaign objectives.
      </div>
    </div>
  );
}

function UnalignedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Unaligned
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Unaligned + create — built in Task 5)
      </div>
    </div>
  );
}

function InvitesView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Pending Invites
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Invites list + accept — built in Task 7)
      </div>
    </div>
  );
}

function InFactionView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Your Faction
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (In-faction management — built in Tasks 8–12)
      </div>
    </div>
  );
}
