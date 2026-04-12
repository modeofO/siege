"use client";

import { useState } from "react";
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
  type FactionData,
  type FactionMemberData,
} from "@/lib/factions";
import type { PlayerKingdomData } from "@/lib/worldState";
import { CreateFactionModal } from "@/components/CreateFactionModal";

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
void leaveFaction;
void kickMember;

export function FactionPanel({ account, address, kingdom, worldSystemAddress, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Silence unused prop/hook warnings for scaffolded states still being built.
  void worldSystemAddress;

  const inFaction = member && member.factionId !== 0 && faction;

  const openCreate = () => setCreateModalOpen(true);
  const closeCreate = () => setCreateModalOpen(false);
  const onCreated = () => {
    setCreateModalOpen(false);
    refresh();
  };

  if (inFaction && faction && member) {
    return (
      <InFactionView
        account={account}
        address={address}
        faction={faction}
        member={member}
        kingdom={kingdom}
        refresh={refresh}
      />
    );
  }

  if (invites.length > 0) {
    return (
      <>
        <InvitesView
          invites={invites}
          account={account}
          cooldownRemaining={cooldownRemaining}
          canCreate={kingdom.tier >= 1}
          onCreate={openCreate}
          onAccepted={refresh}
        />
        {createModalOpen && (
          <CreateFactionModal
            account={account}
            onClose={closeCreate}
            onCreated={onCreated}
          />
        )}
      </>
    );
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return (
    <>
      <UnalignedView onCreate={openCreate} />
      {createModalOpen && (
        <CreateFactionModal
          account={account}
          onClose={closeCreate}
          onCreated={onCreated}
        />
      )}
    </>
  );
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

interface UnalignedViewProps {
  onCreate: () => void;
}

function UnalignedView({ onCreate }: UnalignedViewProps) {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Unaligned
      </div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Form a faction to lead allies, or wait for an invitation. Faction leaders share borders with members and reinforce each other in conquest fights.
      </div>
      <button
        onClick={onCreate}
        className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20"
      >
        ⚔ FOUND A FACTION ⚔
      </button>
    </div>
  );
}

interface InvitesViewProps {
  invites: ReturnType<typeof usePendingInvites>;
  account: AccountInterface;
  cooldownRemaining: number;
  canCreate: boolean;
  onCreate: () => void;
  onAccepted: () => void;
}

function InvitesView({ invites, account, cooldownRemaining, canCreate, onCreate, onAccepted }: InvitesViewProps) {
  const [accepting, setAccepting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleAccept = async (factionId: number) => {
    setAccepting(factionId);
    setError("");
    try {
      await acceptInvite(account, factionId);
      onAccepted();
    } catch (e) {
      console.error("Accept invite failed:", e);
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAccepting(null);
    }
  };

  const cooldownLocked = cooldownRemaining > 0;

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Pending Invites
      </div>

      {cooldownLocked && (
        <div className="text-[10px] text-[#daa520]/70 bg-[#daa520]/5 border border-[#daa520]/20 rounded px-2 py-1">
          Leave cooldown active — {formatCooldown(cooldownRemaining)} remaining before you can accept an invite.
        </div>
      )}

      <div className="space-y-2">
        {invites.map((inv) => (
          <div
            key={`${inv.factionId}-${inv.invitedBy}`}
            className="flex items-center justify-between border border-[#3d3428] rounded p-2 bg-[#0d0b0a]/40"
          >
            <div className="text-[11px] text-[#d4cfc6]">
              <div className="font-serif">Faction #{inv.factionId}</div>
              <div className="text-[9px] text-[#7a7060]">
                from {truncAddr(inv.invitedBy)}
              </div>
            </div>
            <button
              onClick={() => handleAccept(inv.factionId)}
              disabled={cooldownLocked || accepting !== null}
              className="px-3 py-1 rounded text-[10px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {accepting === inv.factionId ? "..." : "ACCEPT"}
            </button>
          </div>
        ))}
      </div>

      {canCreate && (
        <button
          onClick={onCreate}
          className="w-full py-2 rounded font-bold tracking-wider text-[11px] font-serif transition-all bg-[#252019] border border-[#3d3428] text-[#7a7060] hover:text-[#daa520] hover:border-[#daa520]/50"
        >
          Or found your own faction
        </button>
      )}

      {error && (
        <div className="text-[#ff3344] text-xs text-center">{error}</div>
      )}
    </div>
  );
}

interface InFactionViewProps {
  account: AccountInterface;
  address: string;
  faction: FactionData;
  member: FactionMemberData;
  kingdom: PlayerKingdomData;
  refresh: () => void;
}

function InFactionView({ account, address, faction, member, kingdom, refresh }: InFactionViewProps) {
  const isLeader = addrEq(address, faction.leader);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");

  // Member is not consumed by header/toggle yet but will be in later tasks.
  void member;

  const handleToggleReinforcement = async () => {
    setToggling(true);
    setToggleError("");
    try {
      await setFactionReinforcement(account, !kingdom.factionReinforcementEnabled);
      refresh();
    } catch (e) {
      console.error("Toggle reinforcement failed:", e);
      setToggleError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  };

  const reinforcementOn = kingdom.factionReinforcementEnabled;

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">
              {faction.name || `Faction #${faction.factionId}`}
            </h3>
            {faction.tag && (
              <div className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border border-[#daa520]/50 text-[#daa520] bg-[#daa520]/5">
                {faction.tag}
              </div>
            )}
          </div>
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
            Led by {truncAddr(faction.leader)} {isLeader && "· you"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-serif text-[#d4cfc6]">
            {faction.memberCount}
          </div>
          <div className="text-[9px] text-[#7a7060] tracking-wider uppercase">
            {faction.memberCount === 1 ? "Member" : "Members"}
          </div>
        </div>
      </div>

      {/* Reinforcement toggle */}
      <div className="border-t border-[#3d3428] pt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">
              Faction Reinforcement
            </div>
            <div className="text-[11px] text-[#7a7060] leading-relaxed">
              Adjacent faction allies contribute a defense preset to conquest fights against your parcels.
            </div>
          </div>
          <button
            onClick={handleToggleReinforcement}
            disabled={toggling}
            aria-pressed={reinforcementOn}
            className={`shrink-0 px-4 py-2 rounded text-[10px] font-bold tracking-wider border transition-colors ${
              reinforcementOn
                ? "bg-[#daa520]/15 border-[#daa520] text-[#daa520]"
                : "bg-[#252019] border-[#3d3428] text-[#7a7060] hover:text-[#d4cfc6]"
            } ${toggling ? "opacity-60 cursor-wait" : ""}`}
          >
            {toggling ? "..." : reinforcementOn ? "ON" : "OFF"}
          </button>
        </div>
        {toggleError && (
          <div className="text-[#ff3344] text-[10px] text-right mt-1">{toggleError}</div>
        )}
      </div>
    </div>
  );
}

