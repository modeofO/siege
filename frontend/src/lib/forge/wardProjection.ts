import type { CircuitTrace } from "./circuits";

export interface WardTint {
  core: string;
  halo: string;
}

const PARCEL_TINTS: Record<number, WardTint> = {
  0: { core: "#daa520", halo: "#ff9500" },   // Forge — amber
  1: { core: "#7ab8e0", halo: "#4a8ab8" },   // Quarry — steel-blue
  2: { core: "#5ab87a", halo: "#2a8a4a" },   // Grove — emerald
};

const DEFAULT_TINT: WardTint = { core: "#daa520", halo: "#ff9500" };

// Circuit grid dimensions (cols 0–7, rows 0–5 in circuits.ts)
const GRID_COLS = 7;
const GRID_ROWS = 5;

export function getWardTint(parcelType: number): WardTint {
  return PARCEL_TINTS[parcelType] ?? DEFAULT_TINT;
}

export function projectToHex(
  col: number,
  row: number,
  cx: number,
  cy: number,
  hexSize: number,
): { x: number; y: number } {
  const inner = hexSize * 1.2;
  return {
    x: cx - inner / 2 + (col / GRID_COLS) * inner,
    y: cy - inner / 2 + (row / GRID_ROWS) * inner,
  };
}

export function projectToCircle(
  col: number,
  row: number,
  radius: number,
): { x: number; y: number } {
  const inner = radius * 1.4;
  return {
    x: -inner / 2 + (col / GRID_COLS) * inner,
    y: -inner / 2 + (row / GRID_ROWS) * inner,
  };
}

export function traceToHexPoints(
  trace: CircuitTrace,
  cx: number,
  cy: number,
  hexSize: number,
): string {
  return trace.points
    .map(([c, r]) => {
      const { x, y } = projectToHex(c, r, cx, cy, hexSize);
      return `${x},${y}`;
    })
    .join(" ");
}

export function traceToCirclePoints(
  trace: CircuitTrace,
  radius: number,
): string {
  return trace.points
    .map(([c, r]) => {
      const { x, y } = projectToCircle(c, r, radius);
      return `${x},${y}`;
    })
    .join(" ");
}
