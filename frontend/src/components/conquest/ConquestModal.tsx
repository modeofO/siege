"use client";

import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";
import type { ParcelData } from "@/lib/worldState";
import {
  approveConquestAbilityOperator,
  initiateConquest,
  fetchConquestOutcome,
  useConquestCooldown,
  ATTACKER_BUDGET,
  type ConquestOutcome,
} from "@/lib/conquest";
import { extractErrorMsg } from "@/lib/contracts1v1";
import { ABILITIES } from "@/lib/craftingContracts";
import { ConquestAllocator } from "@/components/conquest/ConquestAllocator";
import { AbilityIcon } from "@/components/AbilityIcon";

interface ConquestModalProps {
  account: AccountInterface;
  attacker: string;
  target: ParcelData;
  myOwnedParcels: ParcelData[];
  abilities: Record<number, number>;
  onClose: () => void;
}

type Phase = "plan" | "submitting" | "resolving" | "result";

const PARCEL_TYPE_NAMES: Record<number, string> = { 0: "Forge", 1: "Quarry", 2: "Grove" };
const GATE_NAMES = ["East", "Underground", "West"] as const;
const RESOLVE_DEADLINE_MS = 30_000;

function parcelName(p: ParcelData): string {
  const type = PARCEL_TYPE_NAMES[p.parcelType] ?? "Parcel";
  return `${type} (${p.col}, ${p.row})`;
}

