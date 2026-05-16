// frontend/src/components/HexGrid.tsx
"use client";

import { useState } from "react";
import type { ParcelData } from "@/lib/worldState";
import type { PlayerCosmeticsData } from "@/lib/cosmetics";

interface HexGridProps {
  parcels: ParcelData[];
  playerAddress: string | null;
  homeParcelIds: number[]; // [home0, home1, home2]
  cosmeticsMap?: Record<string, PlayerCosmeticsData>;
}

const PARCEL_TYPE_COLORS: Record<number, string> = {
  0: "#b87333", // Forge — copper
  1: "#8a8a9a", // Quarry — grey
  2: "#4a7c59", // Grove — green
  255: "#4a4a4a", // Untyped — neutral dark grey
};

const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
  255: "Untyped",
};

const HEX_SIZE = 36;

const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

function hexToPixel(col: number, row: number): { x: number; y: number } {
  const x = col * HEX_WIDTH + (row % 2 === 1 ? HEX_WIDTH / 2 : 0);
  const y = row * (HEX_HEIGHT * 0.75);
  return { x, y };
}

function hexPoints(cx: number, cy: number, size = HEX_SIZE): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + 30);
    const px = cx + size * Math.cos(angle);
    const py = cy + size * Math.sin(angle);
    points.push(`${px},${py}`);
  }
  return points.join(" ");
}

function normalizeAddr(a: string): string {
  try {
    return "0x" + BigInt(a).toString(16);
  } catch {
    return a.toLowerCase();
  }
}

