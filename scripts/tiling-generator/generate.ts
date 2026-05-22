const PI = Math.PI;

interface Tile {
  id: number;
  shape: 0 | 1; // 0=square, 1=rhombus
  vertices: [number, number][];
  center: [number, number];
  sector: number;
  zone: number; // 0=core, 1=mid, 2=frontier
}

interface Edge {
  tileId: number;
  edgeIndex: number;
  neighborTileId: number;
}

function centroid(verts: [number, number][]): [number, number] {
  const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  return [cx, cy];
}

function starPoint(i: number, s: number): [number, number] {
  const angle = (i % 8) * PI / 4;
  return [s * Math.cos(angle), s * Math.sin(angle)];
}

function generateSeed(s: number): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;

  // RING 0: 8 rhombuses forming the central star (zone=core)
  // Each rhombus has a 45° acute angle at the origin.
  // Adjacent rhombuses share edges along the star rays.
  const farVerts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const p1 = starPoint(i, s);
    const p2 = starPoint(i + 1, s);
    const far: [number, number] = [p1[0] + p2[0], p1[1] + p2[1]];
    farVerts.push(far);
    const verts: [number, number][] = [[0, 0], p1, far, p2];
    tiles.push({
      id: id++,
      shape: 1,
      vertices: verts,
      center: centroid(verts),
      sector: i,
      zone: 0,
    });
  }

  // RING 1: 8 squares filling the concavities between adjacent star rhombuses (zone=mid)
  // Square i sits between rhombus (i-1) and rhombus i, sharing edges with both.
  const oppVerts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const prev = (i + 7) % 8;
    const tip = starPoint(i, s);
    const farPrev = farVerts[prev];
    const farCurr = farVerts[i];
    const opp: [number, number] = [
      farPrev[0] + farCurr[0] - tip[0],
      farPrev[1] + farCurr[1] - tip[1],
    ];
    oppVerts.push(opp);
    const verts: [number, number][] = [tip, farPrev, opp, farCurr];
    tiles.push({
      id: id++,
      shape: 0,
      vertices: verts,
      center: centroid(verts),
      sector: i,
      zone: 1,
    });
  }

  // RING 2: 8 rhombuses at the far vertices (zone=frontier)
  // Each rhombus fills the 135° kink at far_i between two mid squares,
  // sharing edges with sq_i and sq_{i+1}.
  const dVerts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    const oppI = oppVerts[i];
    const farI = farVerts[i];
    const oppNext = oppVerts[next];
    const d: [number, number] = [
      oppI[0] + oppNext[0] - farI[0],
      oppI[1] + oppNext[1] - farI[1],
    ];
    dVerts.push(d);
    const verts: [number, number][] = [oppI, farI, oppNext, d];
    tiles.push({
      id: id++,
      shape: 1,
      vertices: verts,
      center: centroid(verts),
      sector: i,
      zone: 2,
    });
  }

  // RING 3: 16 squares on the outer boundary (zone=frontier)
  // After ring 2, the boundary has 16 edges of length s connecting
  // alternating D and opp vertices: D_i → opp_{i+1} → D_{i+1} → ...
  // Each boundary edge gets a square extending outward.
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    const outAngle = (i + 1) * PI / 4;
    const outDir: [number, number] = [s * Math.cos(outAngle), s * Math.sin(outAngle)];

    // Square A on edge D_i → opp_{next}
    const dI = dVerts[i];
    const oppNext = oppVerts[next];
    const vA3: [number, number] = [oppNext[0] + outDir[0], oppNext[1] + outDir[1]];
    const vA4: [number, number] = [dI[0] + outDir[0], dI[1] + outDir[1]];
    const vertsA: [number, number][] = [dI, oppNext, vA3, vA4];
    tiles.push({
      id: id++,
      shape: 0,
      vertices: vertsA,
      center: centroid(vertsA),
      sector: next,
      zone: 2,
    });

    // Square B on edge opp_{next} → D_{next}
    const dNext = dVerts[next];
    const vB3: [number, number] = [dNext[0] + outDir[0], dNext[1] + outDir[1]];
    const vB4: [number, number] = [oppNext[0] + outDir[0], oppNext[1] + outDir[1]]; // = vA3
    const vertsB: [number, number][] = [oppNext, dNext, vB3, vB4];
    tiles.push({
      id: id++,
      shape: 0,
      vertices: vertsB,
      center: centroid(vertsB),
      sector: next,
      zone: 2,
    });
  }

  return tiles;
}

// Compute adjacency: tiles sharing an edge (two vertices within tolerance)
function computeAdjacency(tiles: Tile[]): Edge[] {
  const EPS = 0.5;
  const edges: Edge[] = [];

  function vertexMatch(a: [number, number], b: [number, number]): boolean {
    return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
  }

  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      let sharedCount = 0;
      for (const vi of tiles[i].vertices) {
        for (const vj of tiles[j].vertices) {
          if (vertexMatch(vi, vj)) sharedCount++;
        }
      }
      if (sharedCount >= 2) {
        const edgeIdx_i = edges.filter((e) => e.tileId === i).length;
        const edgeIdx_j = edges.filter((e) => e.tileId === j).length;
        edges.push({ tileId: i, edgeIndex: edgeIdx_i, neighborTileId: j });
        edges.push({ tileId: j, edgeIndex: edgeIdx_j, neighborTileId: i });
      }
    }
  }

  return edges;
}

const tiles = generateSeed(80);
const adjacency = computeAdjacency(tiles);

const output = {
  tile_shapes: tiles.map((t) => t.shape),
  sector_ids: tiles.map((t) => t.sector),
  zones: tiles.map((t) => t.zone),
  adj_flat: adjacency.flatMap((e) => [e.tileId, e.edgeIndex, e.neighborTileId]),
  tile_count: tiles.length,
  adjacency_count: adjacency.length,
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
