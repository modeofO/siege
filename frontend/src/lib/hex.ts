// TS port of src/utils/hex.cairo (even-row offset). Assumes non-negative ints (Cairo u16).

export function hexDistance(col1: number, row1: number, col2: number, row2: number): number {
  const r1p = row1 % 2;
  const r2p = row2 % 2;
  const x1 = col1 - (row1 - r1p) / 2;
  const z1 = row1;
  const y1 = -x1 - z1;
  const x2 = col2 - (row2 - r2p) / 2;
  const z2 = row2;
  const y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

export function isNeighbor(col1: number, row1: number, col2: number, row2: number): boolean {
  return hexDistance(col1, row1, col2, row2) === 1;
}
