"use client";

import { useMemo } from "react";
import type { ParcelData } from "@/lib/worldState";
import { HEX_SIZE, hexToPixel, hexPoints, PARCEL_TYPE_COLORS } from "@/lib/hexRender";

interface ClaimParcelMapProps {
  parcels: ParcelData[];
  candidates: ParcelData[];
  winnerAddress: string;
  selectedId: number | null;
  onSelect: (parcelId: number) => void;
}

const GOLD = "#c8a44e";

function sameAddr(a: string, b: string): boolean {
  try {
    return BigInt(a || "0x0") === BigInt(b || "0x0");
  } catch {
    return false;
  }
}

export function ClaimParcelMap({ parcels, candidates, winnerAddress, selectedId, onSelect }: ClaimParcelMapProps) {
  const candidateIds = useMemo(() => new Set(candidates.map((c) => c.parcelId)), [candidates]);

  const viewBox = useMemo(() => {
    if (parcels.length === 0) return "0 0 100 100";
    const positions = parcels.map((p) => hexToPixel(p.col, p.row));
    const padding = HEX_SIZE * 1.5;
    const minX = Math.min(...positions.map((p) => p.x)) - padding;
    const minY = Math.min(...positions.map((p) => p.y)) - padding;
    const maxX = Math.max(...positions.map((p) => p.x)) + padding;
    const maxY = Math.max(...positions.map((p) => p.y)) + padding;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [parcels]);

  if (parcels.length === 0) return null;

  return (
    <div className="relative">
      <style>{`
        @keyframes claimPulse {
          0%, 100% { stroke-opacity: 0.35; stroke-width: 2; }
          50% { stroke-opacity: 1; stroke-width: 3.5; }
        }
        .claim-candidate-ring { animation: claimPulse 1.6s ease-in-out infinite; }
      `}</style>
      <svg viewBox={viewBox} className="w-full max-h-[40vh]" style={{ background: "transparent" }}>
        <defs>
          <filter id="claim-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={GOLD} floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {parcels.map((parcel) => {
          const { x, y } = hexToPixel(parcel.col, parcel.row);
          const isCandidate = candidateIds.has(parcel.parcelId);
          const isSelected = selectedId === parcel.parcelId;
          const isOwned = sameAddr(parcel.owner, winnerAddress);
          const fill = PARCEL_TYPE_COLORS[parcel.parcelType] ?? "#555";

          const fillOpacity = isCandidate ? 0.85 : isOwned ? 0.55 : 0.2;
          const stroke = isOwned ? GOLD : isCandidate ? GOLD : "#3d3428";
          const strokeWidth = isOwned ? 2 : 1;

          const label = `Claim parcel at column ${parcel.col} row ${parcel.row}`;

          return (
            <g
              key={parcel.parcelId}
              role={isCandidate ? "button" : undefined}
              aria-label={isCandidate ? label : undefined}
              tabIndex={isCandidate ? 0 : undefined}
              onClick={isCandidate ? () => onSelect(parcel.parcelId) : undefined}
              onKeyDown={
                isCandidate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(parcel.parcelId);
                      }
                    }
                  : undefined
              }
              style={{ cursor: isCandidate ? "pointer" : "default", outline: "none" }}
              filter={isSelected ? "url(#claim-glow)" : undefined}
            >
              <polygon
                points={hexPoints(x, y)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />

              {/* Pulsing outline on claimable candidates */}
              {isCandidate && !isSelected && (
                <polygon
                  className="claim-candidate-ring"
                  points={hexPoints(x, y, HEX_SIZE - 2)}
                  fill="none"
                  stroke={GOLD}
                />
              )}

              {/* Solid bright ring on the selected candidate */}
              {isSelected && (
                <polygon
                  points={hexPoints(x, y, HEX_SIZE - 2)}
                  fill="none"
                  stroke={GOLD}
                  strokeWidth={4}
                />
              )}

              {/* Home marker for any owner's home parcels */}
              {parcel.isHome && (
                <text x={x} y={y + 2} textAnchor="middle" dominantBaseline="central" fontSize="14" fill="#daa520">
                  ⛊
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
