"use client";

import { useCallback } from "react";
import type { Circuit, ComponentKind } from "@/lib/forge/circuits";
import type { PlacedComponent } from "@/lib/forge/topology";

const COLS = 8;
const ROWS = 6;
const CELL = 56;

function cellToPx(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function tracePath(points: [number, number][]) {
  return points.map(([c, r]) => {
    const { x, y } = cellToPx(c, r);
    return `${x},${y}`;
  }).join(" ");
}

interface BoardComponentProps {
  kind: ComponentKind;
  col: number;
  row: number;
  label: string;
  lit: boolean;
  locked?: boolean;
}

function BoardComponent({ kind, col, row, lit }: BoardComponentProps) {
  const { x, y } = cellToPx(col, row);
  const isSource = kind === "origin-crystal";
  const size = 44;
  const color = lit || isSource ? "oklch(0.78 0.13 75)" : "#b39e74";

  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2})`}>
      <rect
        width={size}
        height={size}
        fill="#2a190d"
        stroke={lit || isSource ? "oklch(0.78 0.13 75)" : "#1a0f08"}
        strokeWidth={lit || isSource ? 1.5 : 1}
        rx={2}
        style={{
          filter: lit || isSource ? "drop-shadow(0 0 8px rgba(255,180,80,0.6))" : "none",
          transition: "all 0.4s ease",
        }}
      />
      <rect x="2" y="2" width={size - 4} height={size - 4} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1" rx={1.5} />
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <g transform="translate(-12,-12)">
          <ComponentGlyph kind={kind} color={color} lit={lit} />
        </g>
      </g>
    </g>
  );
}

function ComponentGlyph({ kind, color, lit }: { kind: ComponentKind; color: string; lit: boolean }) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g>
          <polygon points="12,2 19,9 12,22 5,9" fill="rgba(255,200,100,0.3)" stroke={color} strokeWidth="1.4" />
          <line x1="5" y1="9" x2="19" y2="9" stroke={color} strokeWidth="1.4" />
          <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "void-drain":
      return (
        <g>
          <circle cx="12" cy="12" r="9" fill="rgba(0,0,0,0.6)" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </g>
      );
    case "one-way-valve":
      return (
        <g>
          <polygon points="5,5 19,12 5,19" fill={lit ? "rgba(255,180,80,0.25)" : "none"} stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="19" y1="5" x2="19" y2="19" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "flux-well":
      return (
        <g>
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5" fill={lit ? "rgba(255,180,80,0.25)" : "none"} stroke={color} strokeWidth="1.4" />
          <line x1="3" y1="12" x2="7" y2="12" stroke={color} strokeWidth="1.4" />
          <line x1="17" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "rune-stone":
      return (
        <g>
          <polygon points="12,3 20,9 17,20 7,20 4,9" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="12" y1="7" x2="12" y2="17" stroke={color} strokeWidth="1.4" />
          <line x1="9" y1="10" x2="15" y2="10" stroke={color} strokeWidth="1.4" />
          <line x1="9" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "spiral-coil":
      return (
        <g>
          <path d="M3 12 Q 6 4, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
          <path d="M3 12 Q 6 20, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
        </g>
      );
    default:
      return null;
  }
}

interface ForgeBoardProps {
  circuit: Circuit;
  placedComponents: Record<string, PlacedComponent>;
  isLit: boolean;
  onDrop: (instanceId: string, kind: ComponentKind, col: number, row: number) => void;
  onRemove: (instanceId: string) => void;
  interactive?: boolean;
}

export function ForgeBoard({
  circuit,
  placedComponents,
  isLit,
  onDrop,
  onRemove,
  interactive = true,
}: ForgeBoardProps) {
  const W = COLS * CELL;
  const H = ROWS * CELL;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("forge/kind") as ComponentKind;
      const instanceId = e.dataTransfer.getData("forge/instanceId");
      if (!kind || !instanceId) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left - 16;
      const py = e.clientY - rect.top - 16;
      const col = Math.round(px / CELL - 0.5);
      const row = Math.round(py / CELL - 0.5);

      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

      const isOccupiedByLocked = circuit.components.some(
        (c) => c.locked && c.col === col && c.row === row,
      );
      if (isOccupiedByLocked) return;

      const isOccupiedByPlaced = Object.entries(placedComponents).some(
        ([id, p]) => id !== instanceId && p.col === col && p.row === row,
      );
      if (isOccupiedByPlaced) return;

      onDrop(instanceId, kind, col, row);
    },
    [circuit, placedComponents, onDrop],
  );


  return (
    <div
      style={{
        position: "relative",
        width: W + 32,
        height: H + 32,
        padding: 16,
        background: "radial-gradient(ellipse at 50% 50%, #1a1428 0%, #0d0a14 80%)",
        border: "1px solid rgba(120, 80, 200, 0.2)",
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.7), 0 4px 30px rgba(0,0,0,0.6), 0 0 60px rgba(100, 60, 180, 0.08)",
      }}
      onDragOver={interactive ? handleDragOver : undefined}
      onDrop={interactive ? handleDrop : undefined}
    >
      <svg width={W} height={H} style={{ display: "block", position: "relative" }}>
        <defs>
          <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.85 0.16 80)" />
            <stop offset="50%" stopColor="oklch(0.78 0.13 75)" />
            <stop offset="100%" stopColor="oklch(0.85 0.16 80)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: ROWS + 1 }).map((_, r) => (
          <line key={`h${r}`} x1={0} y1={r * CELL} x2={W} y2={r * CELL} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}
        {Array.from({ length: COLS + 1 }).map((_, c) => (
          <line key={`v${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={H} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}

        {/* Peg dots */}
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <circle key={`d${r}-${c}`} cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r="2" fill="rgba(255,180,80,0.15)" />
          )),
        )}

        {/* Drop target placeholders for non-locked components */}
        {circuit.components
          .filter((c) => !c.locked)
          .filter((target) => {
            const occupied = Object.values(placedComponents).some(
              (p) => p.col === target.col && p.row === target.row,
            );
            return !occupied;
          })
          .map((target) => {
            const { x, y } = cellToPx(target.col, target.row);
            const size = 44;
            return (
              <rect
                key={`placeholder-${target.id}`}
                x={x - size / 2}
                y={y - size / 2}
                width={size}
                height={size}
                fill="none"
                stroke="rgba(120, 80, 200, 0.3)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                rx={2}
              />
            );
          })}

        {/* Carved channel base (always visible) */}
        {circuit.traces.map((t, i) => (
          <polyline
            key={`base-${i}`}
            points={tracePath(t.points)}
            fill="none"
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hint silhouette */}
        {!isLit &&
          circuit.traces.map((t, i) => (
            <polyline
              key={`hint-${i}`}
              points={tracePath(t.points)}
              fill="none"
              stroke="rgba(255,180,80,0.12)"
              strokeWidth="3"
              strokeDasharray="4 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* Lit traces */}
        {isLit &&
          circuit.traces.map((t, i) => (
            <g key={`lit-${i}`} style={{ animation: "glow-pulse 2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}>
              <polyline
                points={tracePath(t.points)}
                fill="none"
                stroke="url(#trace-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 4"
                style={{ animation: "pulse-flow 2s linear infinite" }}
              />
              <polyline
                points={tracePath(t.points)}
                fill="none"
                stroke="oklch(0.85 0.16 80)"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            </g>
          ))}

        {/* Locked components */}
        {circuit.components
          .filter((c) => c.locked)
          .map((comp) => (
            <BoardComponent key={comp.id} kind={comp.kind} col={comp.col} row={comp.row} label={comp.label} lit={isLit} locked />
          ))}

        {/* Placed components */}
        {Object.entries(placedComponents).map(([instanceId, p]) => (
          <g
            key={instanceId}
            style={{ cursor: interactive ? "pointer" : "default" }}
            onClick={interactive ? () => onRemove(instanceId) : undefined}
            onDragStart={
              interactive
                ? (e: React.DragEvent<SVGGElement>) => {
                    const nativeEvent = e.nativeEvent as DragEvent;
                    if (nativeEvent.dataTransfer) {
                      nativeEvent.dataTransfer.setData("forge/kind", p.kind);
                      nativeEvent.dataTransfer.setData("forge/instanceId", instanceId);
                      nativeEvent.dataTransfer.effectAllowed = "move";
                    }
                  }
                : undefined
            }
          >
            <BoardComponent kind={p.kind} col={p.col} row={p.row} label="" lit={isLit} />
          </g>
        ))}
      </svg>

      {/* Component labels */}
      {circuit.components
        .filter((c) => c.locked)
        .map((comp) => {
          const { x, y } = cellToPx(comp.col, comp.row);
          return (
            <div
              key={`lbl-${comp.id}`}
              style={{
                position: "absolute",
                left: 16 + x,
                top: 16 + y + 28,
                transform: "translateX(-50%)",
                fontSize: 8,
                letterSpacing: "0.18em",
                color: isLit ? "oklch(0.55 0.09 75)" : "#6e5c3d",
                fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
                pointerEvents: "none",
              }}
            >
              {comp.label}
            </div>
          );
        })}
    </div>
  );
}
