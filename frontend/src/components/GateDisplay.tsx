"use client";

import type { RoundResult } from "@/lib/gameState";

interface GateDisplayProps {
  yourTeam: 1 | 2;
  yourRole: "attacker" | "defender";
  lastRound: RoundResult | null;
}

// Order: West Gate (index 1), Underground (index 2), East Gate (index 0)
// Maps visual position to the original data index
const GATE_LAYOUT = [
  { dataIndex: 1, name: "WEST GATE", glyph: "╣", desc: "Flanking approach" },
  { dataIndex: 2, name: "UNDERGROUND", glyph: "▽", desc: "Subterranean breach" },
  { dataIndex: 0, name: "EAST GATE", glyph: "╠", desc: "Main approach" },
];

export function GateDisplay({ yourTeam, yourRole, lastRound }: GateDisplayProps) {
  const yourAttack = lastRound ? (yourTeam === 1 ? lastRound.team1Attack : lastRound.team2Attack) : null;
  const yourDefense = lastRound ? (yourTeam === 1 ? lastRound.team1Defense : lastRound.team2Defense) : null;
  const enemyAttack = lastRound ? (yourTeam === 1 ? lastRound.team2Attack : lastRound.team1Attack) : null;
  const enemyDefense = lastRound ? (yourTeam === 1 ? lastRound.team2Defense : lastRound.team1Defense) : null;

  const hasData = lastRound !== null;

  return (
    <div className="border border-[#2a2a3a] rounded-lg bg-[#12121a] overflow-hidden">
      {/* Header with schematic line */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-[0.4em] text-[#6a6a7a] uppercase">Vault Entry Points</span>
          {hasData && <span className="text-[10px] text-[#2a2a3a] font-mono">R{lastRound.round} DATA</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[#2a2a3a]">
          <span className="inline-block w-2 h-[2px] bg-[#00d4ff]/50" />
          <span className="text-[#6a6a7a]">ATK</span>
          <span className="inline-block w-2 h-[2px] bg-[#ff3344]/50 ml-2" />
          <span className="text-[#6a6a7a]">DEF</span>
        </div>
      </div>

      {/* Connecting line (schematic wire) */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-[#2a2a3a] to-transparent" />

      {/* Gates grid */}
      <div className="grid grid-cols-3 divide-x divide-[#1a1a26]">
        {GATE_LAYOUT.map((gate) => {
          const i = gate.dataIndex;
          const atk = yourAttack?.[i] ?? 0;
          const def = yourDefense?.[i] ?? 0;
          const enemyAtk = enemyAttack?.[i] ?? 0;
          const enemyDef = enemyDefense?.[i] ?? 0;

          const outBreak = Math.max(0, atk - enemyDef);
          const inBreak = Math.max(0, enemyAtk - def);
          const isBreached = inBreak > 0;
          const didBreak = outBreak > 0;

          return (
            <div key={gate.name} className="relative flex flex-col items-center px-3 py-4 group">
              {/* Breach warning glow */}
              {hasData && isBreached && <div className="absolute inset-0 bg-[#ff3344]/[0.03]" />}
              {hasData && didBreak && <div className="absolute inset-0 bg-[#00d4ff]/[0.03]" />}

              {/* Gate glyph */}
              <div className="relative mb-2">
                <span
                  className={`text-2xl font-bold leading-none ${
                    !hasData
                      ? "text-[#2a2a3a]"
                      : isBreached
                        ? "text-[#ff3344]/70"
                        : didBreak
                          ? "text-[#00d4ff]/70"
                          : "text-[#6a6a7a]/50"
                  }`}
                >
                  {gate.glyph}
                </span>
              </div>

              {/* Gate name */}
              <div className="text-[11px] font-bold tracking-[0.15em] text-[#e0e0e8] mb-0.5">{gate.name}</div>
              <div className="text-[9px] text-[#2a2a3a] mb-3 tracking-wider">{gate.desc}</div>

              {hasData ? (
                <div className="w-full space-y-3">
                  {/* Your team's attack → enemy gate */}
                  <GateMetric
                    label={yourRole === "attacker" ? "YOUR ATK" : "ALLY ATK"}
                    attack={atk}
                    defense={enemyDef}
                    breakthrough={outBreak}
                    variant="friendly"
                  />

                  {/* Divider */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[1px] bg-[#1a1a26]" />
                    <span className="text-[8px] text-[#2a2a3a] tracking-widest">VS</span>
                    <div className="flex-1 h-[1px] bg-[#1a1a26]" />
                  </div>

                  {/* Enemy attack → your gate */}
                  <GateMetric
                    label="ENEMY ATK"
                    attack={enemyAtk}
                    defense={def}
                    breakthrough={inBreak}
                    variant="enemy"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className="w-8 h-[1px] bg-[#1a1a26]" />
                  <span className="text-[9px] text-[#2a2a3a] tracking-wider">AWAITING INTEL</span>
                  <div className="w-8 h-[1px] bg-[#1a1a26]" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom status strip */}
      {hasData && <div className="h-[1px] bg-gradient-to-r from-transparent via-[#2a2a3a] to-transparent" />}
      {hasData && (
        <div className="px-4 py-2 flex justify-between text-[9px] tracking-wider">
          <span className="text-[#6a6a7a]">
            DEALT{" "}
            <span className="text-[#00d4ff] font-bold">
              {GATE_LAYOUT.reduce((sum, g) => {
                const a = yourAttack?.[g.dataIndex] ?? 0;
                const d = enemyDefense?.[g.dataIndex] ?? 0;
                return sum + Math.max(0, a - d);
              }, 0)}
            </span>{" "}
            TOTAL
          </span>
          <span className="text-[#6a6a7a]">
            TOOK{" "}
            <span className="text-[#ff3344] font-bold">
              {GATE_LAYOUT.reduce((sum, g) => {
                const a = enemyAttack?.[g.dataIndex] ?? 0;
                const d = yourDefense?.[g.dataIndex] ?? 0;
                return sum + Math.max(0, a - d);
              }, 0)}
            </span>{" "}
            TOTAL
          </span>
        </div>
      )}
    </div>
  );
}

function GateMetric({
  label,
  attack,
  defense,
  breakthrough,
  variant,
}: {
  label: string;
  attack: number;
  defense: number;
  breakthrough: number;
  variant: "friendly" | "enemy";
}) {
  const isFriendly = variant === "friendly";
  const accentColor = isFriendly ? "#00d4ff" : "#ff3344";
  const barBg = isFriendly ? "bg-[#00d4ff]" : "bg-[#ff3344]";
  const labelColor = isFriendly ? "text-[#00d4ff]/60" : "text-[#ff3344]/60";

  const maxVal = 13;
  const atkPct = Math.min(100, (attack / maxVal) * 100);
  const defPct = Math.min(100, (defense / maxVal) * 100);

  return (
    <div className="space-y-1">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className={`text-[9px] tracking-[0.15em] ${labelColor}`}>{label}</span>
        <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums">
          <span style={{ color: accentColor }}>{attack}</span>
          <span className="text-[#2a2a3a]">/</span>
          <span className="text-[#6a6a7a]">{defense}</span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="relative w-full h-[6px] bg-[#0a0a0f] rounded-sm overflow-hidden">
        {/* Defense threshold */}
        <div className="absolute top-0 h-full bg-[#6a6a7a]/20 rounded-sm" style={{ width: `${defPct}%` }} />
        {/* Defense marker line */}
        {defense > 0 && (
          <div className="absolute top-0 w-[2px] h-full bg-[#6a6a7a]/50" style={{ left: `${defPct}%` }} />
        )}
        {/* Attack bar */}
        <div className={`absolute top-0 h-full ${barBg} rounded-sm`} style={{ width: `${atkPct}%`, opacity: 0.7 }} />
        {/* Breakthrough segment */}
        {breakthrough > 0 && (
          <div
            className="absolute top-0 h-full bg-green-400 rounded-sm"
            style={{
              left: `${defPct}%`,
              width: `${Math.min(100 - defPct, (breakthrough / maxVal) * 100)}%`,
              opacity: 0.8,
            }}
          />
        )}
      </div>

      {/* Breakthrough callout */}
      {breakthrough > 0 && (
        <div className="flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-green-400" />
          <span className="text-[9px] text-green-400/80 tracking-wider">{breakthrough} BREACH</span>
        </div>
      )}
    </div>
  );
}
