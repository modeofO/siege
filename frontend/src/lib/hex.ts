// Hex adjacency helpers — TypeScript port of src/utils/hex.cairo.
// Even-row offset coordinates; neighbor set depends on row parity.

function abs(v: number): number {
  return v < 0 ? -v : v;
}

/**
 * Cube-coordinate distance between two offset-coordinate hex cells.
 * Mirrors hex_distance in src/utils/hex.cairo.
 */
export function hexDistance(col1: number, row1: number, col2: number, row2: number): number {
  const r1p = row1 % 2;
  const r2p = row2 % 2;
  const x1 = col1 - (row1 - r1p) / 2;
  const z1 = row1;
  const y1 = -x1 - z1;
  const x2 = col2 - (row2 - r2p) / 2;
  const z2 = row2;
  const y2 = -x2 - z2;
  return Math.max(abs(x1 - x2), abs(y1 - y2), abs(z1 - z2));
}

/** Two cells are neighbors iff distance is exactly 1. */
export function isNeighbor(col1: number, row1: number, col2: number, row2: number): boolean {
  return hexDistance(col1, row1, col2, row2) === 1;
}
