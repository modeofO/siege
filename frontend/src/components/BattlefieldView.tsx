"use client";

import { useMemo } from "react";
import { TroopGroup } from "./TroopSprite";
import type { Team } from "./TroopSprite";

interface BattlefieldViewProps {
  allocations: number[];
  isPlayerA: boolean;
  committed: boolean;
  modifiers: [number, number, number];
  opponentAllocations?: number[] | null;
}

const GATE_NAMES = ["East Gate", "West Gate", "Underground"];

const MODIFIER_LABELS: Record<number, string> = {
  1: "Narrow Pass",
  2: "Mirror Gate",
  3: "Deadlock",
  4: "Reflection",
};

const MODIFIER_COLORS: Record<number, string> = {
  1: "text-[#daa520] border-[#daa520]/40 bg-[#daa520]/10",
  2: "text-[#c8a44e] border-[#c8a44e]/40 bg-[#c8a44e]/10",
  3: "text-[#ff3344] border-[#ff3344]/40 bg-[#ff3344]/10",
  4: "text-[#ff8800] border-[#ff8800]/40 bg-[#ff8800]/10",
};

export const POSITIONS = {
  baseA: { x: 17, y: 42 },
  baseB: { x: 83, y: 42 },
  // Indexed by allocation slot: 0=East (top), 1=West (bottom), 2=Underground (middle)
  gates: [
    { x: 50, y: 22 },
    { x: 50, y: 72 },
    { x: 50, y: 47 },
  ],
  nodes: [
    { x: 47, y: 20 },
    { x: 47, y: 47 },
    { x: 47, y: 68 },
  ],
  repairA: { x: 22, y: 42 },
  repairB: { x: 78, y: 42 },
};

function getAttackPositions(team: Team) {
  const target = team === "a" ? POSITIONS.baseB : POSITIONS.baseA;
  return POSITIONS.gates.map((g, i) => {
    if (i === 2) return { x: target.x + (team === "a" ? -8 : 8), y: 48 };
    return { x: target.x, y: g.y };
  });
}

function getDefensePositions(team: Team) {
  const base = team === "a" ? POSITIONS.baseA : POSITIONS.baseB;
  return POSITIONS.gates.map((g, i) => {
    if (i === 2) return { x: base.x + (team === "a" ? 8 : -8), y: 48 };
    return { x: base.x + (team === "a" ? 5 : -5), y: g.y };
  });
}

function getNodePositions(team: Team) {
  const dx = team === "a" ? -2 : 2;
  return POSITIONS.nodes.map((n) => ({ x: n.x + dx, y: n.y }));
}

