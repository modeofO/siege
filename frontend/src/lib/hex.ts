// TS port of src/utils/hex.cairo (even-row offset). Assumes non-negative ints (Cairo u16).

export type Coord = { col: number; row: number };

export function hexDistance(a: Coord, b: Coord): number {
  const r1p = a.row % 2;
  const r2p = b.row % 2;
  const x1 = a.col - (a.row - r1p) / 2;
  const z1 = a.row;
  const y1 = -x1 - z1;
  const x2 = b.col - (b.row - r2p) / 2;
  const z2 = b.row;
  const y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

export function isNeighbor(a: Coord, b: Coord): boolean {
  return hexDistance(a, b) === 1;
}
