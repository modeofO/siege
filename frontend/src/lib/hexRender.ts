// Shared hex-grid geometry and parcel-type styling for the world map (HexGrid)
// and the claim picker (ClaimParcelMap). Keep the math in one place.

export const HEX_SIZE = 36;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Odd-row offset layout.
export function hexToPixel(col: number, row: number): { x: number; y: number } {
  const x = col * HEX_WIDTH + (row % 2 === 1 ? HEX_WIDTH / 2 : 0);
  const y = row * (HEX_HEIGHT * 0.75);
  return { x, y };
}

export function hexPoints(cx: number, cy: number, size = HEX_SIZE): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + 30);
    const px = cx + size * Math.cos(angle);
    const py = cy + size * Math.sin(angle);
    points.push(`${px},${py}`);
  }
  return points.join(" ");
}

export const PARCEL_TYPE_COLORS: Record<number, string> = {
  0: "#b87333", // Forge — copper
  1: "#8a8a9a", // Quarry — grey
  2: "#4a7c59", // Grove — green
  255: "#4a4a4a", // Untyped — neutral dark grey
};

export const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
  255: "Untyped",
};
