"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PALETTE, citadelPosition } from "./layout";

// The "always simmering" ambient layer for the war table. Everything here is
// idle motion driven off the single frame clock (state.clock) with zero
// per-frame allocation: scratch state lives in refs / useMemo'd typed arrays
// that are mutated in place, and nothing here calls setState. Composed by
// Battlefield3D. See the Shared Visual Language for coordinates and palette.

// ---------------------------------------------------------------------------
// Candle light flicker
// ---------------------------------------------------------------------------

// The warm key light (moved here from Battlefield3D, Task 2 parameters kept)
// whose intensity flickers ±8% around this base via smoothed layered-sine
// noise — a candle guttering, never a strobe.
const CANDLE_BASE_INTENSITY = 2.2;

/** Warm candle key light with a smoothed ±8% intensity flicker. */
function CandleLight() {
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    // Three layered sines at incommensurate rates read as smooth flicker
    // noise; amplitudes sum to 1 so the total stays in [-1, 1].
    const t = state.clock.elapsedTime;
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.7) * 0.3 + Math.sin(t * 23.1) * 0.2;
    l.intensity = CANDLE_BASE_INTENSITY * (1 + 0.08 * n);
  });

  return (
    <pointLight
      ref={light}
      color={PALETTE.candle}
      intensity={CANDLE_BASE_INTENSITY}
      position={[3.5, 3, 2.5]}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-bias={-0.0005}
    />
  );
}

// ---------------------------------------------------------------------------
// Dust motes
// ---------------------------------------------------------------------------

const DUST_COUNT = 120;
// Drifting volume over the table.
const DUST_X = [-4, 4] as const;
const DUST_Y = [0.4, 3.2] as const;
const DUST_Z = [-3, 3] as const;

// Deterministic pseudo-random in [0, 1) from a seed (fract of sin), matching the
// codebase's Math.sin hashing (see jitter() in pieces.tsx). Pure, so it is safe
// inside useMemo under the react-compiler purity rules — unlike Math.random.
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Each mote's x/z lane is a stable function of its index, so recycling returns
// it to the same lane it started in — no per-frame randomness needed.
function duLaneX(i: number): number {
  return DUST_X[0] + hash01(i * 3 + 0.1) * (DUST_X[1] - DUST_X[0]);
}
function duLaneZ(i: number): number {
  return DUST_Z[0] + hash01(i * 3 + 2.7) * (DUST_Z[1] - DUST_Z[0]);
}

/** ~120 additive motes drifting slowly upward through the candle light. */
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
        size={0.02}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Holo shimmer
// ---------------------------------------------------------------------------

const HOLO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ~10-line scanline: a faint scrolling horizontal band over the parchment.
const HOLO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float scan = sin(vUv.y * 90.0 - uTime * 2.0) * 0.5 + 0.5;
    float alpha = uOpacity * (0.35 + 0.65 * scan);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/** A shimmer plane 0.02u above the parchment with a slow-scrolling scanline. */
function HoloShimmer() {
  const material = useRef<THREE.ShaderMaterial>(null);
  // Stable uniforms object; uTime.value is advanced each frame via the ref.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.holo) },
      uOpacity: { value: 0.05 },
    }),
    [],
  );

  useFrame((state) => {
    const m = material.current;
    if (m) m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <planeGeometry args={[10, 6]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={HOLO_VERT}
        fragmentShader={HOLO_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
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

const BANNER_W = 0.55;
const BANNER_H = 0.38;
const BANNER_SEG_W = 8;
const BANNER_SEG_H = 6;
const MAST_H = 1.5;

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
      const z = 0.07 * t0 * Math.sin(x * 7.0 - t * 4.0 + y * 3.0);
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
      <mesh ref={banner} geometry={geometry} position={[0.02, MAST_H - 0.35, 0]}>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} side={THREE.DoubleSide} />
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
}

export default function Ambient({ playerHp, enemyHp }: AmbientProps) {
  const playerTier = smokeTier(playerHp);
  const enemyTier = smokeTier(enemyHp);
  const [pcx, , pcz] = citadelPosition("player");
  const [ecx, , ecz] = citadelPosition("enemy");

  return (
    <>
      <CandleLight />
      <DustMotes />
      <HoloShimmer />

      {playerTier !== "none" ? <SmokeColumn position={[pcx, 0, pcz]} tier={playerTier} /> : null}
      {enemyTier !== "none" ? <SmokeColumn position={[ecx, 0, ecz]} tier={enemyTier} /> : null}

      {/* Banners flank each citadel to the left, both facing the camera. */}
      <CitadelBanner position={[pcx - 0.85, 0, pcz]} color={PALETTE.playerGold} />
      <CitadelBanner position={[ecx - 0.85, 0, ecz]} color={PALETTE.enemyCrimson} />
    </>
  );
}
