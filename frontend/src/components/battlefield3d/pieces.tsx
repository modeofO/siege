"use client";

import { createRef, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { NodeOwner } from "@/lib/gameState1v1";
import { PALETTE } from "./layout";
import { getSharedTextures } from "./textures";
import { VARIANT_TOKENS, type BattlefieldVariant } from "./variants";

// Procedural "carved miniature" pieces for the candlelit war table (design 1a).
// No external assets — geometry is three.js primitives, surfaces use the shared
// procedural stone textures. All solid pieces cast and receive shadows so they
// throw silhouettes across the parchment under the candle key light.

const CHARCOAL = new THREE.Color("#2a2622");
// Textured stone materials tint via color multiply: body stone is untinted
// (white) so the texture reads true; base/trim courses are dimmed warm gray.
const BODY_TINT = new THREE.Color("#ffffff");
const BASE_TINT = new THREE.Color("#8f8676");

/** Stable pseudo-random in [-1, 1] from an integer index (for damage tilt). */
function jitter(i: number): number {
  return (Math.sin(i * 127.1 + 0.5) * 43758.5453) % 1;
}

/** Shared stone-textured material set for one citadel or gate. */
function useStoneMaterials(seed: number) {
  const materials = useMemo(() => {
    const { stone1, stone2 } = getSharedTextures();
    const stone = seed % 2 ? stone2 : stone1;
    const body = new THREE.MeshStandardMaterial({
      map: stone.map,
      bumpMap: stone.bump,
      bumpScale: 0.35,
      color: BODY_TINT.clone(),
      roughness: 0.88,
      metalness: 0.02,
    });
    const base = new THREE.MeshStandardMaterial({
      map: stone.map,
      color: BASE_TINT.clone(),
      roughness: 0.95,
      metalness: 0.02,
    });
    return { body, base };
  }, [seed]);
  useEffect(() => {
    return () => {
      materials.body.dispose();
      materials.base.dispose();
    };
  }, [materials]);
  return materials;
}

// ---------------------------------------------------------------------------
// Citadel
// ---------------------------------------------------------------------------

type CitadelTier = "intact" | "cracked" | "crumbling";

function citadelTier(hp: number): CitadelTier {
  if (hp >= 30) return "intact";
  if (hp >= 12) return "cracked";
  return "crumbling";
}

export interface CitadelPieceProps {
  side: "player" | "enemy";
  hp: number;
  position: [number, number, number];
  // Optional shared display-HP ref (written by ResolutionPlayer every frame).
  // When provided, a useFrame reads it and applies tier visuals (merlon tilt +
  // stone darkening) imperatively the moment the ticking HP crosses 30 / 12 —
  // no setState, no re-render. Without it the piece stays purely prop-driven.
  hpRef?: React.RefObject<number>;
  // Persistent battle wear (0–1) derived from cumulative damage across the whole
  // round history (see aftermath.ts). Composes ON TOP of the live HP tier: it
  // darkens the stone further and survives reloads, unlike the transient HP
  // tier which tracks the current vault. Applied by multiplying into the tier's
  // absolute color set so the two darkening sources never fight.
  wear?: number;
  // Art direction: only the window-slit emissive differs between variants.
  variant?: BattlefieldVariant;
}

/** Apply one tier's damage visuals in place: merlon tilt + stone darkening. */
function applyCitadelTier(
  tier: CitadelTier,
  wear: number,
  merlonRefs: Array<React.RefObject<THREE.Mesh | null>>,
  bodyMat: THREE.MeshStandardMaterial,
  baseMat: THREE.MeshStandardMaterial,
): void {
  // Damage: crenellation tilt magnitude + how much the stone is dimmed.
  const tilt = tier === "intact" ? 0 : tier === "cracked" ? 0.14 : 0.34;
  const dim = tier === "intact" ? 0 : tier === "cracked" ? 0.18 : 0.42;
  // Start from the tier's absolute stone tint, then lerp further toward
  // charcoal by `wear`. Recomputing from the base each call keeps this
  // idempotent, so the prop path and the ref path can both reapply freely.
  const w = THREE.MathUtils.clamp(wear, 0, 1);
  bodyMat.color.copy(BODY_TINT).lerp(CHARCOAL, dim).lerp(CHARCOAL, w);
  baseMat.color.copy(BASE_TINT).lerp(CHARCOAL, dim).lerp(CHARCOAL, w);
  for (let i = 0; i < merlonRefs.length; i++) {
    const m = merlonRefs[i].current;
    if (m) m.rotation.set(jitter(i) * tilt, jitter(i * 7) * tilt, jitter(i * 13) * tilt);
  }
}

// Curtain wall ring around the keep. Back wall reaches |citadel z| + R =
// 2.15 + 0.8 = 2.95 < 3, so it stays on the 10×6 paper — keep this constraint
// if either value changes.
const WALL_R = 0.8; // half-extent of the ring
const WALL_T = 0.1; // wall thickness
const WALL_H = 0.34; // wall height
const GATE_GAP_HALF = 0.34; // front opening half-width

interface BoxSpec {
  size: [number, number, number];
  pos: [number, number, number];
}

/** Crenellated wall segment: the wall slab plus every-other merlon cap. */
function wallSegment(
  cx: number,
  cz: number,
  dir: "x" | "z",
  segCenter: number,
  segLen: number,
): { slab: BoxSpec; caps: BoxSpec[] } {
  const slab: BoxSpec = {
    size: dir === "x" ? [segLen, WALL_H, WALL_T] : [WALL_T, WALL_H, segLen],
    pos: dir === "x" ? [segCenter, WALL_H / 2 + 0.02, cz] : [cx, WALL_H / 2 + 0.02, segCenter],
  };
  const caps: BoxSpec[] = [];
  const n = Math.max(2, Math.round(segLen / 0.16));
  for (let i = 0; i < n; i++) {
    if (i % 2) continue;
    const off = -segLen / 2 + (i + 0.5) * (segLen / n);
    caps.push({
      size: dir === "x" ? [(segLen / n) * 0.7, 0.1, 0.09] : [0.09, 0.1, (segLen / n) * 0.7],
      pos:
        dir === "x"
          ? [segCenter + off, WALL_H + 0.07, cz]
          : [cx, WALL_H + 0.07, segCenter + off],
    });
  }
  return { slab, caps };
}

/** The four wall runs: back/left/right solid, front split around the gate gap. */
function curtainWallSegments(): Array<{ slab: BoxSpec; caps: BoxSpec[] }> {
  const span = WALL_R * 2;
  const segs: Array<{ slab: BoxSpec; caps: BoxSpec[] }> = [];
  // Back wall (+Z local, behind the keep) — solid.
  segs.push(wallSegment(0, WALL_R, "x", 0, span));
  // Front wall (−Z local, faces board center) — gate opening in the middle.
  const side = (span - GATE_GAP_HALF * 2) / 2;
  segs.push(wallSegment(0, -WALL_R, "x", -(GATE_GAP_HALF + side / 2), side));
  segs.push(wallSegment(0, -WALL_R, "x", GATE_GAP_HALF + side / 2, side));
  // Left / right walls — solid.
  segs.push(wallSegment(-WALL_R, 0, "z", 0, span));
  segs.push(wallSegment(WALL_R, 0, "z", 0, span));
  return segs;
}

// Wall-top merlon grid (half-width 0.44), 4 per edge = 16.
function keepMerlons(): Array<[number, number]> {
  const h = 0.44;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < 4; k++) {
    const t = -h + (k / 3) * (2 * h);
    pts.push([t, h], [t, -h], [h, t], [-h, t]);
  }
  return pts;
}

