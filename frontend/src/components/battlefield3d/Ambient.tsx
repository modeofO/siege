"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PALETTE, citadelPosition, gatePosition } from "./layout";
import { getSharedTextures } from "./textures";
import { MODIFIER_ACCENT } from "./pieces";

// The "always simmering" ambient layer for the candlelit war table. Everything
// here is idle motion driven off the single frame clock (state.clock) with zero
// per-frame allocation: scratch state lives in refs / useMemo'd typed arrays
// that are mutated in place, and nothing here calls setState. Composed by
// Battlefield3D. See the Shared Visual Language for coordinates and palette.

// Deterministic pseudo-random in [0, 1) from a seed (fract of sin), matching the
// codebase's Math.sin hashing (see jitter() in pieces.tsx). Pure, so it is safe
// inside useMemo under the react-compiler purity rules — unlike Math.random.
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// Candle: key light + emissive core + halo sprite + godray shaft
// ---------------------------------------------------------------------------

const CANDLE_BASE_INTENSITY = 3.4;
const CANDLE_POS: [number, number, number] = [3.5, 3, 2.5];
const HALO_BASE_OPACITY = 0.55;

/**
 * The warm key light plus its visible flame: an emissive core sphere, an
 * additive glow-sprite halo, and a faint tilted cone "light shaft" (godray).
 * A layered-sine flicker (±9%) drives the light intensity, the core emissive,
 * and the halo opacity together — a candle guttering, never a strobe.
 */
