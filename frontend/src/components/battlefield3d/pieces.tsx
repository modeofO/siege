"use client";

import { createRef, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { NodeOwner } from "@/lib/gameState1v1";
import { PALETTE } from "./layout";

// Procedural "carved miniature" pieces for the war table. No external assets —
// everything is built from primitives. All pieces castShadow so they throw
// silhouettes across the parchment under the candle key light. Sizes follow the
// Shared Visual Language: citadels ~1.2u, gates ~0.7u, node markers ~0.35u, so
// each reads clearly from the fixed camera at (0, 6.5, 5.2).

const CHARCOAL = new THREE.Color("#2a2622");
const STONE = "#a89f8c"; // warm carved-stone base
const STONE_DARK = "#6f6a5e"; // shaded stone for cornices / bases
// Pre-parsed Color constants so tier changes never re-parse hex strings.
const STONE_COLOR = new THREE.Color(STONE);
const STONE_DARK_COLOR = new THREE.Color(STONE_DARK);

/** Base stone color lerped toward charcoal by `amount` (0–1). */
function scorchedStone(baseHex: string, amount: number): THREE.Color {
  return new THREE.Color(baseHex).lerp(CHARCOAL, THREE.MathUtils.clamp(amount, 0, 1));
}

/** Stable pseudo-random in [-1, 1] from an integer index (for damage tilt). */
function jitter(i: number): number {
  return (Math.sin(i * 127.1 + 0.5) * 43758.5453) % 1;
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
}

/** Apply one tier's damage visuals in place: merlon tilt + stone darkening. */
function applyCitadelTier(
  tier: CitadelTier,
  merlonRefs: Array<React.RefObject<THREE.Mesh | null>>,
  bodyMat: THREE.MeshStandardMaterial,
  baseMat: THREE.MeshStandardMaterial,
): void {
  // Damage: crenellation tilt magnitude + how much the stone is dimmed.
  const tilt = tier === "intact" ? 0 : tier === "cracked" ? 0.14 : 0.34;
  const dim = tier === "intact" ? 0 : tier === "cracked" ? 0.18 : 0.42;
  bodyMat.color.copy(STONE_COLOR).lerp(CHARCOAL, dim);
  baseMat.color.copy(STONE_DARK_COLOR).lerp(CHARCOAL, dim);
  for (let i = 0; i < merlonRefs.length; i++) {
    const m = merlonRefs[i].current;
    if (m) m.rotation.set(jitter(i) * tilt, jitter(i * 7) * tilt, jitter(i * 13) * tilt);
  }
}

/**
 * A carved keep: plinth, crenellated walls, four corner towers with conical
 * roofs, a central tower flying a side banner. HP tiers drive battle damage:
 * intact (≥30) stands square; cracked (≥12) tilts its crenellations and dims;
 * crumbling (<12) tilts them further and darkens the stone. Side trim (roofs,
 * banner) is tinted playerGold / enemyCrimson. Tier visuals are applied
 * imperatively (shared materials + merlon rotation) so the optional `hpRef`
 * ticker can drive them mid-playback without re-rendering.
 */
export function CitadelPiece({ side, hp, position, hpRef }: CitadelPieceProps) {
  const trim = side === "player" ? PALETTE.playerGold : PALETTE.enemyCrimson;

  // Shared stone materials, mutated in place on tier changes.
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9 }), []);
  const baseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.95 }), []);
  useEffect(() => {
    return () => {
      bodyMat.dispose();
      baseMat.dispose();
    };
  }, [bodyMat, baseMat]);

  // Merlons around the square wall top (half-width 0.4), 4 per edge.
  const merlons = useMemo(() => {
    const h = 0.4;
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 4; k++) {
      const t = -h + (k / 3) * (2 * h);
      pts.push([t, h], [t, -h], [h, t], [-h, t]);
    }
    return pts;
  }, []);
  const merlonRefs = useMemo(() => merlons.map(() => createRef<THREE.Mesh>()), [merlons]);

  // Last tier whose visuals were applied — shared by the prop path (layout
  // effect) and the ref path (useFrame) so they never fight.
  const appliedTier = useRef<CitadelTier | null>(null);

  // Prop-driven baseline: applied before paint whenever the hp prop's tier
  // changes (the only driver when no hpRef is passed).
  const propTier = citadelTier(hp);
  useLayoutEffect(() => {
    applyCitadelTier(propTier, merlonRefs, bodyMat, baseMat);
    appliedTier.current = propTier;
  }, [propTier, merlonRefs, bodyMat, baseMat]);

  // Ref-driven ticker: retier the piece the moment the shared displayed HP
  // crosses 30 / 12 during resolution playback. Tier-change guarded, so the
  // per-frame cost is one citadelTier call — zero allocations.
  useFrame(() => {
    if (!hpRef) return;
    const tier = citadelTier(hpRef.current);
    if (tier === appliedTier.current) return;
    applyCitadelTier(tier, merlonRefs, bodyMat, baseMat);
    appliedTier.current = tier;
  });

  // Enemy keep faces the center so its banner reads from across the table.
  const faceRotation = side === "player" ? 0 : Math.PI;

  return (
    <group position={position} rotation={[0, faceRotation, 0]}>
      {/* Plinth */}
      <mesh position={[0, 0.1, 0]} material={baseMat} castShadow receiveShadow>
        <boxGeometry args={[1.02, 0.2, 1.02]} />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 0.53, 0]} material={bodyMat} castShadow receiveShadow>
        <boxGeometry args={[0.86, 0.66, 0.86]} />
      </mesh>

      {/* Crenellations (merlons) — rotation applied imperatively per tier */}
      {merlons.map(([x, z], i) => (
        <mesh key={i} ref={merlonRefs[i]} position={[x, 0.95, z]} material={bodyMat} castShadow>
          <boxGeometry args={[0.13, 0.18, 0.13]} />
        </mesh>
      ))}

      {/* Corner towers with conical roofs */}
      {[
        [0.43, 0.43],
        [0.43, -0.43],
        [-0.43, 0.43],
        [-0.43, -0.43],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.62, 0]} material={bodyMat} castShadow receiveShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.85, 12]} />
          </mesh>
          <mesh position={[0, 1.13, 0]} castShadow>
            <coneGeometry args={[0.17, 0.2, 12]} />
            <meshStandardMaterial color={trim} roughness={0.55} metalness={0.25} />
          </mesh>
        </group>
      ))}

      {/* Central keep tower */}
      <mesh position={[0, 1.02, 0]} material={bodyMat} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.19, 0.34, 14]} />
      </mesh>

      {/* Flag pole + side banner atop the central tower */}
      <mesh position={[0, 1.32, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.28, 6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0.09, 1.36, 0]} castShadow>
        <boxGeometry args={[0.16, 0.11, 0.01]} />
        <meshStandardMaterial color={trim} roughness={0.5} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