function truncAddr(a: string): string {
  if (!a || a.length < 10) return a || "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ConquestModal({ account, attacker, target, myOwnedParcels, abilities, onClose }: ConquestModalProps) {
  const cooldown = useConquestCooldown(attacker);

  const [phase, setPhase] = useState<Phase>("plan");
  const [values, setValues] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [abilityId, setAbilityId] = useState(0);
  const [abilityTarget, setAbilityTarget] = useState(0);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [prevAttackTime, setPrevAttackTime] = useState(0);
  const [ownedSnapshot, setOwnedSnapshot] = useState<ParcelData[]>([]);
  const [outcome, setOutcome] = useState<ConquestOutcome | null>(null);
  const [neutral, setNeutral] = useState(false);

  const ownedIds = Object.keys(abilities)
    .map(Number)
    .filter((id) => abilities[id] > 0)
    .sort((a, b) => a - b);

  const launch = async () => {
    setBusy(true);
    setSubmitError("");
    setPrevAttackTime(cooldown.lastAttackTime);
    setOwnedSnapshot(myOwnedParcels);
    setPhase("submitting");
    try {
      if (abilityId > 0) {
        await approveConquestAbilityOperator(account);
      }
      await initiateConquest(
        account,
        target.parcelId,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        abilityId,
        abilityTarget,
      );
      setPhase("resolving");
    } catch (e) {
      console.error("Conquest failed:", e);
      setSubmitError(extractErrorMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Poll Torii for the outcome once the tx receipt has landed. setState calls
  // live in the interval/async callback, never synchronously in the effect
  // body — required by react-hooks/set-state-in-effect.
  useEffect(() => {
    if (phase !== "resolving") return;
    const start = Date.now();
    let alive = true;
    let inFlight = false;

    const check = async () => {
      if (inFlight || !alive) return;
      inFlight = true;
      try {
        if (Date.now() - start > RESOLVE_DEADLINE_MS) {
          if (alive) {
            setNeutral(true);
            setPhase("result");
          }
          return;
        }
        const res = await fetchConquestOutcome(attacker, target.parcelId, prevAttackTime, ownedSnapshot);
        if (alive && res) {
          setOutcome(res);
          setPhase("result");
        }
      } finally {
        inFlight = false;
      }
    };

    void check();
    const i = setInterval(() => void check(), 3000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [phase, attacker, target.parcelId, prevAttackTime, ownedSnapshot]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && phase !== "submitting" && phase !== "resolving") onClose();
  };

  const onCooldown = cooldown.remainingSeconds > 0;
  const abilityUsed = abilityId > 0;

  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50 p-4" onClick={handleBackdrop}>
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full space-y-5 relative max-h-[90vh] overflow-y-auto">
        {phase !== "submitting" && phase !== "resolving" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 text-[#7a7060] hover:text-[#d4cfc6] text-lg leading-none"
          >
            ✕
          </button>
        )}

        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#c44332] tracking-[0.2em]">WAR COUNCIL</h2>
          <p className="text-xs text-[#7a7060] mt-1">
            Assault on <span className="text-[#d4cfc6]">{parcelName(target)}</span>
            <span className="text-[#7a7060]"> · held by {truncAddr(target.owner)}</span>
          </p>
        </div>

        {phase === "plan" && (
          <PlanPhase
            values={values}
            onChangeValues={setValues}
            ownedIds={ownedIds}
            abilities={abilities}
            abilityId={abilityId}
            abilityTarget={abilityTarget}
            onSelectAbility={(id) => {
              setAbilityId(id);
              setAbilityTarget(0);
            }}
            onSelectTarget={setAbilityTarget}
            onCooldown={onCooldown}
            cooldownLabel={formatCountdown(cooldown.remainingSeconds)}
            onLaunch={launch}
          />
        )}

        {phase === "submitting" && (
          <div className="space-y-4 py-4 text-center">
            {submitError ? (
              <>
                <div className="text-[#ff3344] text-sm font-bold tracking-wider font-serif">ASSAULT FAILED</div>
                <div className="text-[11px] text-[#c44332] break-words px-2">{submitError}</div>
                <div className="flex gap-2">
                  <button
                    onClick={launch}
                    disabled={busy}
                    className="flex-1 py-2 rounded text-[11px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30"
                  >
                    {busy ? "RETRYING..." : "RETRY"}
                  </button>
                  <button
                    onClick={() => {
                      setSubmitError("");
                      setPhase("plan");
                    }}
                    disabled={busy}
                    className="px-4 py-2 rounded text-[11px] text-[#7a7060] border border-[#3d3428] hover:text-[#d4cfc6] disabled:opacity-30"
                  >
                    BACK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[#daa520] text-sm font-bold tracking-wider font-serif animate-pulse">
                  {abilityUsed ? "COMMITTING FORCES & ABILITY..." : "COMMITTING FORCES..."}
                </div>
                <div className="text-[11px] text-[#7a7060]">
                  {abilityUsed
                    ? "Approving the ability, then marching. Confirm any wallet prompts."
                    : "Marching on the parcel. Confirm any wallet prompts."}
                </div>
              </>
            )}
          </div>
        )}

        {phase === "resolving" && (
          <div className="space-y-3 py-6 text-center">
            <div className="text-[#daa520] text-sm font-bold tracking-wider font-serif animate-pulse">
              THE BATTLE IS JOINED
            </div>
            <div className="text-[11px] text-[#7a7060]">Reading the outcome from the field…</div>
          </div>
        )}

        {phase === "result" && (
          <ResultPhase
            outcome={outcome}
            neutral={neutral}
            target={target}
            abilityUsed={abilityUsed}
            cooldownLabel={formatCountdown(cooldown.remainingSeconds)}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

interface PlanPhaseProps {
  values: number[];
  onChangeValues: (v: number[]) => void;
  ownedIds: number[];
  abilities: Record<number, number>;
  abilityId: number;
  abilityTarget: number;
  onSelectAbility: (id: number) => void;
  onSelectTarget: (t: number) => void;
  onCooldown: boolean;
  cooldownLabel: string;
  onLaunch: () => void;
}

function PlanPhase({
  values,
  onChangeValues,
  ownedIds,
  abilities,
  abilityId,
  abilityTarget,
  onSelectAbility,
  onSelectTarget,
  onCooldown,
  cooldownLabel,
  onLaunch,
}: PlanPhaseProps) {
  return (
    <div className="space-y-5">
      <ConquestAllocator values={values} budget={ATTACKER_BUDGET} onChange={onChangeValues} />

      {ownedIds.length > 0 && (
        <div className="space-y-2 border-t border-[#3d3428] pt-4">
          <div className="text-[11px] tracking-[0.2em] uppercase text-[#daa520] font-serif font-bold">Ability</div>
          <div className="grid grid-cols-2 gap-2">
            {ownedIds.map((id) => {
              const ability = ABILITIES.find((a) => a.id === id);
              if (!ability) return null;
              const isSelected = abilityId === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectAbility(isSelected ? 0 : id)}
                  className={`flex items-center gap-2 rounded-lg p-2 text-left transition-all border ${
                    isSelected
                      ? "border-[#daa520] bg-[#daa520]/10 shadow-[0_0_8px_rgba(218,165,32,0.3)]"
                      : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
                  }`}
                >
                  <AbilityIcon tokenId={id} count={abilities[id]} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#d4cfc6] font-serif truncate">{ability.name}</div>
                    <div className="text-[9px] text-[#7a7060] leading-tight">{ability.effect}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {abilityId > 0 && (
            <>
              <div className="flex items-center gap-2 pl-1">
                <span className="text-[10px] text-[#7a7060] tracking-wider">TARGET GATE:</span>
                {GATE_NAMES.map((name, gi) => (
                  <button
                    key={name}
                    onClick={() => onSelectTarget(gi)}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                      abilityTarget === gi
                        ? "border-[#ff8800] bg-[#ff8800]/20 text-[#ff8800]"
                        : "border-[#3d3428] text-[#7a7060] hover:border-[#ff8800] hover:text-[#ff8800]"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-[#daa520]/90 bg-[#daa520]/5 border border-[#daa520]/30 rounded px-2 py-1.5">
                This ability will be consumed — win or lose.
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={onLaunch}
        disabled={onCooldown}
        className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#c44332]/10 border-2 border-[#c44332] text-[#c44332] hover:bg-[#c44332]/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {onCooldown ? `NEXT ASSAULT IN ${cooldownLabel}` : "⚔ LAUNCH ASSAULT"}
      </button>
    </div>
  );
}

interface ResultPhaseProps {
  outcome: ConquestOutcome | null;
  neutral: boolean;
  target: ParcelData;
  abilityUsed: boolean;
  cooldownLabel: string;
  onClose: () => void;
}

function ResultPhase({ outcome, neutral, target, abilityUsed, cooldownLabel, onClose }: ResultPhaseProps) {
  const won = outcome?.won ?? false;

  return (
    <div className="space-y-4 py-2 text-center">
      {neutral || !outcome ? (
        <>
          <div className="text-[#d4cfc6] text-lg font-bold tracking-[0.2em] font-serif">BATTLE RESOLVED</div>
          <div className="text-[11px] text-[#7a7060]">
            The outcome hasn&apos;t reached our records yet — check the map in a moment.
          </div>
        </>
      ) : won ? (
        <>
          <div className="text-[#daa520] text-2xl font-bold tracking-[0.2em] font-serif">VICTORY</div>
          <div className="text-[12px] text-[#d4cfc6]">You seized {parcelName(target)}.</div>
        </>
      ) : (
        <>
          <div className="text-[#c44332] text-2xl font-bold tracking-[0.2em] font-serif">DEFEAT</div>
          <div className="text-[12px] text-[#d4cfc6]">Assault repelled.</div>
          {outcome.lostParcel ? (
            <div className="text-[11px] text-[#c44332]">
              The defender took your {parcelName(outcome.lostParcel)}.
            </div>
          ) : (
            <div className="text-[11px] text-[#7a7060]">You held the line — last stand, nothing lost.</div>
          )}
        </>
      )}

      {abilityUsed && (
        <div className="text-[10px] text-[#daa520]/80 border-t border-[#3d3428] pt-2">
          Your ability was consumed in the assault.
        </div>
      )}

      <div className="text-[10px] text-[#7a7060] tracking-wider">Next assault available in {cooldownLabel}.</div>

      <button
        onClick={onClose}
        className="w-full py-2.5 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20"
      >
        CLOSE
      </button>
    </div>
  );
}
