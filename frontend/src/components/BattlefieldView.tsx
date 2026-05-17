"use client";

import { useMemo } from "react";
import { TroopGroup } from "./TroopSprite";
import type { Team } from "./TroopSprite";

interface BattlefieldViewProps {
  allocations: number[];
  isPlayerA: boolean;
  committed: boolean;
  opponentAllocations?: number[] | null;
}

const POSITIONS = {
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
      <div className="text-[10px] tracking-wider text-[#7a7060] uppercase px-3 pt-2 font-serif">Battlefield</div>
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