function truncateAddress(addr: string): string {
  if (!addr || addr === "0x0" || addr.length < 10) return "Unclaimed";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface SkinDecor {
  patternId: string;
  innerRingColor: string;
  innerRingOpacity: number;
  cornerMarks: boolean;
}

const SKIN_DECOR: Record<string, SkinDecor> = {
  "voltage-divider": {
    patternId: "skin-diagonal",
    innerRingColor: "#c8a44e",
    innerRingOpacity: 0.5,
    cornerMarks: true,
  },
  "common-emitter-amp": {
    patternId: "skin-crosshatch",
    innerRingColor: "#8a8a9a",
    innerRingOpacity: 0.45,
    cornerMarks: true,
  },
};

const DEFAULT_SKIN_DECOR: SkinDecor = {
  patternId: "skin-dots",
  innerRingColor: "#c8a44e",
  innerRingOpacity: 0.4,
  cornerMarks: false,
};

function getSkinDecor(skin: string | null): SkinDecor | null {
  if (!skin) return null;
  return SKIN_DECOR[skin] ?? DEFAULT_SKIN_DECOR;
}

export function HexGrid({ parcels, playerAddress, homeParcelIds, cosmeticsMap }: HexGridProps) {
  const [hoveredParcel, setHoveredParcel] = useState<ParcelData | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelData | null>(null);

  if (parcels.length === 0) return null;

  const positions = parcels.map((p) => hexToPixel(p.col, p.row));
  const padding = HEX_SIZE * 2;
  const minX = Math.min(...positions.map((p) => p.x)) - padding;
  const minY = Math.min(...positions.map((p) => p.y)) - padding;
  const maxX = Math.max(...positions.map((p) => p.x)) + padding;
  const maxY = Math.max(...positions.map((p) => p.y)) + padding;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const isOwned = (parcel: ParcelData) => playerAddress && parcel.owner.toLowerCase() === playerAddress.toLowerCase();

  const isUnclaimed = (parcel: ParcelData) =>
    parcel.owner === "0x0" || parcel.owner === "0x0000000000000000000000000000000000000000000000000000000000000000";

  const isHome = (parcel: ParcelData) => homeParcelIds.includes(parcel.parcelId);

  const getStroke = (parcel: ParcelData) => {
    if (selectedParcel?.parcelId === parcel.parcelId) return "#ffffff";
    if (isOwned(parcel)) return "#daa520";
    if (!isUnclaimed(parcel)) return "#c44332";
    return "#3d3428";
  };

  const getStrokeWidth = (parcel: ParcelData) => {
    if (selectedParcel?.parcelId === parcel.parcelId) return 3;
    if (isOwned(parcel)) return 2.5;
    if (!isUnclaimed(parcel)) return 2;
    return 1;
  };

  const getFillOpacity = (parcel: ParcelData) => {
    if (isUnclaimed(parcel)) return 0.3;
    if (isOwned(parcel)) return 0.7;
    return 0.5;
  };

  return (
    <div className="relative">
      <svg viewBox={viewBox} className="w-full max-h-[60vh]" style={{ background: "transparent" }}>
        <defs>
          <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#daa520" floodOpacity="0.4" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Parcel skin patterns */}
          <pattern id="skin-diagonal" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#c8a44e" strokeWidth="1.5" strokeOpacity="0.4" />
          </pattern>
          <pattern id="skin-crosshatch" patternUnits="userSpaceOnUse" width="8" height="8">
            <line x1="0" y1="0" x2="8" y2="8" stroke="#8a8a9a" strokeWidth="0.8" strokeOpacity="0.35" />
            <line x1="8" y1="0" x2="0" y2="8" stroke="#8a8a9a" strokeWidth="0.8" strokeOpacity="0.35" />
          </pattern>
          <pattern id="skin-dots" patternUnits="userSpaceOnUse" width="10" height="10">
            <circle cx="5" cy="5" r="1.2" fill="#c8a44e" fillOpacity="0.35" />
          </pattern>
        </defs>

        {parcels.map((parcel) => {
          const { x, y } = hexToPixel(parcel.col, parcel.row);
          const owned = isOwned(parcel);
          const home = isHome(parcel);
          const unclaimed = isUnclaimed(parcel);
          const ownerCosmetics = !unclaimed ? cosmeticsMap?.[normalizeAddr(parcel.owner)] : undefined;
          const skinDecor = getSkinDecor(ownerCosmetics?.parcelSkin ?? null);

          return (
            <g
              key={parcel.parcelId}
              onMouseEnter={() => setHoveredParcel(parcel)}
              onMouseLeave={() => setHoveredParcel(null)}
              onClick={() => setSelectedParcel(selectedParcel?.parcelId === parcel.parcelId ? null : parcel)}
              className="cursor-pointer"
              filter={owned ? "url(#glow-gold)" : undefined}
            >
              {/* Base hex fill */}
              <polygon
                points={hexPoints(x, y)}
                fill={PARCEL_TYPE_COLORS[parcel.parcelType] || "#555"}
                fillOpacity={getFillOpacity(parcel)}
                stroke={getStroke(parcel)}
                strokeWidth={getStrokeWidth(parcel)}
              />

              {/* Parcel skin overlay */}
              {skinDecor && (
                <>
                  {/* Pattern fill overlay */}
                  <polygon
                    points={hexPoints(x, y, HEX_SIZE - 3)}
                    fill={`url(#${skinDecor.patternId})`}
                    stroke="none"
                  />
                  {/* Inner decorative ring */}
                  <polygon
                    points={hexPoints(x, y, HEX_SIZE - 6)}
                    fill="none"
                    stroke={skinDecor.innerRingColor}
                    strokeWidth={1}
                    strokeOpacity={skinDecor.innerRingOpacity}
                    strokeDasharray="4 3"
                  />
                  {/* Corner marks at hex vertices */}
                  {skinDecor.cornerMarks && Array.from({ length: 6 }).map((_, i) => {
                    const angle = (Math.PI / 180) * (60 * i + 30);
                    const r1 = HEX_SIZE - 4;
                    const r2 = HEX_SIZE - 8;
                    const x1 = x + r1 * Math.cos(angle);
                    const y1 = y + r1 * Math.sin(angle);
                    const x2 = x + r2 * Math.cos(angle);
                    const y2 = y + r2 * Math.sin(angle);
                    return (
                      <line
                        key={i}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={skinDecor.innerRingColor}
                        strokeWidth={1.2}
                        strokeOpacity={skinDecor.innerRingOpacity + 0.15}
                      />
                    );
                  })}
                </>
              )}

              {/* Home parcel marker */}
              {home && (
                <text x={x} y={y + 2} textAnchor="middle" dominantBaseline="central" fontSize="14" fill="#daa520">
                  ⛊
                </text>
              )}
              {/* Parcel type label */}
              {!home && (
                <text
                  x={x}
                  y={y + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={parcel.parcelType === 255 ? "6" : "8"}
                  fill={parcel.parcelType === 255 ? "#6a6a6a" : "#d4cfc6"}
                  fillOpacity={0.6}
                >
                  {parcel.parcelType === 255 ? "?" : PARCEL_TYPE_NAMES[parcel.parcelType]?.[0]}
                </text>
              )}
              {/* Banner pennant */}
              {!unclaimed && ownerCosmetics?.banner && (
                <g transform={`translate(${x + 14}, ${y - 20})`}>
                  <rect x={-6} y={-8} width={12} height={16} rx={1} fill="rgba(200,164,78,0.25)" stroke="#c8a44e" strokeWidth={0.8} />
                  <line x1={0} y1={-8} x2={0} y2={-14} stroke="#c8a44e" strokeWidth={0.8} />
                  <circle cx={0} cy={-14} r={1.2} fill="#c8a44e" />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredParcel && (
        <div className="absolute top-2 right-2 bg-[#1a1714] border border-[#3d3428] rounded-lg p-3 text-xs space-y-1 pointer-events-none z-10">
          <div className="font-bold font-serif text-[#d4cfc6]">
            {PARCEL_TYPE_NAMES[hoveredParcel.parcelType] || "Unknown"}
          </div>
          <div className="text-[#7a7060]">
            ({hoveredParcel.col}, {hoveredParcel.row})
          </div>
          <div
            className={
              isUnclaimed(hoveredParcel)
                ? "text-[#7a7060]"
                : isOwned(hoveredParcel)
                  ? "text-[#daa520]"
                  : "text-[#c44332]"
            }
          >
            {isOwned(hoveredParcel) ? "Your parcel" : truncateAddress(hoveredParcel.owner)}
          </div>
          {isHome(hoveredParcel) && <div className="text-[#daa520] text-[10px]">HOME PARCEL</div>}
        </div>
      )}
    </div>
  );
}
