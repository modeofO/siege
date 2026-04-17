"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/factions";
import type { PlayerKingdomData } from "@/lib/worldState";
import { CreateFactionModal } from "@/components/CreateFactionModal";

interface FactionPanelProps {
  account: AccountInterface;
  address: string;
  kingdom: PlayerKingdomData;
  refresh: () => void;
}

// BigInt-safe address equality — handles unpadded/padded Torii variants.
const addrEq = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

// Short display form of an address.
const truncAddr = (a: string): string => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");

export function FactionPanel({ account, address, kingdom, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const inFaction = member && member.factionId !== 0 && faction;

  const openCreate = () => setCreateModalOpen(true);
  const closeCreate = () => setCreateModalOpen(false);
  const onCreated = () => {
    setCreateModalOpen(false);
    refresh();
  };

  if (inFaction && faction && member) {
    return <InFactionView account={account} address={address} faction={faction} kingdom={kingdom} refresh={refresh} />;
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
        {createModalOpen && <CreateFactionModal account={account} onClose={closeCreate} onCreated={onCreated} />}
      </>
    );
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return (
    <>
      <UnalignedView onCreate={openCreate} />
      {createModalOpen && <CreateFactionModal account={account} onClose={closeCreate} onCreated={onCreated} />}
    </>
  );
}

function PolisLockedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Factions</div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Reach <span className="text-[#daa520] font-bold">Strategos</span> tier to form or join a faction. Factions share
        borders, reinforce each other in conquest fights, and pool contributions toward campaign objectives.
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
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Unaligned</div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Form a faction to lead allies, or wait for an invitation. Faction leaders share borders with members and
        reinforce each other in conquest fights.
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
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Pending Invites</div>

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
              <div className="text-[9px] text-[#7a7060]">from {truncAddr(inv.invitedBy)}</div>
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

      {error && <div className="text-[#ff3344] text-xs text-center">{error}</div>}
    </div>
  );
}

interface InFactionViewProps {
  account: AccountInterface;
  address: string;
  faction: FactionData;
  kingdom: PlayerKingdomData;
  refresh: () => void;
}