/**
 * A carved keep on a stepped plinth: battered walls with a trim course and
 * crenellations, four corner towers with battlement rings and trim-cone roofs,
 * a central keep tower, a dark gatehouse arch, emissive window slits (bloom),
 * and a crenellated curtain-wall ring with corner bastions and gate posts.
 * HP tiers drive battle damage: intact (≥30) stands square; cracked (≥12)
 * tilts its crenellations and dims; crumbling (<12) tilts further and darkens.
 * Tier visuals are applied imperatively (shared materials + merlon rotation)
 * so the optional `hpRef` ticker can drive them mid-playback without re-rendering.
 */
export function CitadelPiece({ side, hp, position, hpRef, wear = 0, variant = "warm" }: CitadelPieceProps) {
  const trim = side === "player" ? PALETTE.playerGold : PALETTE.enemyCrimson;
  const { body: bodyMat, base: baseMat } = useStoneMaterials(side === "player" ? 0 : 1);
  const tokens = VARIANT_TOKENS[variant];

  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, metalness: 0.45 }),
    [trim],
  );
  // Emissive window slits — toneMapped:false so bloom picks them up.
  const windowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a1206",
        emissive: tokens.windowEmissive,
        emissiveIntensity: tokens.windowIntensity,
        toneMapped: false,
      }),
    [tokens],
  );
  const gatehouseMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#120c08", roughness: 1 }),
    [],
  );
  useEffect(() => {
    return () => {
      trimMat.dispose();
      windowMat.dispose();
      gatehouseMat.dispose();
    };
  }, [trimMat, windowMat, gatehouseMat]);

  const merlons = useMemo(() => keepMerlons(), []);
  const merlonRefs = useMemo(() => merlons.map(() => createRef<THREE.Mesh>()), [merlons]);
  const walls = useMemo(() => curtainWallSegments(), []);

  // Last tier whose visuals were applied — shared by the prop path (layout
  // effect) and the ref path (useFrame) so they never fight.
  const appliedTier = useRef<CitadelTier | null>(null);

  // Prop-driven baseline: applied before paint whenever the hp prop's tier
  // changes (the only driver when no hpRef is passed).
  const propTier = citadelTier(hp);
  useLayoutEffect(() => {
    applyCitadelTier(propTier, wear, merlonRefs, bodyMat, baseMat);
    appliedTier.current = propTier;
  }, [propTier, wear, merlonRefs, bodyMat, baseMat]);

  // Ref-driven ticker: retier the piece the moment the shared displayed HP
  // crosses 30 / 12 during resolution playback. Tier-change guarded, so the
  // per-frame cost is one citadelTier call — zero allocations.
  useFrame(() => {
    if (!hpRef) return;
    const tier = citadelTier(hpRef.current);
    if (tier === appliedTier.current) return;
    // useFrame refreshes this closure each render, so `wear` is the latest prop.
    applyCitadelTier(tier, wear, merlonRefs, bodyMat, baseMat);
    appliedTier.current = tier;
  });

  // Local −Z faces the board center: player keep is unrotated, enemy spun 180°.
  const faceRotation = side === "player" ? 0 : Math.PI;

  return (
    <group position={position} rotation={[0, faceRotation, 0]}>
      {/* Stepped plinth */}
      <mesh position={[0, 0.08, 0]} material={baseMat} castShadow receiveShadow>
        <boxGeometry args={[1.16, 0.16, 1.16]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={baseMat} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.12, 1.0]} />
      </mesh>

      {/* Battered walls */}
      <mesh position={[0, 0.56, 0]} material={bodyMat} castShadow receiveShadow>
        <boxGeometry args={[0.88, 0.66, 0.88]} />
      </mesh>

      {/* Upper trim course */}
      <mesh position={[0, 0.93, 0]} material={baseMat} castShadow receiveShadow>
        <boxGeometry args={[0.94, 0.08, 0.94]} />
      </mesh>

      {/* Crenellations (merlons) — rotation applied imperatively per tier */}
      {merlons.map(([x, z], i) => (
        <mesh key={i} ref={merlonRefs[i]} position={[x, 1.05, z]} material={bodyMat} castShadow>
          <boxGeometry args={[0.12, 0.16, 0.12]} />
        </mesh>
      ))}

      {/* Corner towers: battlement ring + trim-cone roof */}
      {[
        [0.46, 0.46],
        [0.46, -0.46],
        [-0.46, 0.46],
        [-0.46, -0.46],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.62, 0]} material={bodyMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.98, 16]} />
          </mesh>
          <mesh position={[0, 1.09, 0]} rotation={[-Math.PI / 2, 0, 0]} material={baseMat} castShadow>
            <torusGeometry args={[0.145, 0.02, 8, 20]} />
          </mesh>
          <mesh position={[0, 1.28, 0]} material={trimMat} castShadow>
            <coneGeometry args={[0.2, 0.32, 16]} />
          </mesh>
        </group>
      ))}

      {/* Central keep tower + tall trim cone */}
      <mesh position={[0, 1.18, 0]} material={bodyMat} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.23, 0.56, 18]} />
      </mesh>
      <mesh position={[0, 1.66, 0]} material={trimMat} castShadow>
        <coneGeometry args={[0.28, 0.4, 18]} />
      </mesh>

      {/* Dark gatehouse arch on the center-facing wall */}
      <mesh position={[0, 0.42, -0.45]} material={gatehouseMat}>
        <boxGeometry args={[0.34, 0.4, 0.06]} />
      </mesh>

      {/* Emissive window slits → bloom */}
      {(
        [
          [-0.2, 0.62, 0.451],
          [0.2, 0.62, 0.451],
          [0, 1.2, 0.205],
          [0, 1.2, -0.205],
        ] as const
      ).map(([wx, wy, wz], i) => (
        <mesh key={i} position={[wx, wy, wz]} material={windowMat}>
          <boxGeometry args={[0.06, 0.12, 0.02]} />
        </mesh>
      ))}

      {/* Curtain wall ring: crenellated segments (front gap faces the center) */}
      {walls.map(({ slab, caps }, i) => (
        <group key={i}>
          <mesh position={slab.pos} material={baseMat} castShadow receiveShadow>
            <boxGeometry args={slab.size} />
          </mesh>
          {caps.map((cap, j) => (
            <mesh key={j} position={cap.pos} material={bodyMat} castShadow>
              <boxGeometry args={cap.size} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Corner bastions: tower + ring + trim cap */}
      {[
        [WALL_R, WALL_R],
        [WALL_R, -WALL_R],
        [-WALL_R, WALL_R],
        [-WALL_R, -WALL_R],
      ].map(([bx, bz], i) => (
        <group key={i} position={[bx, 0, bz]}>
          <mesh position={[0, (WALL_H + 0.16) / 2 + 0.02, 0]} material={bodyMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.13, 0.15, WALL_H + 0.16, 14]} />
          </mesh>
          <mesh position={[0, WALL_H + 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={baseMat} castShadow>
            <torusGeometry args={[0.13, 0.018, 8, 18]} />
          </mesh>
          <mesh position={[0, WALL_H + 0.28, 0]} material={trimMat} castShadow>
            <coneGeometry args={[0.17, 0.2, 14]} />
          </mesh>
        </group>
      ))}

      {/* Gate posts flanking the wall opening */}
      {[-GATE_GAP_HALF, GATE_GAP_HALF].map((gx) => (
        <mesh
          key={gx}
          position={[gx, (WALL_H + 0.14) / 2 + 0.02, -WALL_R]}
          material={bodyMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.14, WALL_H + 0.14, 0.16]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

// Accent colors per gate modifier — kept in sync with ModifierCards.tsx (the
// DOM cards below the battlefield carry names/descriptions; the gate glows
// the matching color so players can pair card to gate spatially).
export const MODIFIER_ACCENT: Record<number, string> = {
  1: "#daa520", // Narrow Pass
  2: "#c8a44e", // Mirror Gate
  3: "#ff3344", // Deadlock
  4: "#ff8800", // Reflection
};

export interface GatePieceProps {
  gate: 0 | 1 | 2;
  modifier: number;
  scorch: number; // 0–1, lerps material toward charcoal
  position: [number, number, number];
}

/**
 * A gate: two stone piers on footings carrying a lintel crowned by a 9-stone
 * voussoir arch. `scorch` (0–1) darkens the stone toward charcoal. When
 * `modifier` is 1–4 the lintel carries a glowing accent bar in the modifier's
 * color plus an additive glow sprite — the matching ModifierCards entry (DOM,
 * below the battlefield) explains it.
 */
export function GatePiece({ gate, modifier, scorch, position }: GatePieceProps) {
  const { body: stoneMat } = useStoneMaterials(gate + 5);
  const glow = getSharedTextures().glow;

  // Scorch tints the shared-texture material's color multiply toward charcoal.
  useLayoutEffect(() => {
    stoneMat.color.copy(BODY_TINT).lerp(CHARCOAL, THREE.MathUtils.clamp(scorch, 0, 1));
  }, [stoneMat, scorch]);

  // Voussoir arch stones: 9 boxes fanned over the lintel.
  const voussoirs = useMemo(() => {
    const out: Array<{ pos: [number, number, number]; rotZ: number }> = [];
    for (let a = 0; a <= 8; a++) {
      const ang = Math.PI * (a / 8);
      const r = 0.28;
      out.push({
        pos: [Math.cos(ang) * r, 0.7 + Math.sin(ang) * r * 0.6, 0],
        rotZ: -ang + Math.PI / 2,
      });
    }
    return out;
  }, []);

  const accent = MODIFIER_ACCENT[modifier];

  return (
    <group position={position}>
      {/* Piers + footings */}
      {[-0.36, 0.36].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.29, 0]} material={stoneMat} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.58, 0.2]} />
          </mesh>
          <mesh position={[x, 0.02, 0]} material={stoneMat} castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.06, 0.26]} />
          </mesh>
        </group>
      ))}

      {/* Lintel spanning the piers */}
      <mesh position={[0, 0.63, 0]} material={stoneMat} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.14, 0.22]} />
      </mesh>

      {/* Voussoir arch stones */}
      {voussoirs.map(({ pos, rotZ }, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, rotZ]} material={stoneMat} castShadow receiveShadow>
          <boxGeometry args={[0.1, 0.12, 0.22]} />
        </mesh>
      ))}

      {/* Modifier accent: emissive bar across the lintel + additive glow
          sprite. Color pairs with the DOM modifier card for this gate. */}
      {accent ? (
        <>
          <mesh position={[0, 0.63, 0.115]}>
            <boxGeometry args={[0.98, 0.06, 0.02]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
          <sprite position={[0, 0.62, 0.05]} scale={[1.6, 1.0, 1]}>
            <spriteMaterial
              map={glow}
              color={accent}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </>
      ) : null}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Node marker
// ---------------------------------------------------------------------------

export interface NodeMarkerProps {
  node: 0 | 1 | 2;
  // Perspective-adjusted upstream: teamA = player (gold), teamB = enemy
  // (crimson), neutral = pewter.
  owner: NodeOwner;
  trapped: boolean;
  position: [number, number, number];
}

/**
 * A carved obelisk marking a resource node: pewter base, 4-sided tapered shaft
 * and cone cap tinted by owner (teamA gold, teamB crimson, neutral pewter).
 * `trapped` (only ever the player's own node) adds a pulsing emissive rune ring.
 */
export function NodeMarker({ owner, trapped, position }: NodeMarkerProps) {
  const tint =
    owner === "teamA" ? PALETTE.playerGold : owner === "teamB" ? PALETTE.enemyCrimson : PALETTE.pewter;

  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const m = ringMat.current;
    if (!m) return;
    // Pulse 0.7 → 1.2, matching the design's rune-ring breathing.
    m.emissiveIntensity = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3));
  });

  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.06, 0.18]} />
        <meshStandardMaterial color="#6f6a5e" roughness={0.9} />
      </mesh>

      {/* Tapered obelisk shaft (4-sided) */}
      <mesh position={[0, 0.21, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.045, 0.09, 0.3, 4]} />
        <meshStandardMaterial color={tint} roughness={0.5} metalness={0.45} />
      </mesh>

      {/* Pyramid cap */}
      <mesh position={[0, 0.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.06, 0.1, 4]} />
        <meshStandardMaterial color={tint} roughness={0.5} metalness={0.45} />
      </mesh>

      {/* Trap rune ring — pulsing emissive */}
      {trapped ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.14, 0.017, 8, 40]} />
          <meshStandardMaterial
            ref={ringMat}
            color={PALETTE.trap}
            emissive={PALETTE.trap}
            emissiveIntensity={1.0}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
