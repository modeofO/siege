"use client";

import React, { useState } from "react";
import type { OpponentIntel } from "@/lib/intel/queries";
import { MAX_HISTORY_MATCHES } from "@/lib/intel/queries";
import type { BluffReading } from "@/lib/intel/bluff";
import type { Phase } from "@/lib/intel/profile";

interface IntelDrawerProps {
  open: boolean;
  onClose: () => void;
  intel: OpponentIntel;
  bluff: BluffReading | null; // null pre-computation
  opponentLabel: string; // short address or name
  // Pre-draft:
  projectedBudget: number;
  preDraft: number[] | null;
  onSavePreDraft: (allocations: number[]) => void;
  // Receives the drawer's LIVE draft so unsaved slider edits load too. null when
  // not in commit phase (button disabled).
  onLoadIntoOrders: ((allocations: number[]) => void) | null;
}

// Display order matches AllocationForm1v1's GATE_ORDER: East / Under. / West
// map to data indices 0 / 2 / 1.
const GATE_ORDER = [
  { di: 0, name: "East" },
  { di: 2, name: "Under." },
  { di: 1, name: "West" },
] as const;

const PHASES: { key: Phase; label: string }[] = [
  { key: "early", label: "EARLY" },
  { key: "mid", label: "MID" },
  { key: "endgame", label: "END" },
];

// abilityType (1-5) -> display name; T1/T2 of a type share the name.
const ABILITY_TYPE_NAMES: Record<number, string> = {
  1: "Siege Sword",
  2: "Stone Cloak",
  3: "Ember Blast",
  4: "Hex",
  5: "Fortify",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif font-bold mb-1.5">
      {children}
    </div>
  );
}

/** One heatmap cell: attack share bar over defense share bar, pure CSS. */
function ShareCell({ atk, def }: { atk: number; def: number }) {
  const bar = (share: number, color: string) => (
    <div className="h-2 bg-[#252019] rounded-sm overflow-hidden">
      <div
        className="h-full rounded-sm"
        style={{
          width: `${Math.round(share * 100)}%`,
          backgroundColor: color,
          // Opacity scales with share so hot gates read at a glance.
          opacity: 0.25 + 0.75 * Math.min(1, share),
        }}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-0.5 py-1">
      {bar(atk, "#ff8800")}
      {bar(def, "#6b8cae")}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#7a7060]">{label}</span>
      <span className="text-[#d4cfc6] font-bold">{value}</span>
    </div>
  );
}

