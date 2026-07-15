// Procedural canvas textures for the candlelit war table. No external assets:
// stone, wood, and parchment are painted onto 2D canvases at runtime and
// wrapped in CanvasTextures. Deterministic (mulberry32-seeded) so every mount
// paints the identical map. Client-only — call these from inside the r3f tree
// (Canvas children never render on the server).
//
// Textures are shared module-level singletons: the scene mounts/unmounts with
// the Canvas epoch (context-loss recovery remounts everything), and repainting
// ~30k canvas ops per remount is wasted work. CanvasTextures survive context
// loss (three re-uploads them), so we intentionally never dispose them.

import * as THREE from "three";
import { PALETTE, NODE_POS, GATE_X, citadelPosition } from "./layout";

/** Deterministic PRNG (mulberry32) — stable textures across mounts. */
function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Color texture: sRGB, repeat-wrapped, anisotropic. */
function colorTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Data texture (bump): linear, repeat-wrapped. */
function bumpTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export interface TexturePair {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

// ---------------------------------------------------------------------------
// Stone
// ---------------------------------------------------------------------------

/** Warm carved stone: mottled grain + cracks. Bump shares the seed so relief matches. */
export function makeStone(seed: number): TexturePair {
  const W = 512;
  const H = 512;
  const col = mkCanvas(W, H);
  const bmp = mkCanvas(W, H);
  const cx = col.getContext("2d")!;
  const bx = bmp.getContext("2d")!;
  cx.fillStyle = "#a89f8c";
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "#808080";
  bx.fillRect(0, 0, W, H);
  const rnd = mulberry(seed);
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 2 + rnd() * 14;
    const l = (rnd() - 0.5) * 70;
    cx.fillStyle = `rgba(${168 + l},${159 + l},${140 + l},0.10)`;
    cx.beginPath();
    cx.arc(x, y, r, 0, 7);
    cx.fill();
    const g = 128 + l * 1.4;
    bx.fillStyle = `rgba(${g},${g},${g},0.10)`;
    bx.beginPath();
    bx.arc(x, y, r, 0, 7);
    bx.fill();
  }
  // Cracks
  for (let i = 0; i < 30; i++) {
    cx.strokeStyle = "rgba(40,32,26,0.30)";
    bx.strokeStyle = "rgba(40,40,40,0.5)";
    cx.lineWidth = bx.lineWidth = 0.6 + rnd() * 1.4;
    let x = rnd() * W;
    let y = rnd() * H;
    cx.beginPath();
    bx.beginPath();
    cx.moveTo(x, y);
    bx.moveTo(x, y);
    const steps = 4 + ((rnd() * 6) | 0);
    for (let s = 0; s < steps; s++) {
      x += (rnd() - 0.5) * 90;
      y += (rnd() - 0.5) * 90;
      cx.lineTo(x, y);
      bx.lineTo(x, y);
    }
    cx.stroke();
    bx.stroke();
  }
  return { map: colorTex(col), bump: bumpTex(bmp) };
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

/** Dark oak: grain streaks + plank seams. */
export function makeWood(): TexturePair {
  const W = 1024;
  const H = 512;
  const col = mkCanvas(W, H);
  const bmp = mkCanvas(W, H);
  const cx = col.getContext("2d")!;
  const bx = bmp.getContext("2d")!;
  cx.fillStyle = PALETTE.wood;
  cx.fillRect(0, 0, W, H);
  bx.fillStyle = "#888";
  bx.fillRect(0, 0, W, H);
  const rnd = mulberry(7);
  // Grain streaks
  for (let i = 0; i < 2600; i++) {
    const y = rnd() * H;
    const x = rnd() * W;
    const len = 40 + rnd() * 260;
    const th = 0.5 + rnd() * 2;
    const l = (rnd() - 0.5) * 34;
    cx.strokeStyle = `rgba(${58 + l},${43 + l},${28 + l},0.5)`;
    cx.lineWidth = th;
    cx.beginPath();
    cx.moveTo(x, y);
    cx.lineTo(x + len, y + (rnd() - 0.5) * 5);
    cx.stroke();
  }
  // Plank seams
  const planks = 6;
  for (let p = 1; p < planks; p++) {
    const y = (p / planks) * H;
    cx.fillStyle = "rgba(10,6,3,0.9)";
    cx.fillRect(0, y - 1.5, W, 3);
    bx.fillStyle = "rgba(30,30,30,1)";
    bx.fillRect(0, y - 2, W, 4);
  }
  return { map: colorTex(col), bump: bumpTex(bmp) };
}

// ---------------------------------------------------------------------------
// Parchment + inked cartography
// ---------------------------------------------------------------------------

/**
 * Aged paper with inked map markings: terrain in the open left half + far
 * corners, dashed supply routes citadel→gate, glyph rings at gates and nodes,
 * compass rose, faint SIEGE title, edge-burn vignette. The bump map carries the
 * fiber weave so the paper catches candlelight.
 */
export function makeParchment(ink: boolean): TexturePair {
  const W = 1024;
  const H = 614;
  const c = mkCanvas(W, H);
  const x = c.getContext("2d")!;
  x.fillStyle = PALETTE.parchment;
  x.fillRect(0, 0, W, H);
  const rnd = mulberry(21);
  // Large mottled tonal blotches (uneven aging)
  for (let i = 0; i < 70; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    const r = 60 + rnd() * 220;
    const warmer = rnd() > 0.5;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, warmer ? "rgba(150,120,72,0.06)" : "rgba(214,201,168,0.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  // Dense fiber grain
  for (let i = 0; i < 26000; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    const l = (rnd() - 0.5) * 40;
    x.fillStyle = `rgba(${196 + l},${180 + l},${144 + l},0.06)`;
    x.fillRect(px, py, 1.3, 1.3);
  }
  // Directional fiber strands (cross-hatch weave)
  for (let i = 0; i < 1400; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    const l = (rnd() - 0.5) * 44;
    const horiz = rnd() > 0.5;
    const len = 6 + rnd() * 26;
    x.strokeStyle = `rgba(${188 + l},${172 + l},${136 + l},0.14)`;
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (horiz ? len : rnd() * 2), py + (horiz ? rnd() * 2 : len));
    x.stroke();
  }
  // Dark flecks
  for (let i = 0; i < 900; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    x.fillStyle = `rgba(74,52,26,${0.05 + rnd() * 0.18})`;
    x.beginPath();
    x.arc(px, py, 0.4 + rnd() * 1.1, 0, 7);
    x.fill();
  }
  // Stains
  for (let i = 0; i < 44; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    const r = 20 + rnd() * 110;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = rnd() > 0.4;
    g.addColorStop(0, dark ? "rgba(110,80,42,0.12)" : "rgba(90,64,32,0.08)");
    g.addColorStop(0.7, dark ? "rgba(110,80,42,0.04)" : "rgba(90,64,32,0.02)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  // Faint fold/crease lines
  for (let i = 0; i < 5; i++) {
    const vert = rnd() > 0.5;
    const p = (0.2 + rnd() * 0.6) * (vert ? W : H);
    x.strokeStyle = "rgba(70,48,24,0.10)";
    x.lineWidth = 1 + rnd();
    x.beginPath();
    if (vert) {
      x.moveTo(p, 0);
      x.lineTo(p + (rnd() - 0.5) * 30, H);
    } else {
      x.moveTo(0, p);
      x.lineTo(W, p + (rnd() - 0.5) * 30);
    }
    x.stroke();
  }
  // Long worn streaks (rubbed/scuffed wear lines)
  for (let i = 0; i < 60; i++) {
    const horiz = rnd() > 0.35;
    const px = rnd() * W;
    const py = rnd() * H;
    const len = 60 + rnd() * 300;
    const drift = (rnd() - 0.5) * 40;
    const light = rnd() > 0.5;
    x.strokeStyle = light
      ? `rgba(226,214,182,${0.05 + rnd() * 0.1})`
      : `rgba(96,70,38,${0.04 + rnd() * 0.09})`;
    x.lineWidth = 0.6 + rnd() * 2.2;
    x.beginPath();
    if (horiz) {
      x.moveTo(px, py);
      x.bezierCurveTo(px + len * 0.33, py + drift * 0.3, px + len * 0.66, py + drift * 0.7, px + len, py + drift);
    } else {
      x.moveTo(px, py);
      x.bezierCurveTo(px + drift * 0.3, py + len * 0.33, px + drift * 0.7, py + len * 0.66, px + drift, py + len);
    }
    x.stroke();
  }
  // Scuffed abrasion patches (thin scratchy streaks in clusters)
  for (let c2 = 0; c2 < 14; c2++) {
    const cxp = rnd() * W;
    const cyp = rnd() * H;
    const ang = rnd() * Math.PI;
    for (let s = 0; s < 8; s++) {
      const off = (s - 4) * 3;
      const len = 18 + rnd() * 50;
      const sx = cxp + Math.cos(ang + Math.PI / 2) * off;
      const sy = cyp + Math.sin(ang + Math.PI / 2) * off;
      x.strokeStyle = `rgba(210,196,162,${0.04 + rnd() * 0.07})`;
      x.lineWidth = 0.5 + rnd();
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      x.stroke();
    }
  }
  // World XZ → canvas px (map plane is 10×6 world units)
  const toPx = (wx: number, wz: number): [number, number] => [((wx / 10) + 0.5) * W, (0.5 - wz / 6) * H];
  if (ink) {
    const INK = (a: number) => `rgba(74,52,24,${a})`;
    // Forest patch: cluster of scalloped tree canopies
    const forest = (fx: number, fy: number, rw: number, rh: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const px = fx + (rnd() - 0.5) * rw;
        const py = fy + (rnd() - 0.5) * rh;
        const s = 3 + rnd() * 3;
        x.strokeStyle = INK(0.34);
        x.lineWidth = 1;
        x.beginPath();
        for (let a = 0; a < 5; a++) x.arc(px, py - s * 0.2, s, Math.PI * (a / 5), Math.PI * ((a + 1) / 5), false);
        x.stroke();
        x.strokeStyle = INK(0.3);
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px, py + s * 0.9);
        x.stroke();
      }
    };
    // Mountain range: caret glyphs with hachure-shaded right flank
    const mountains = (mx: number, my: number, spread: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const px = mx + (rnd() - 0.5) * spread;
        const py = my + (rnd() - 0.5) * spread * 0.4;
        const w = 14 + rnd() * 16;
        const h = 10 + rnd() * 14;
        x.strokeStyle = INK(0.42);
        x.lineWidth = 1.3;
        x.beginPath();
        x.moveTo(px - w, py);
        x.lineTo(px, py - h);
        x.lineTo(px + w, py);
        x.stroke();
        x.strokeStyle = INK(0.2);
        x.lineWidth = 0.7;
        for (let k = 1; k < 5; k++) {
          const t = k / 5;
          x.beginPath();
          x.moveTo(px + w * t * 0.5, py - h * (1 - t));
          x.lineTo(px + w * t, py);
          x.stroke();
        }
      }
    };
    // Rolling hills: little humps
    const hills = (hx: number, hy: number, rw: number, rh: number, count: number) => {
      x.strokeStyle = INK(0.28);
      x.lineWidth = 1;
      for (let i = 0; i < count; i++) {
        const px = hx + (rnd() - 0.5) * rw;
        const py = hy + (rnd() - 0.5) * rh;
        const s = 8 + rnd() * 10;
        x.beginPath();
        x.arc(px, py, s, Math.PI * 1.05, Math.PI * 1.95);
        x.stroke();
      }
    };
    // Marsh: reed tufts + short dashes
    const marsh = (mx: number, my: number, rw: number, rh: number, count: number) => {
      x.strokeStyle = INK(0.24);
      x.lineWidth = 0.9;
      for (let i = 0; i < count; i++) {
        const px = mx + (rnd() - 0.5) * rw;
        const py = my + (rnd() - 0.5) * rh;
        x.beginPath();
        x.moveTo(px - 4, py);
        x.lineTo(px + 4, py);
        x.stroke();
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px - 2, py - 4);
        x.moveTo(px, py);
        x.lineTo(px + 2, py - 4);
        x.stroke();
      }
    };

    // Terrain in the open left half + far corners, clear of play zones.
    // (The design's river helper is intentionally not rendered.)
    forest(200, 150, 150, 90, 60); // upper-left woods
    forest(170, 470, 140, 100, 55); // lower-left woods
    forest(760, 120, 120, 70, 34); // upper-right grove (above node column)
    mountains(150, 300, 150, 9); // left-edge range
    mountains(880, 520, 120, 6); // lower-right range
    hills(370, 210, 110, 70, 10);
    hills(340, 430, 120, 70, 10);
    marsh(470, 480, 120, 60, 40); // marsh below center

    // Dashed supply routes from each citadel to each gate
    const [, , pcz] = citadelPosition("player");
    const [, , ecz] = citadelPosition("enemy");
    x.strokeStyle = "rgba(74,52,24,0.5)";
    x.lineWidth = 2;
    x.setLineDash([8, 7]);
    const drawRoute = (fromZ: number, gx: number) => {
      const a = toPx(0, fromZ);
      const b = toPx(gx, 0);
      x.beginPath();
      x.moveTo(a[0], a[1]);
      x.quadraticCurveTo((a[0] + b[0]) / 2 + (rnd() - 0.5) * 40, (a[1] + b[1]) / 2, b[0], b[1]);
      x.stroke();
    };
    ([0, 1, 2] as const).forEach((g) => {
      drawRoute(pcz, GATE_X[g]);
      drawRoute(ecz, GATE_X[g]);
    });
    x.setLineDash([]);
    // Gate + node glyph rings
    x.strokeStyle = "rgba(74,52,24,0.55)";
    x.lineWidth = 1.6;
    ([0, 1, 2] as const).forEach((g) => {
      const p = toPx(GATE_X[g], 0);
      x.beginPath();
      x.arc(p[0], p[1], 26, 0, 7);
      x.stroke();
    });
    NODE_POS.forEach((np) => {
      const n = toPx(np[0], np[2]);
      x.beginPath();
      x.arc(n[0], n[1], 14, 0, 7);
      x.stroke();
    });
    // Compass rose bottom-left
    const cxp = 92;
    const cyp = H - 92;
    const R = 46;
    x.strokeStyle = "rgba(74,52,24,0.6)";
    x.lineWidth = 1.4;
    x.beginPath();
    x.arc(cxp, cyp, R, 0, 7);
    x.stroke();
    x.beginPath();
    x.moveTo(cxp, cyp - R);
    x.lineTo(cxp + 10, cyp);
    x.lineTo(cxp, cyp + R);
    x.lineTo(cxp - 10, cyp);
    x.closePath();
    x.moveTo(cxp - R, cyp);
    x.lineTo(cxp, cyp - 10);
    x.lineTo(cxp + R, cyp);
    x.lineTo(cxp, cyp + 10);
    x.closePath();
    x.fillStyle = "rgba(74,52,24,0.30)";
    x.fill();
    x.stroke();
    // Faint title
    x.fillStyle = "rgba(74,52,24,0.28)";
    x.font = "700 46px Cinzel, serif";
    x.textAlign = "center";
    x.fillText("SIEGE", W / 2, 66);
  }
  // Edge-burn vignette + scorched corners
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, "rgba(60,38,16,0)");
  vg.addColorStop(1, "rgba(30,18,8,0.62)");
  x.fillStyle = vg;
  x.fillRect(0, 0, W, H);
  for (const [cxp, cyp] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    const g = x.createRadialGradient(cxp, cyp, 0, cxp, cyp, 150);
    g.addColorStop(0, "rgba(18,10,4,0.7)");
    g.addColorStop(1, "rgba(18,10,4,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  // Bump map: fiber weave + speckle relief so the paper catches candlelight
  const bmp = mkCanvas(W, H);
  const bx = bmp.getContext("2d")!;
  bx.fillStyle = "#808080";
  bx.fillRect(0, 0, W, H);
  const rnd2 = mulberry(53);
  for (let i = 0; i < 22000; i++) {
    const px = rnd2() * W;
    const py = rnd2() * H;
    const g = 128 + (rnd2() - 0.5) * 90;
    bx.fillStyle = `rgba(${g},${g},${g},0.10)`;
    bx.fillRect(px, py, 1.4, 1.4);
  }
  for (let i = 0; i < 1400; i++) {
    const px = rnd2() * W;
    const py = rnd2() * H;
    const horiz = rnd2() > 0.5;
    const len = 6 + rnd2() * 26;
    const g = 128 + (rnd2() - 0.5) * 110;
    bx.strokeStyle = `rgba(${g},${g},${g},0.35)`;
    bx.lineWidth = 0.7;
    bx.beginPath();
    bx.moveTo(px, py);
    bx.lineTo(px + (horiz ? len : 0), py + (horiz ? 0 : len));
    bx.stroke();
  }
  return { map: colorTex(c), bump: bumpTex(bmp) };
}

// ---------------------------------------------------------------------------
// Holo map overlay (variant 1b)
// ---------------------------------------------------------------------------

/**
 * Teal holographic map: hex grid, straight supply routes, glowing rings at
 * gates and nodes, border ticks. Drawn as an additive overlay plane above the
 * (un-inked) paper in the holo variant. Linear data texture.
 */
export function makeHolo(): THREE.CanvasTexture {
  const W = 1024;
  const H = 614;
  const c = mkCanvas(W, H);
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, W, H);
  const toPx = (wx: number, wz: number): [number, number] => [((wx / 10) + 0.5) * W, (0.5 - wz / 6) * H];
  // Hex grid
  x.strokeStyle = "rgba(89,216,230,0.16)";
  x.lineWidth = 1;
  const s = 34;
  const hh = s * Math.sin(Math.PI / 3);
  for (let row = 0; row * hh < H + s; row++) {
    for (let col = -1; col * s * 1.5 < W + s; col++) {
      const ox = col * s * 1.5;
      const oy = row * 2 * hh + (col % 2 ? hh : 0);
      x.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a;
        const px = ox + s * Math.cos(ang);
        const py = oy + s * Math.sin(ang);
        if (a === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.stroke();
    }
  }
  // Straight routes citadel → gate
  const [, , pcz] = citadelPosition("player");
  const [, , ecz] = citadelPosition("enemy");
  x.strokeStyle = "rgba(120,236,246,0.5)";
  x.lineWidth = 1.6;
  ([0, 1, 2] as const).forEach((g) => {
    [pcz, ecz].forEach((fz) => {
      const a = toPx(0, fz);
      const b = toPx(GATE_X[g], 0);
      x.beginPath();
      x.moveTo(a[0], a[1]);
      x.lineTo(b[0], b[1]);
      x.stroke();
    });
  });
  // Glowing rings at gates
  ([0, 1, 2] as const).forEach((g) => {
    const p = toPx(GATE_X[g], 0);
    for (let r = 10; r < 30; r += 8) {
      x.strokeStyle = `rgba(140,240,250,${0.4 - r / 120})`;
      x.lineWidth = 1.4;
      x.beginPath();
      x.arc(p[0], p[1], r, 0, 7);
      x.stroke();
    }
  });
  // Glowing rings at nodes
  NODE_POS.forEach((np) => {
    const p = toPx(np[0], np[2]);
    for (let r = 8; r < 26; r += 7) {
      x.strokeStyle = `rgba(150,244,252,${0.45 - r / 100})`;
      x.lineWidth = 1.4;
      x.beginPath();
      x.arc(p[0], p[1], r, 0, 7);
      x.stroke();
    }
  });
  // Border ticks
  x.strokeStyle = "rgba(89,216,230,0.4)";
  x.lineWidth = 2;
  x.strokeRect(8, 8, W - 16, H - 16);
  return bumpTex(c);
}

// ---------------------------------------------------------------------------
// Glow sprite
// ---------------------------------------------------------------------------

/** Radial white glow, used by halo/accent sprites and ember points. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const c = mkCanvas(128, 128);
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Shared singletons
// ---------------------------------------------------------------------------

interface SharedTextures {
  stone1: TexturePair;
  stone2: TexturePair;
  wood: TexturePair;
  parchment: TexturePair;
  glow: THREE.CanvasTexture;
}

let shared: SharedTextures | null = null;

/** Lazily paint the full texture set once per page lifetime. */
export function getSharedTextures(): SharedTextures {
  if (!shared) {
    const wood = makeWood();
    wood.map.repeat.set(2, 1.4);
    wood.bump.repeat.set(2, 1.4);
    shared = {
      stone1: makeStone(3),
      stone2: makeStone(11),
      wood,
      parchment: makeParchment(true),
      glow: makeGlowTexture(),
    };
  }
  return shared;
}

// Holo-variant textures, painted only if the player ever switches to holo.
let plainParchment: TexturePair | null = null;
let holoOverlay: THREE.CanvasTexture | null = null;

/** Un-inked paper for the holo variant (cartography comes from the overlay). */
export function getPlainParchment(): TexturePair {
  if (!plainParchment) plainParchment = makeParchment(false);
  return plainParchment;
}

/** The teal holographic map-grid overlay texture. */
export function getHoloTexture(): THREE.CanvasTexture {
  if (!holoOverlay) holoOverlay = makeHolo();
  return holoOverlay;
}
