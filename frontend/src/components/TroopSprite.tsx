"use client";

import Image from "next/image";

export type TroopType = "attack" | "defense" | "healer" | "node";
export type Team = "a" | "b";

interface TroopSpriteProps {
  type: TroopType;
  team: Team;
  x: number;
  y: number;
  offsetIndex: number;
  animate?: boolean;
}

const SPRITE_MAP: Record<TroopType, Record<Team, string>> = {
  attack: { a: "/sprites/troops/troop_attacka.png", b: "/sprites/troops/troop_attackb.png" },
  defense: { a: "/sprites/troops/troop_defensea.png", b: "/sprites/troops/troop_defenseb.png" },
  healer: { a: "/sprites/troops/troop_healera.png", b: "/sprites/troops/troop_healerb.png" },
  node: { a: "/sprites/troops/troop_nodea.png", b: "/sprites/troops/troop_nodeb.png" },
};

const FORMATION_OFFSETS = [
  { dx: 0, dy: 0 },
  { dx: -1.5, dy: -2 },
  { dx: 1.5, dy: -2 },
  { dx: -3, dy: -4 },
  { dx: 3, dy: -4 },
];

export function TroopSprite({ type, team, x, y, offsetIndex, animate }: TroopSpriteProps) {
  const offset = FORMATION_OFFSETS[offsetIndex] ?? { dx: 0, dy: 0 };
  const finalX = x + offset.dx;
  const finalY = y + offset.dy;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${finalX}%`,
        top: `${finalY}%`,
        transform: "translate(-50%, -50%)",
        transition: "left 0.4s ease-out, top 0.4s ease-out, opacity 0.3s ease-out",
        width: "7%",
        opacity: animate ? 1 : 0.7,
      }}
    >
      <Image
        src={SPRITE_MAP[type][team]}
        alt={`${team} ${type}`}
        width={64}
        height={64}
        className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

interface TroopGroupProps {
  type: TroopType;
  team: Team;
  count: number;
  x: number;
  y: number;
  animate?: boolean;
}

export function TroopGroup({ type, team, count, x, y, animate }: TroopGroupProps) {
  if (count <= 0) return null;
  const visibleCount = Math.min(count, 5);

  return (
    <>
      {Array.from({ length: visibleCount }, (_, i) => (
        <TroopSprite
          key={`${type}-${team}-${i}`}
          type={type}
          team={team}
          x={x}
          y={y}
          offsetIndex={i}
          animate={animate}
        />
      ))}
      {count > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${x}%`,
            top: `${y + 5}%`,
            transform: "translateX(-50%)",
            transition: "left 0.4s ease-out, top 0.4s ease-out",
          }}
        >
          <span className="bg-[#1a1714]/80 border border-[#3d3428] text-[#d4cfc6] text-[10px] font-bold px-1.5 py-0.5 rounded">
            x{count}
          </span>
        </div>
      )}
    </>
  );
}
