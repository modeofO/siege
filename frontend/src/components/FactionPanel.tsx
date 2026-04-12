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
void setFactionReinforcement;
void addrEq;

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

  if (inFaction) {
    return <InFactionView />;
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