// Reuse the 2D view's modifier labels — glyph is the initial letter.
const MODIFIER_GLYPH: Record<number, string> = {
  1: "N", // Narrow Pass
  2: "M", // Mirror
  3: "D", // Deadlock
  4: "R", // Reflection
};

export interface GatePieceProps {
  gate: 0 | 1 | 2;
  modifier: number;
  scorch: number; // 0–1, lerps material toward charcoal
  position: [number, number, number];
}

/**
 * A gate: two stone pillars carrying a lintel with a rounded arch keystone.
 * `scorch` (0–1) darkens the stone toward charcoal. When `modifier` is 1–4 a
 * small holo glyph (drei <Text>, PALETTE.holo) floats above showing the
 * modifier's initial letter.
 */
export function GatePiece({ modifier, scorch, position }: GatePieceProps) {
  const stone = useMemo(() => scorchedStone(STONE, scorch), [scorch]);
  const glyph = MODIFIER_GLYPH[modifier];

  return (
    <group position={position}>
      {/* Pillars */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.17, 0.56, 0.18]} />
          <meshStandardMaterial color={stone} roughness={0.9} />
        </mesh>
      ))}

      {/* Lintel spanning the pillars */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.13, 0.2]} />
        <meshStandardMaterial color={stone} roughness={0.9} />
      </mesh>

      {/* Rounded arch keystone crowning the lintel */}
      <mesh position={[0, 0.69, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.2, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={stone} roughness={0.85} />
      </mesh>

      {/* Holographic modifier glyph */}
      {glyph ? (
        <Text
          position={[0, 1.05, 0]}
          fontSize={0.34}
          color={PALETTE.holo}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#0a2a30"
          material-toneMapped={false}
          material-transparent
          material-opacity={0.92}
        >
          {glyph}
        </Text>
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
 * A carved obelisk marking a resource node. Owner tints the stone: teamA gold,
 * teamB crimson, neutral pewter. `trapped` (only ever the player's own node)
 * adds a small glowing red rune ring around the base.
 */
export function NodeMarker({ owner, trapped, position }: NodeMarkerProps) {
  const tint =
    owner === "teamA" ? PALETTE.playerGold : owner === "teamB" ? PALETTE.enemyCrimson : PALETTE.pewter;

  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.17, 0.06, 0.17]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.9} />
      </mesh>

      {/* Tapered obelisk shaft (4-sided) */}
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.045, 0.085, 0.28, 4]} />
        <meshStandardMaterial color={tint} roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Pyramid cap */}
      <mesh position={[0, 0.38, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.06, 0.09, 4]} />
        <meshStandardMaterial color={tint} roughness={0.5} metalness={0.35} />
      </mesh>

      {/* Trap rune ring */}
      {trapped ? (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.13, 0.016, 8, 32]} />
          <meshStandardMaterial
            color={PALETTE.trap}
            emissive={PALETTE.trap}
            emissiveIntensity={0.8}
            roughness={0.5}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
