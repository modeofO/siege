// scripts/tiling-generator/generate.ts

const PI = Math.PI;

interface Tile {
  id: number;
  shape: 0 | 1; // 0=square, 1=rhombus
  vertices: [number, number][]; // 4 corners
  center: [number, number];
  sector: number; // 0-7
  zone: number;   // 0=core, 1=mid, 2=frontier
}

interface Edge {
  tileId: number;
  edgeIndex: number;
  neighborTileId: number;
}

// Generate the 8-pointed star seed from 8 rhombuses and surrounding squares
function generateSeed(radius: number): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;

  // Center: 8 rhombuses forming the inner star
  for (let i = 0; i < 8; i++) {
    const angle = (i * PI) / 4;
    const nextAngle = ((i + 1) * PI) / 4;
    const r = radius * 0.4;

    const p1: [number, number] = [r * Math.cos(angle), r * Math.sin(angle)];
    const p2: [number, number] = [r * Math.cos(nextAngle), r * Math.sin(nextAngle)];
    const p3: [number, number] = [p1[0] + p2[0], p1[1] + p2[1]];

    tiles.push({
      id: id++,
      shape: 1,
      vertices: [[0, 0], p1, p3, p2],
      center: [(p1[0] + p2[0] + p3[0]) / 4, (p1[1] + p2[1] + p3[1]) / 4],
      sector: i,
      zone: 0, // core
    });
  }

  // Outer ring: 8 squares filling between the star points
  for (let i = 0; i < 8; i++) {
    const angle = (i * PI) / 4 + PI / 8;
    const r = radius * 0.7;
    const size = radius * 0.25;

    const cx = r * Math.cos(angle);
    const cy = r * Math.sin(angle);
    const cos_a = Math.cos(angle);
    const sin_a = Math.sin(angle);

    tiles.push({
      id: id++,
      shape: 0,
      vertices: [
        [cx - size * cos_a - size * sin_a, cy - size * sin_a + size * cos_a],
        [cx + size * cos_a - size * sin_a, cy + size * sin_a + size * cos_a],
        [cx + size * cos_a + size * sin_a, cy + size * sin_a - size * cos_a],
        [cx - size * cos_a + size * sin_a, cy - size * sin_a - size * cos_a],
      ],
      center: [cx, cy],
      sector: i,
      zone: 1, // mid
    });
  }

  // Frontier ring 1 — 16 tiles (2 per sector)
  for (let i = 0; i < 16; i++) {
    const angle = (i * PI) / 8;
    const r = radius;
    const size = radius * 0.2;

    const cx = r * Math.cos(angle);
    const cy = r * Math.sin(angle);
    const sector = Math.floor(i / 2);

    tiles.push({
      id: id++,
      shape: i % 2 === 0 ? 0 : 1,
      vertices: [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size],
      ],
      center: [cx, cy],
      sector,
      zone: 2, // frontier
    });
  }

  // Frontier ring 2 — 8 more tiles (1 per sector, at wider radius)
  for (let i = 0; i < 8; i++) {
    const angle = (i * PI) / 4 + PI / 8;
    const r = radius * 1.2;
    const size = radius * 0.2;

    const cx = r * Math.cos(angle);
    const cy = r * Math.sin(angle);

    tiles.push({
      id: id++,
      shape: 0,
      vertices: [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size],
      ],
      center: [cx, cy],
      sector: i,
      zone: 2, // frontier
    });
  }

  return tiles;
}

// Compute adjacency from center-to-center distance (proximity-based)
function computeAdjacency(tiles: Tile[]): Edge[] {
  const edges: Edge[] = [];

  // Sort potential neighbors by distance for each tile
  for (let i = 0; i < tiles.length; i++) {
    const distances: { j: number; dist: number }[] = [];
    for (let j = 0; j < tiles.length; j++) {
      if (i === j) continue;
      const dx = tiles[i].center[0] - tiles[j].center[0];
      const dy = tiles[i].center[1] - tiles[j].center[1];
      distances.push({ j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    distances.sort((a, b) => a.dist - b.dist);

    // Take the 4 nearest neighbors (max edges per tile)
    const nearestCount = Math.min(4, distances.length);
    for (let k = 0; k < nearestCount; k++) {
      edges.push({
        tileId: i,
        edgeIndex: k,
        neighborTileId: distances[k].j,
      });
    }
  }

  return edges;
}

// Main
const tiles = generateSeed(200);
const adjacency = computeAdjacency(tiles);

const output = {
  tile_shapes: tiles.map((t) => t.shape),
  sector_ids: tiles.map((t) => t.sector),
  zones: tiles.map((t) => t.zone),
  adj_flat: adjacency.flatMap((e) => [e.tileId, e.edgeIndex, e.neighborTileId]),
  tile_count: tiles.length,
  adjacency_count: adjacency.length,
  // Include geometry for frontend rendering
  tiles: tiles.map((t) => ({
    id: t.id,
    shape: t.shape,
    center: t.center,
    vertices: t.vertices,
    sector: t.sector,
    zone: t.zone,
  })),
};

console.log(JSON.stringify(output, null, 2));