export function BattlefieldView({
  allocations,
  isPlayerA,
  committed,
  modifiers,
  opponentAllocations,
}: BattlefieldViewProps) {
  const myTeam: Team = isPlayerA ? "a" : "b";
  const enemyTeam: Team = isPlayerA ? "b" : "a";

  const hasAllocated = allocations.some((v) => v > 0);

  const myTroops = useMemo(() => {
    const base = myTeam === "a" ? POSITIONS.baseA : POSITIONS.baseB;
    const attackPos = getAttackPositions(myTeam);
    const defensePos = getDefensePositions(myTeam);
    const nodePos = getNodePositions(myTeam);
    const repairPos = myTeam === "a" ? POSITIONS.repairA : POSITIONS.repairB;

    if (!hasAllocated && !committed) {
      const totalBudget = 10;
      return [{ type: "attack" as const, team: myTeam, count: totalBudget, x: base.x, y: base.y }];
    }

    const groups: { type: "attack" | "defense" | "healer" | "node"; team: Team; count: number; x: number; y: number }[] = [];

    for (let i = 0; i < 3; i++) {
      if (allocations[i] > 0) {
        groups.push({ type: "attack", team: myTeam, count: allocations[i], x: attackPos[i].x, y: attackPos[i].y });
      }
    }

    for (let i = 0; i < 3; i++) {
      if (allocations[3 + i] > 0) {
        groups.push({ type: "defense", team: myTeam, count: allocations[3 + i], x: defensePos[i].x, y: defensePos[i].y });
      }
    }

    if (allocations[6] > 0) {
      groups.push({ type: "healer", team: myTeam, count: allocations[6], x: repairPos.x, y: repairPos.y });
    }

    for (let i = 0; i < 3; i++) {
      if (allocations[7 + i] > 0) {
        groups.push({ type: "node", team: myTeam, count: allocations[7 + i], x: nodePos[i].x, y: nodePos[i].y });
      }
    }

    return groups;
  }, [allocations, myTeam, hasAllocated, committed]);

  const enemyTroops = useMemo(() => {
    if (!opponentAllocations) return [];

    const attackPos = getAttackPositions(enemyTeam);
    const defensePos = getDefensePositions(enemyTeam);
    const nodePos = getNodePositions(enemyTeam);
    const repairPos = enemyTeam === "a" ? POSITIONS.repairA : POSITIONS.repairB;

    const groups: { type: "attack" | "defense" | "healer" | "node"; team: Team; count: number; x: number; y: number }[] = [];

    for (let i = 0; i < 3; i++) {
      if (opponentAllocations[i] > 0) {
        groups.push({ type: "attack", team: enemyTeam, count: opponentAllocations[i], x: attackPos[i].x, y: attackPos[i].y });
      }
    }

    for (let i = 0; i < 3; i++) {
      if (opponentAllocations[3 + i] > 0) {
        groups.push({ type: "defense", team: enemyTeam, count: opponentAllocations[3 + i], x: defensePos[i].x, y: defensePos[i].y });
      }
    }

    if (opponentAllocations[6] > 0) {
      groups.push({ type: "healer", team: enemyTeam, count: opponentAllocations[6], x: repairPos.x, y: repairPos.y });
    }

    for (let i = 0; i < 3; i++) {
      if (opponentAllocations[7 + i] > 0) {
        groups.push({ type: "node", team: enemyTeam, count: opponentAllocations[7 + i], x: nodePos[i].x, y: nodePos[i].y });
      }
    }

    return groups;
  }, [opponentAllocations, enemyTeam]);

  return (
    <div className="border border-[#3d3428] rounded-lg overflow-hidden bg-[#1a1714]">
      <style>{`
        @keyframes battlefield-drift {
          0% { transform: translateX(-20%); }
          100% { transform: translateX(140%); }
        }
        .battlefield-cloud {
          animation: battlefield-drift var(--cloud-duration, 45s) linear infinite;
        }
      `}</style>
      {/* Gate modifier bar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif">Battlefield</span>
        <div className="flex items-center gap-4">
          {[0, 2, 1].map((i) => {
            const mod = modifiers[i];
            const label = MODIFIER_LABELS[mod];
            const colors = MODIFIER_COLORS[mod];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#d4cfc6]/60 font-serif tracking-wider">{GATE_NAMES[i]}</span>
                {label ? (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${colors}`}>{label}</span>
                ) : (
                  <span className="text-[9px] text-[#7a7060] px-1.5 py-0.5">Normal</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="relative w-full select-none"
        style={{
          aspectRatio: "16 / 9",
          backgroundImage: "url(/sprites/battlefield.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Gate position markers */}
        {POSITIONS.gates.map((g, i) => (
          <div
            key={`gate-${i}`}
            className="absolute w-2 h-2 rounded-full bg-[#c8a44e]/20 border border-[#c8a44e]/30"
            style={{ left: `${g.x}%`, top: `${g.y}%`, transform: "translate(-50%, -50%)" }}
          />
        ))}

        {/* Node position markers */}
        {POSITIONS.nodes.map((n, i) => (
          <div
            key={`node-${i}`}
            className="absolute w-2 h-2 rounded-full bg-[#66cc66]/20 border border-[#66cc66]/30"
            style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -50%)" }}
          />
        ))}

        {/* My troops */}
        {myTroops.map((g, i) => (
          <TroopGroup
            key={`my-${g.type}-${i}`}
            type={g.type}
            team={g.team}
            count={g.count}
            x={g.x}
            y={g.y}
            animate={hasAllocated}
          />
        ))}

        {/* Enemy troops */}
        {enemyTroops.map((g, i) => (
          <TroopGroup
            key={`enemy-${g.type}-${i}`}
            type={g.type}
            team={g.team}
            count={g.count}
            x={g.x}
            y={g.y}
            animate
          />
        ))}

        {/* Cloud fog over enemy side */}
        <div
          className="absolute inset-y-0 pointer-events-none overflow-hidden"
          style={{
            left: isPlayerA ? "35%" : "0%",
            right: isPlayerA ? "0%" : "35%",
            zIndex: 10,
            maskImage: `linear-gradient(to ${isPlayerA ? "left" : "right"}, black 0%, black 50%, transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to ${isPlayerA ? "left" : "right"}, black 0%, black 50%, transparent 100%)`,
          }}
        >
          {[
            { top: "5%", duration: "40s", delay: "0s", scale: 1.3 },
            { top: "30%", duration: "55s", delay: "-15s", scale: 1.0 },
            { top: "55%", duration: "48s", delay: "-30s", scale: 1.2 },
            { top: "75%", duration: "52s", delay: "-8s", scale: 0.9 },
          ].map((c, i) => (
            <svg
              key={i}
              className="battlefield-cloud"
              style={{
                position: "absolute",
                top: c.top,
                left: 0,
                width: "55%",
                height: "50%",
                opacity: 0.35,
                filter: "blur(12px) brightness(0.8) saturate(0.5)",
                transform: `scale(${c.scale}) translateX(-20%)`,
                willChange: "transform",
                animationDuration: c.duration,
                animationDelay: c.delay,
              } as React.CSSProperties}
              viewBox="0 0 200 60"
              preserveAspectRatio="none"
            >
              <ellipse cx="40" cy="30" rx="35" ry="14" fill="#c8bfa8" />
              <ellipse cx="85" cy="25" rx="45" ry="18" fill="#c8bfa8" />
              <ellipse cx="140" cy="32" rx="38" ry="15" fill="#c8bfa8" />
              <ellipse cx="175" cy="28" rx="22" ry="12" fill="#c8bfa8" />
            </svg>
          ))}
        </div>

        {/* Ember vignette overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: "inset 0 0 80px 30px rgba(180, 80, 10, 0.35), inset 0 0 160px 60px rgba(0, 0, 0, 0.5)",
          }}
        />
      </div>
    </div>
  );
}