function Candle() {
  const light = useRef<THREE.PointLight>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const haloMat = useRef<THREE.SpriteMaterial>(null);
  const glow = getSharedTextures().glow;

  useFrame((state) => {
    // Three layered sines at incommensurate rates read as smooth flicker
    // noise; amplitudes sum to 1 so the total stays in [-1, 1].
    const t = state.clock.elapsedTime;
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.7) * 0.3 + Math.sin(t * 23.1) * 0.2;
    const f = 1 + 0.09 * n;
    if (light.current) light.current.intensity = CANDLE_BASE_INTENSITY * f;
    if (coreMat.current) coreMat.current.emissiveIntensity = 4 * f;
    if (haloMat.current) haloMat.current.opacity = HALO_BASE_OPACITY * (0.85 + 0.15 * n);
  });

  return (
    <>
      <pointLight
        ref={light}
        color={PALETTE.candle}
        intensity={CANDLE_BASE_INTENSITY}
        position={CANDLE_POS}
        // The design's light rig was tuned with no physical falloff
        // (PointLight decay 0); the default decay=2 makes 3.4 read flat.
        decay={0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
      />
      {/* Flame core — blooms via toneMapped:false */}
      <mesh position={CANDLE_POS}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial
          ref={coreMat}
          color="#ffd9a0"
          emissive="#ffbe6a"
          emissiveIntensity={4}
          toneMapped={false}
        />
      </mesh>
      {/* Halo sprite */}
      <sprite position={CANDLE_POS} scale={[2.6, 2.6, 1]}>
        <spriteMaterial
          ref={haloMat}
          map={glow}
          color={PALETTE.candle}
          transparent
          opacity={HALO_BASE_OPACITY}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {/* Faint downward light shaft (godray), tilted from the flame */}
      <mesh position={[CANDLE_POS[0] - 0.4, 1.5, CANDLE_POS[2] - 0.3]} rotation={[0, 0, 0.16]}>
        <coneGeometry args={[1.4, 3.2, 24, 1, true]} />
        <meshBasicMaterial
          color={PALETTE.candle}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dust motes
// ---------------------------------------------------------------------------

const DUST_COUNT = 130;
// Drifting volume over the table.
const DUST_X = [-4, 4] as const;
const DUST_Y = [0.4, 3.4] as const;
const DUST_Z = [-3, 3] as const;

// Each mote's x/z lane is a stable function of its index, so recycling returns
// it to the same lane it started in — no per-frame randomness needed.
function duLaneX(i: number): number {
  return DUST_X[0] + hash01(i * 3 + 0.1) * (DUST_X[1] - DUST_X[0]);
}
function duLaneZ(i: number): number {
  return DUST_Z[0] + hash01(i * 3 + 2.7) * (DUST_Z[1] - DUST_Z[0]);
}

/** ~130 additive motes drifting slowly upward through the candle light. */
function DustMotes() {
  const points = useRef<THREE.Points>(null);

  // Positions + per-mote velocities are allocated once and mutated in place.
  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    const velocities = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = duLaneX(i);
      positions[i * 3 + 1] = DUST_Y[0] + hash01(i * 3 + 1.3) * (DUST_Y[1] - DUST_Y[0]);
      positions[i * 3 + 2] = duLaneZ(i);
      velocities[i * 3] = (hash01(i * 5 + 0.5) - 0.5) * 0.04; // gentle x sway
      velocities[i * 3 + 1] = 0.03 + hash01(i * 5 + 1.9) * 0.05; // slow rise
      velocities[i * 3 + 2] = (hash01(i * 5 + 2.3) - 0.5) * 0.04; // gentle z sway
    }
    return { positions, velocities };
  }, []);

  useFrame((_, delta) => {
    const p = points.current;
    if (!p) return;
    const dt = Math.min(delta, 0.1);
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const ix = i * 3;
      arr[ix] += velocities[ix] * dt;
      arr[ix + 1] += velocities[ix + 1] * dt;
      arr[ix + 2] += velocities[ix + 2] * dt;
      // Recycle a mote to the floor of its lane once it drifts out the top or
      // strays past the horizontal bounds.
      if (arr[ix + 1] > DUST_Y[1] || arr[ix] < DUST_X[0] || arr[ix] > DUST_X[1] || arr[ix + 2] < DUST_Z[0] || arr[ix + 2] > DUST_Z[1]) {
        arr[ix] = duLaneX(i);
        arr[ix + 1] = DUST_Y[0];
        arr[ix + 2] = duLaneZ(i);
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={PALETTE.candle}
        size={0.025}
        sizeAttenuation
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Embers
// ---------------------------------------------------------------------------

const EMBER_COUNT = 70;
const EMBER_TOP_Y = 3.6;

/**
 * ~70 additive glow-sprite points rising from the candle and from any gate
 * carrying a glowing modifier accent. Each ember belongs to a fixed source
 * (round-robin) and respawns there when it drifts out the top.
 */
function Embers({ modifiers }: { modifiers: [number, number, number] }) {
  const points = useRef<THREE.Points>(null);
  const glow = getSharedTextures().glow;

  // Ember sources: the candle plus each modifier-accented gate.
  const sources = useMemo(() => {
    const out: Array<[number, number, number]> = [[CANDLE_POS[0], 0.2, CANDLE_POS[2]]];
    ([0, 1, 2] as const).forEach((g) => {
      if (MODIFIER_ACCENT[modifiers[g]]) {
        const [gx, , gz] = gatePosition(g);
        out.push([gx, 0.5, gz]);
      }
    });
    return out;
  }, [modifiers]);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(EMBER_COUNT * 3);
    const velocities = new Float32Array(EMBER_COUNT * 3);
    for (let i = 0; i < EMBER_COUNT; i++) {
      const s = sources[i % sources.length];
      positions[i * 3] = s[0] + (hash01(i + 0.1) - 0.5) * 0.5;
      positions[i * 3 + 1] = s[1] + hash01(i + 3.2) * 0.4;
      positions[i * 3 + 2] = s[2] + (hash01(i + 5.5) - 0.5) * 0.5;
      velocities[i * 3] = (hash01(i + 7) - 0.5) * 0.15;
      velocities[i * 3 + 1] = 0.35 + hash01(i + 9) * 0.5;
      velocities[i * 3 + 2] = (hash01(i + 11) - 0.5) * 0.15;
    }
    return { positions, velocities };
  }, [sources]);

  useFrame((state, delta) => {
    const p = points.current;
    if (!p) return;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const ix = i * 3;
      arr[ix] += velocities[ix] * dt + Math.sin(t * 2 + i) * 0.12 * dt;
      arr[ix + 1] += velocities[ix + 1] * dt;
      arr[ix + 2] += velocities[ix + 2] * dt;
      if (arr[ix + 1] > EMBER_TOP_Y) {
        const s = sources[i % sources.length];
        arr[ix] = s[0] + (hash01(i + 0.1) - 0.5) * 0.5;
        arr[ix + 1] = s[1] + hash01(i + 3.2) * 0.4;
        arr[ix + 2] = s[2] + (hash01(i + 5.5) - 0.5) * 0.5;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glow}
        color="#ff9a3c"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Vault smoke
// ---------------------------------------------------------------------------

type SmokeTier = "none" | "light" | "heavy";

/** HP thresholds match the citadel damage tiers in pieces.tsx. */
function smokeTier(hp: number): SmokeTier {
  if (hp >= 30) return "none";
  if (hp >= 12) return "light";
  return "heavy";
}

const SMOKE_BASE_Y = 1.3; // roughly the citadel roofline
const SMOKE_TOP_Y = 2.9;

/** A thin gray particle column rising above a damaged citadel. */
function SmokeColumn({ position, tier }: { position: [number, number, number]; tier: Exclude<SmokeTier, "none"> }) {
  const points = useRef<THREE.Points>(null);
  const count = tier === "heavy" ? 40 : 20;

  const { positions, riseSpeed } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const riseSpeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (hash01(i * 2 + 0.3) - 0.5) * 0.3;
      positions[i * 3 + 1] = SMOKE_BASE_Y + hash01(i * 2 + 1.7) * (SMOKE_TOP_Y - SMOKE_BASE_Y);
      positions[i * 3 + 2] = (hash01(i * 2 + 5.1) - 0.5) * 0.3;
      riseSpeed[i] = 0.18 + hash01(i * 2 + 9.4) * 0.16;
    }
    return { positions, riseSpeed };
  }, [count]);

  useFrame((state, delta) => {
    const p = points.current;
    if (!p) return;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      arr[ix + 1] += riseSpeed[i] * dt;
      // Gentle sideways curl that widens as the smoke rises.
      const rise = (arr[ix + 1] - SMOKE_BASE_Y) / (SMOKE_TOP_Y - SMOKE_BASE_Y);
      arr[ix] += Math.sin(t * 0.8 + i) * 0.015 * dt * (1 + rise);
      arr[ix + 2] += Math.cos(t * 0.7 + i) * 0.015 * dt * (1 + rise);
      if (arr[ix + 1] > SMOKE_TOP_Y) {
        arr[ix] = (hash01(i * 2 + 0.3) - 0.5) * 0.3;
        arr[ix + 1] = SMOKE_BASE_Y;
        arr[ix + 2] = (hash01(i * 2 + 5.1) - 0.5) * 0.3;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#6a6a6a"
        size={tier === "heavy" ? 0.06 : 0.05}
        sizeAttenuation
        transparent
        opacity={tier === "heavy" ? 0.28 : 0.2}
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Citadel banners
// ---------------------------------------------------------------------------

const BANNER_W = 0.58;
const BANNER_H = 0.4;
const BANNER_SEG_W = 12;
const BANNER_SEG_H = 8;
const MAST_H = 1.6;

/** A cloth banner on a mast beside a citadel, waved by a sine-driven free edge. */
function CitadelBanner({ position, color }: { position: [number, number, number]; color: string }) {
  const banner = useRef<THREE.Mesh>(null);

  // Cloth plane: translate so its left (mast) edge sits at local x = 0, then the
  // free right edge is what waves. Built once; disposed on unmount.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(BANNER_W, BANNER_H, BANNER_SEG_W, BANNER_SEG_H);
    g.translate(BANNER_W / 2, 0, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const b = banner.current;
    if (!b) return;
    const t = state.clock.elapsedTime;
    const attr = b.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      // Displacement grows with distance from the fixed mast edge, so the free
      // edge flutters while the attached edge stays pinned.
      const t0 = x / BANNER_W;
      const z = 0.08 * t0 * Math.sin(x * 7.0 - t * 4.0 + y * 3.0);
      attr.setZ(i, z);
    }
    attr.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/* Mast */}
      <mesh position={[0, MAST_H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, MAST_H, 8]} />
        <meshStandardMaterial color="#4a3b2a" roughness={0.85} />
      </mesh>
      {/* Cloth banner hanging from near the top of the mast */}
      <mesh ref={banner} geometry={geometry} position={[0.02, MAST_H - 0.38, 0]} castShadow>
        <meshStandardMaterial
          color={color}
          roughness={0.72}
          metalness={0.04}
          emissive={color}
          emissiveIntensity={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface AmbientProps {
  // Perspective-mapped vault HP: playerHp drives the +Z citadel's smoke, enemyHp
  // the −Z citadel's. Banners always fly regardless of HP.
  playerHp: number;
  enemyHp: number;
  // Round modifiers per gate — glowing gates become ember sources.
  modifiers: [number, number, number];
}

export default function Ambient({ playerHp, enemyHp, modifiers }: AmbientProps) {
  const playerTier = smokeTier(playerHp);
  const enemyTier = smokeTier(enemyHp);
  const [pcx, , pcz] = citadelPosition("player");
  const [ecx, , ecz] = citadelPosition("enemy");

  return (
    <>
      <Candle />
      <DustMotes />
      {/* Keyed by the modifier set: source layout changes rebuild the buffer. */}
      <Embers key={modifiers.join(",")} modifiers={modifiers} />

      {playerTier !== "none" ? <SmokeColumn position={[pcx, 0, pcz]} tier={playerTier} /> : null}
      {enemyTier !== "none" ? <SmokeColumn position={[ecx, 0, ecz]} tier={enemyTier} /> : null}

      {/* Banners flank each citadel to the left, both facing the camera. */}
      <CitadelBanner position={[pcx - 0.9, 0, pcz]} color={PALETTE.playerGold} />
      <CitadelBanner position={[ecx - 0.9, 0, ecz]} color={PALETTE.enemyCrimson} />
    </>
  );
}
