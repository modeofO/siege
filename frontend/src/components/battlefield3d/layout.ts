// Pure layout math + palette for the war-table battlefield scene.
// These values are the shared visual language: later scene tasks (and their
// tests) import them, so the exact coordinates here are load-bearing.

export const PALETTE = {
  parchment: "#d8c9a3",
  wood: "#3a2b1c",
  pewter: "#8a8a92",
  playerGold: "#c8a44e",
  enemyCrimson: "#8e2f38",
  attack: "#ff8800",
  defense: "#6b8cae",
  repair: "#66cc66",
  trap: "#ff3344",
  holo: "#59d8e6",
  candle: "#ffb35c",
} as const;

type Vec3 = [number, number, number];

// Left→right gate x follows the 2D layout order East/Underground/West = data
// indices 0/2/1, so gate 0 is leftmost, gate 2 center, gate 1 rightmost.
export const GATE_X: Record<0 | 1 | 2, number> = { 0: -2.5, 2: 0, 1: 2.5 };

/** World position of a gate on the map plane (table surface y = 0). */
export function gatePosition(gate: 0 | 1 | 2): Vec3 {
  return [GATE_X[gate], 0, 0];
}

// Nodes form a vertical column on the right side of the paper, centered on the
// midline — gates and nodes are separate objectives and must not look attached.
export const NODE_POS: readonly Vec3[] = [
  [3.7, 0, -1.15],
  [3.7, 0, 0],
  [3.7, 0, 1.15],
];

/** Node marker `i` in the right-hand objective column. */
export function nodePosition(node: 0 | 1 | 2): Vec3 {
  return [...NODE_POS[node]];
}

/** Player citadel is on the +Z side, enemy on the −Z side. Pulled inward from
 * the original ±2.4 so the curtain-wall ring (half-extent 0.8) stays on the
 * 10×6 paper: 2.15 + 0.8 = 2.95 < 3. */
export function citadelPosition(side: "player" | "enemy"): Vec3 {
  return [0, 0, side === "player" ? 2.15 : -2.15];
}

const RANK_SIZE = 4;
const SPACING = 0.18;

/**
 * Distribute `n` pieces in ranks of 4, `spacing` apart, centered on the
 * anchor's x. Successive ranks step `spacing` AWAY from the anchor along the
 * facing direction: `facing` is the sign of the Z direction the formation
 * extends toward (+1 → +Z for player pieces, −1 → −Z for enemy pieces).
 * Rank 0 sits at the anchor's z; rank r sits at `anchor.z + facing * r * spacing`.
 * `spacing` defaults to 0.18; defensive shield-walls pass a tighter 0.14.
 * y is preserved from the anchor. n = 0 yields []. All slots are unique.
 */
export function formationSlots(anchor: Vec3, n: number, facing: 1 | -1, spacing: number = SPACING): Vec3[] {
  const [ax, ay, az] = anchor;
  const slots: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const rank = Math.floor(i / RANK_SIZE);
    const posInRank = i % RANK_SIZE;
    const rankCount = Math.min(RANK_SIZE, n - rank * RANK_SIZE);
    // Center this rank's members on the anchor x.
    const x = ax + (posInRank - (rankCount - 1) / 2) * spacing;
    const z = az + facing * rank * spacing;
    slots.push([x, ay, z]);
  }
  return slots;
}