/** Slider + number pair, borrowed from AllocationForm1v1's row idiom. */
function DraftRow({
  label,
  value,
  max,
  color,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#d4cfc6] w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="flex-1 h-2 cursor-pointer"
        style={{ accentColor: color, color }}
      />
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-8 text-center bg-[#252019] border border-[#3d3428] rounded text-xs py-0.5"
        style={{ color }}
      />
    </div>
  );
}

const zeroDraft = (): number[] => new Array<number>(10).fill(0);

/** Normalize a saved sketch to exactly 10 numeric slots. */
const seedDraft = (p: number[] | null): number[] => {
  const d = zeroDraft();
  if (p) for (let i = 0; i < 10; i++) d[i] = p[i] || 0;
  return d;
};

export function IntelDrawer({
  open,
  onClose,
  intel,
  bluff,
  opponentLabel,
  projectedBudget,
  preDraft,
  onSavePreDraft,
  onLoadIntoOrders,
}: IntelDrawerProps) {
  // Pre-draft scratch state, seeded from the saved sketch. When the parent
  // hands us a different saved sketch (round advanced, storage loaded), adopt
  // it via the render-time state-adjustment pattern — no effects.
  const [draft, setDraft] = useState<number[]>(() => seedDraft(preDraft));
  const [seededFrom, setSeededFrom] = useState<number[] | null>(preDraft);
  if (preDraft !== seededFrom) {
    setSeededFrom(preDraft);
    setDraft(seedDraft(preDraft));
  }

  // Slots: [p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2]. Repair costs 2/HP, so
  // total spend is the plain sum plus repair once more.
  const spendOf = (a: number[]) => a.reduce((s, v) => s + v, 0) + (a[6] || 0);
  const remaining = projectedBudget - spendOf(draft);

  const setSlot = (i: number, v: number) => {
    const next = [...draft];
    next[i] = Math.max(0, v);
    if (spendOf(next) <= projectedBudget) setDraft(next);
  };

  const profile = intel.profile;
  const hasHistory = (profile?.matchesAnalyzed ?? 0) > 0;

  // Overall contest average, weighted by phase sample size.
  const avgContest =
    profile && profile.roundsAnalyzed > 0
      ? PHASES.reduce(
          (s, p) => s + profile.phases[p.key].avgContest * profile.phases[p.key].rounds,
          0,
        ) / profile.roundsAnalyzed
      : 0;

  const showBluff = bluff !== null && bluff.sample >= 2;
  const bluffPct = showBluff ? Math.round(bluff.score * 100) : 0;
  const bluffColor = !showBluff
    ? "#66cc66"
    : bluff.score < 1 / 3
      ? "#66cc66"
      : bluff.score < 2 / 3
        ? "#daa520"
        : "#ff3344";

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      // top-14 (not inset-y-0): the sticky app Navbar is h-14 z-50 and would
      // otherwise bury the drawer header. z-[41] stays below the victory
      // overlay (z-50) but above the Rookery launcher (z-40, later in DOM).
      className={`fixed top-14 bottom-0 right-0 w-[380px] z-[41] bg-[#1a1714] border-l border-[#3d3428] flex flex-col transform transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
    >
      {/* 1. Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-[#3d3428] shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] tracking-widest text-[#c8a44e] uppercase font-serif font-bold">
            War Table Intel
          </div>
          <div className="text-sm text-[#d4cfc6] font-bold mt-0.5 truncate">{opponentLabel}</div>
          {profile && hasHistory && (
            <div className="text-[10px] text-[#7a7060] mt-0.5">
              Last {profile.matchesAnalyzed}
              {profile.matchesAnalyzed === MAX_HISTORY_MATCHES ? " (max)" : ""} matches ·{" "}
              {profile.roundsAnalyzed} rounds
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close intel"
          className="text-[#7a7060] hover:text-[#d4cfc6] text-xl leading-none px-1 shrink-0"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {intel.loading ? (
          /* 8. Loading shimmer */
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded bg-[#252019] animate-pulse" />
            ))}
          </div>
        ) : !hasHistory ? (
          /* 7. Empty state */
          <div className="text-sm text-[#7a7060] italic">
            No finished matches on record for this commander.
          </div>
        ) : (
          profile && (
            <>
              {/* 2. Gate habits heatmap: phases x gates (display order East/Under/West) */}
              <section>
                <SectionLabel>Gate Habits</SectionLabel>
                <div className="grid grid-cols-[72px_1fr_1fr_1fr] gap-x-2 items-center">
                  <div />
                  {GATE_ORDER.map((g) => (
                    <div
                      key={g.di}
                      className="text-[9px] tracking-widest text-[#7a7060] uppercase text-center"
                    >
                      {g.name}
                    </div>
                  ))}
                  {PHASES.map((p) => {
                    const ph = profile.phases[p.key];
                    return (
                      <React.Fragment key={p.key}>
                        <div className="text-[9px] tracking-widest text-[#d4cfc6] uppercase">
                          {p.label} <span className="text-[#7a7060]">· {ph.rounds}r</span>
                        </div>
                        {GATE_ORDER.map((g) => (
                          <ShareCell
                            key={g.di}
                            atk={ph.atkShareByGate[g.di]}
                            def={ph.defShareByGate[g.di]}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-1 text-[9px] text-[#7a7060] uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-[#ff8800]" /> Attack
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-[#6b8cae]" /> Defense
                  </span>
                </div>
              </section>

              {/* 3. Tendencies */}
              <section className="border-t border-[#3d3428] pt-3">
                <SectionLabel>Tendencies</SectionLabel>
                <div className="space-y-1">
                  <StatRow label="Win rate" value={`${Math.round(profile.winRate * 100)}%`} />
                  <StatRow label="Trap rate" value={`${Math.round(profile.trapRate * 100)}%`} />
                  <StatRow
                    label="Repair when low"
                    value={`${Math.round(profile.repairWhenLowShare * 100)}%`}
                  />
                  <StatRow label="Avg node contest" value={avgContest.toFixed(1)} />
                </div>
                {Object.keys(profile.abilityRounds).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(profile.abilityRounds).map(([type, rounds]) => {
                      // Typical rounds shown as simple min–max (rounds arrive
                      // sorted ascending from buildProfile) — pinned choice.
                      const lo = rounds[0];
                      const hi = rounds[rounds.length - 1];
                      const range = lo === hi ? `R${lo}` : `R${lo}–${hi}`;
                      return (
                        <span
                          key={type}
                          className="text-[10px] px-2 py-0.5 rounded border border-[#3d3428] bg-[#252019] text-[#c8a44e]"
                        >
                          {ABILITY_TYPE_NAMES[Number(type)] ?? `Ability ${type}`}{" "}
                          <span className="text-[#7a7060]">· {range}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 4. Head to head */}
              {intel.h2h && (
                <section className="border-t border-[#3d3428] pt-3">
                  <SectionLabel>Head to Head</SectionLabel>
                  <div className="text-sm text-[#d4cfc6]">
                    You <span className="text-[#c8a44e] font-bold">{intel.h2h.wins}</span>
                    {" — "}
                    <span className="text-[#ff3344] font-bold">{intel.h2h.losses}</span> Them
                  </div>
                </section>
              )}

              {/* 5. Bluff detector */}
              {showBluff && (
                <section className="border-t border-[#3d3428] pt-3">
                  <SectionLabel>Bluff Detector</SectionLabel>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-[#252019] rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm transition-all"
                        style={{ width: `${bluffPct}%`, backgroundColor: bluffColor }}
                      />
                    </div>
                    <span className="text-xs font-bold w-9 text-right" style={{ color: bluffColor }}>
                      {bluffPct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[#7a7060] mt-1">{bluff.note}</div>
                </section>
              )}
            </>
          )
        )}

        {/* 6. Pre-draft scratchpad — independent of history */}
        {!intel.loading && (
          <section className="border-t border-[#3d3428] pt-3">
            <div className="flex justify-between items-center mb-1.5">
              <SectionLabel>Pre-Draft</SectionLabel>
              <span
                className={`text-xs font-bold ${
                  remaining === 0
                    ? "text-green-400"
                    : remaining < 0
                      ? "text-red-400"
                      : "text-[#daa520]"
                }`}
              >
                {remaining === 0 ? "BUDGET SPENT" : `${remaining} pts left`}
              </span>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="text-[9px] tracking-wider text-[#ff8800] uppercase font-bold border-b border-[#ff8800]/20 pb-0.5">
                  Attack
                </div>
                <div className="text-[9px] tracking-wider text-[#6b8cae] uppercase font-bold border-b border-[#6b8cae]/20 pb-0.5">
                  Defense
                </div>
                {GATE_ORDER.map((g) => (
                  <React.Fragment key={g.di}>
                    <DraftRow
                      label={g.name}
                      value={draft[g.di] || 0}
                      max={projectedBudget}
                      color="#ff8800"
                      onChange={(v) => setSlot(g.di, v)}
                    />
                    <DraftRow
                      label={g.name}
                      value={draft[3 + g.di] || 0}
                      max={projectedBudget}
                      color="#6b8cae"
                      onChange={(v) => setSlot(3 + g.di, v)}
                    />
                  </React.Fragment>
                ))}
              </div>

              <DraftRow
                label="Repair"
                value={draft[6] || 0}
                max={Math.floor(projectedBudget / 2)}
                color="#66cc66"
                onChange={(v) => setSlot(6, v)}
              />

              <div className="text-[9px] tracking-wider text-[#daa520] uppercase font-bold border-b border-[#daa520]/20 pb-0.5">
                Node Contest
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["Forge", "Quarry", "Grove"].map((name, ni) => (
                  <div key={ni} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#d4cfc6] shrink-0">{name}</span>
                    <input
                      type="range"
                      min={0}
                      max={projectedBudget}
                      value={draft[7 + ni] || 0}
                      onChange={(e) => setSlot(7 + ni, parseInt(e.target.value))}
                      className="flex-1 min-w-0 h-2 cursor-pointer"
                      style={{ accentColor: "#daa520", color: "#daa520" }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={projectedBudget}
                      value={draft[7 + ni] || 0}
                      onChange={(e) => setSlot(7 + ni, Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-7 text-center bg-[#252019] border border-[#3d3428] rounded text-xs py-0.5 text-[#daa520]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onSavePreDraft(draft)}
                  className="flex-1 py-1.5 text-[11px] rounded border border-[#c8a44e]/60 text-[#c8a44e] hover:bg-[#c8a44e]/10 font-serif tracking-wider uppercase transition-colors"
                >
                  Save Sketch
                </button>
                <button
                  onClick={() => {
                    if (!onLoadIntoOrders) return;
                    // Persist the live draft, then load it — loading also saves so
                    // the sketch and the orders form never diverge.
                    onSavePreDraft(draft);
                    onLoadIntoOrders(draft);
                  }}
                  disabled={!onLoadIntoOrders}
                  title={onLoadIntoOrders ? undefined : "Available during the commit phase"}
                  className={`flex-1 py-1.5 text-[11px] rounded border font-serif tracking-wider uppercase transition-colors ${
                    onLoadIntoOrders
                      ? "border-green-400/60 text-green-400 hover:bg-green-500/10"
                      : "border-[#3d3428] text-[#7a7060] opacity-50 cursor-not-allowed"
                  }`}
                >
                  Load Into Orders
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