function InFactionView({ account, address, faction, kingdom, refresh }: InFactionViewProps) {
  const isLeader = addrEq(address, faction.leader);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const members = useFactionMembers(faction.factionId);

  // target address currently in "confirm kick" state, or null
  const [kickPending, setKickPending] = useState<string | null>(null);
  const [kickSubmitting, setKickSubmitting] = useState<string | null>(null);
  const [kickError, setKickError] = useState<{ target: string; message: string } | null>(null);

  // Auto-revert kick confirmation after 5 seconds — unless a submission is in flight.
  useEffect(() => {
    if (!kickPending) return;
    if (kickSubmitting === kickPending) return;
    const t = setTimeout(() => setKickPending(null), 5000);
    return () => clearTimeout(t);
  }, [kickPending, kickSubmitting]);

  const handleKickRequest = (target: string) => {
    setKickError(null);
    setKickPending(target);
  };

  const handleKickCancel = () => {
    setKickPending(null);
  };

  const handleKickConfirm = async (target: string) => {
    if (kickSubmitting) return;
    setKickSubmitting(target);
    setKickError(null);
    try {
      await kickMember(account, target);
      setKickPending(null);
      refresh();
    } catch (e) {
      console.error("Kick member failed:", e);
      setKickError({
        target,
        message: e instanceof Error ? e.message : "Kick failed",
      });
    } finally {
      setKickSubmitting(null);
    }
  };

  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const validateInvite = (value: string): string | null => {
    const v = value.trim();
    if (!v) return "Address required.";
    if (v.length < 3) return "Address too short.";
    if (!/^0x[0-9a-fA-F]+$/.test(v)) return "Invalid address format.";
    return null;
  };

  const handleInviteSubmit = async () => {
    const validation = validateInvite(inviteTarget);
    if (validation) {
      setInviteError(validation);
      return;
    }
    setInviteSubmitting(true);
    setInviteError("");
    setInviteSuccess(false);
    try {
      await inviteMember(account, inviteTarget.trim());
      setInviteTarget("");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (e) {
      console.error("Invite member failed:", e);
      setInviteError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const [leavePending, setLeavePending] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  const handleLeaveRequest = () => {
    setLeaveError("");
    setLeavePending(true);
  };

  const handleLeaveCancel = () => {
    setLeavePending(false);
  };

  const handleLeaveConfirm = async () => {
    if (leaveSubmitting) return;
    setLeaveSubmitting(true);
    setLeaveError("");
    try {
      await leaveFaction(account);
      setLeavePending(false);
      refresh();
    } catch (e) {
      console.error("Leave faction failed:", e);
      setLeaveError(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setLeaveSubmitting(false);
    }
  };

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
          <div className="text-xl font-bold font-serif text-[#d4cfc6]">{faction.memberCount}</div>
          <div className="text-[9px] text-[#7a7060] tracking-wider uppercase">
            {faction.memberCount === 1 ? "Member" : "Members"}
          </div>
        </div>
      </div>

      {/* Reinforcement toggle */}
      <div className="border-t border-[#3d3428] pt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">Faction Reinforcement</div>
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
        {toggleError && <div className="text-[#ff3344] text-[10px] text-right mt-1">{toggleError}</div>}
      </div>

      {/* Member list */}
      <div className="border-t border-[#3d3428] pt-3 space-y-2">
        <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">Members</div>
        {members.length === 0 ? (
          <div className="text-[10px] text-[#7a7060] italic">Loading members…</div>
        ) : (
          <div className="space-y-1">
            {members.map((m) => {
              const isMemberLeader = addrEq(m.player, faction.leader);
              const isSelf = addrEq(m.player, address);
              return (
                <div key={m.player} className="px-2 py-1.5 rounded border border-[#3d3428] bg-[#0d0b0a]/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isMemberLeader && (
                        <span className="text-[#daa520] text-[11px]" title="Faction leader">
                          ★
                        </span>
                      )}
                      <span className="text-[11px] text-[#d4cfc6] font-mono">{truncAddr(m.player)}</span>
                      {isSelf && <span className="text-[9px] text-[#7a7060] tracking-wider uppercase">you</span>}
                    </div>
                    {isLeader && !isSelf && (
                      <div className="flex items-center gap-1">
                        {kickPending === m.player ? (
                          <>
                            <button
                              onClick={() => handleKickConfirm(m.player)}
                              disabled={kickSubmitting === m.player}
                              className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border border-[#ff3344] text-[#ff3344] hover:bg-[#ff3344]/10 disabled:opacity-30"
                            >
                              {kickSubmitting === m.player ? "..." : "CONFIRM"}
                            </button>
                            <button
                              onClick={handleKickCancel}
                              disabled={kickSubmitting === m.player}
                              className="px-2 py-0.5 rounded text-[9px] text-[#7a7060] hover:text-[#d4cfc6] disabled:opacity-30"
                              aria-label="Cancel kick"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleKickRequest(m.player)}
                            className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border border-[#3d3428] text-[#7a7060] hover:border-[#ff3344] hover:text-[#ff3344]"
                          >
                            KICK
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {kickError && addrEq(kickError.target, m.player) && (
                    <div className="text-[#ff3344] text-[9px] mt-1">{kickError.message}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leader-only: invite form */}
      {isLeader && (
        <div className="border-t border-[#3d3428] pt-3 space-y-2">
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">Invite a Player</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteTarget}
              onChange={(e) => {
                setInviteTarget(e.target.value);
                setInviteError("");
              }}
              placeholder="0x0123..."
              disabled={inviteSubmitting}
              className="flex-1 px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#d4cfc6] text-[11px] font-mono placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <button
              onClick={handleInviteSubmit}
              disabled={inviteSubmitting}
              className="px-4 py-2 rounded text-[10px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {inviteSubmitting ? "..." : "INVITE"}
            </button>
          </div>
          {inviteError && <div className="text-[#ff3344] text-[10px]">{inviteError}</div>}
          {inviteSuccess && <div className="text-[#4a7c59] text-[10px]">Invite sent.</div>}
        </div>
      )}

      {/* Leave faction (all members) */}
      <div className="border-t border-[#3d3428] pt-3 space-y-2">
        {!leavePending ? (
          <button
            onClick={handleLeaveRequest}
            className="w-full py-2 rounded text-[11px] font-bold tracking-wider border border-[#ff3344]/40 text-[#ff3344]/80 hover:bg-[#ff3344]/5 hover:border-[#ff3344]"
          >
            LEAVE FACTION
          </button>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] text-[#ff3344]/80 text-center">
              {isLeader
                ? "Confirm leave · This will DISSOLVE the faction for all members"
                : "Confirm leave · 24h cooldown before rejoining any faction"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLeaveConfirm}
                disabled={leaveSubmitting}
                className="flex-1 py-2 rounded text-[10px] font-bold tracking-wider border border-[#ff3344] text-[#ff3344] hover:bg-[#ff3344]/10 disabled:opacity-30"
              >
                {leaveSubmitting ? "LEAVING..." : "CONFIRM LEAVE"}
              </button>
              <button
                onClick={handleLeaveCancel}
                disabled={leaveSubmitting}
                className="px-4 py-2 rounded text-[10px] text-[#7a7060] border border-[#3d3428] hover:text-[#d4cfc6] disabled:opacity-30"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
        {leaveError && <div className="text-[#ff3344] text-[10px] text-center">{leaveError}</div>}
      </div>
    </div>
  );
}
