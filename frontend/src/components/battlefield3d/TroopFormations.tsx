"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Cylinder } from "@react-three/drei";
import { PALETTE, citadelPosition, formationSlots, gatePosition, nodePosition } from "./layout";

// Troop pieces are carved "pawns" — a pewter cylinder body capped by a cone
// tinted with the owner's faction band (playerGold / enemyCrimson) or, for a
// repair cluster, repair-green. Pawns are drawn with two InstancedMesh buffers
// (one for bodies, one for caps) sharing a per-instance transform: the vertical
// stack is baked into each geometry so a single matrix places both. Pieces lerp
// out from the citadel to their formation slot as allocations rise and retreat
// back home as they fall — all in useFrame via refs, never setState. Total
// pawn height ≈0.30u, matching the Shared Visual Language (~0.28u).

// ---------------------------------------------------------------------------
// Allocation → formation groups
// ---------------------------------------------------------------------------
// Allocation array layout: [p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, trap0,trap1,trap2]
//   0-2  attack per gate      3-5  defense per gate
//   6    repair               7-9  node contest
//   10-12 traps (NEVER rendered as pieces — they are secret)

type Group =
  | { kind: "attack" | "defense"; gate: 0 | 1 | 2; allocIdx: number }
  | { kind: "node"; node: 0 | 1 | 2; allocIdx: number }
  | { kind: "repair"; allocIdx: number };

const GROUPS: Group[] = [
  { kind: "attack", gate: 0, allocIdx: 0 },
  { kind: "attack", gate: 1, allocIdx: 1 },
  { kind: "attack", gate: 2, allocIdx: 2 },
  { kind: "defense", gate: 0, allocIdx: 3 },
  { kind: "defense", gate: 1, allocIdx: 4 },
  { kind: "defense", gate: 2, allocIdx: 5 },
  { kind: "node", node: 0, allocIdx: 7 },
  { kind: "node", node: 1, allocIdx: 8 },
  { kind: "node", node: 2, allocIdx: 9 },
  { kind: "repair", allocIdx: 6 },
];

// Instances reserved per group. Fixed ranges keep an instance bound to the same
// group across allocation changes, so a rising count spawns fresh pieces at the
// citadel while the standing ones hold their slots (no reshuffle churn).
const CAP = 17;
const CAPACITY = GROUPS.length * CAP;

/** Anchor for a group in world space. `sign` is +1 for player (+Z), -1 for enemy. */
function groupAnchor(g: Group, sign: number): [number, number, number] {
  switch (g.kind) {
    case "attack":
      // Massed 0.55u in front of the gate on the owner's side.
      return [gatePosition(g.gate)[0], 0, sign * 0.55];
    case "defense":
      // Tight shield-wall 0.35u behind the gate on the owner's side.
      return [gatePosition(g.gate)[0], 0, sign * 0.35];
    case "node": {
      // Beside the node marker, offset to the owner's flank so both sides fit.
      const [nx, , nz] = nodePosition(g.node);
      return [nx + (sign > 0 ? -0.35 : 0.35), 0, nz];
    }
    case "repair":
      // Clustered just in front of the owner's citadel base.
      return [0, 0, sign * 2.0];
  }
}

/** Defensive shield-walls pack tighter (0.14u) than the 0.18u default. */
function groupSpacing(g: Group): number {
  return g.kind === "defense" ? 0.14 : 0.18;
}

/** Cap band color: repair clusters are green, otherwise the faction color. */
function capColor(g: Group, side: "player" | "enemy"): string {
  if (g.kind === "repair") return PALETTE.repair;
  return side === "player" ? PALETTE.playerGold : PALETTE.enemyCrimson;
}

// Reusable pawn geometry dimensions (body + cap baked to stand on y = 0).
function makeBodyGeometry(): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10);
  g.translate(0, 0.08, 0);
  return g;
}
function makeCapGeometry(): THREE.ConeGeometry {
  const g = new THREE.ConeGeometry(0.075, 0.14, 10);
  g.translate(0, 0.23, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Cloaked enemy: presence without information
// ---------------------------------------------------------------------------

/** Three shrouded, semi-transparent pawns at the enemy citadel — no faction info. */
function GhostPawns({ side }: { side: "player" | "enemy" }) {
  const sign = side === "player" ? 1 : -1;
  const slots = useMemo(() => formationSlots([0, 0, sign * 2.0], 3, sign as 1 | -1), [sign]);
  return (
    <group>
      {slots.map((s, i) => (
        <group key={i} position={s}>
          <mesh position={[0, 0.08, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 0.16, 10]} />
            <meshStandardMaterial color={PALETTE.pewter} roughness={0.6} transparent opacity={0.35} />
          </mesh>
          <mesh position={[0, 0.23, 0]} castShadow>
            <coneGeometry args={[0.075, 0.14, 10]} />
            <meshStandardMaterial color={PALETTE.pewter} roughness={0.5} transparent opacity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Live formations bound to allocations
// ---------------------------------------------------------------------------

function RealFormations({
  side,
  allocations,
  committed,
}: {
  side: "player" | "enemy";
  allocations: number[];
  committed: boolean;
}) {
  const sign = side === "player" ? 1 : -1;

  const bodies = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const sealRef = useRef<THREE.Mesh>(null);
  const sealStart = useRef<number | null>(null);

  const bodyGeo = useMemo(() => makeBodyGeometry(), []);
  const capGeo = useMemo(() => makeCapGeometry(), []);
  useEffect(() => {
    return () => {
      bodyGeo.dispose();
      capGeo.dispose();
    };
  }, [bodyGeo, capGeo]);

  // Scratch objects reused every frame — never allocate inside useFrame.
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const spawn = useMemo(() => {
    const [cx, cy, cz] = citadelPosition(side);
    return new THREE.Vector3(cx, cy, cz);
  }, [side]);
  // Persistent per-instance positions; all pieces start hidden at the citadel.
  const current = useMemo(
    () => Array.from({ length: CAPACITY }, () => spawn.clone()),
    [spawn],
  );

  // Group anchors are static per group/side — compute once, never per frame.
  const anchors = useMemo(() => GROUPS.map((g) => groupAnchor(g, sign)), [sign]);

  // Formation slot targets depend only on (anchor, count, facing, spacing).
  // They change solely when allocations change, so precompute here on render
  // rather than reallocating fresh arrays every frame inside useFrame.
  const slotTargets = useMemo(
    () =>
      GROUPS.map((g, gi) => {
        const raw = allocations[g.allocIdx] ?? 0;
        const count = Math.min(CAP, Math.max(0, Math.floor(raw)));
        return formationSlots(anchors[gi], count, sign as 1 | -1, groupSpacing(g));
      }),
    [allocations, anchors, sign],
  );

  // Seed instance matrices (scale 0 at the citadel) and per-instance cap colors
  // before first paint so no stray pieces flash at the origin.
  useLayoutEffect(() => {
    const b = bodies.current;
    const c = caps.current;
    if (!b || !c) return;
    GROUPS.forEach((g, gi) => {
      const col = new THREE.Color(capColor(g, side));
      for (let j = 0; j < CAP; j++) {
        const i = gi * CAP + j;
        dummy.position.copy(spawn);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
        c.setMatrixAt(i, dummy.matrix);
        c.setColorAt(i, col);
      }
    });
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [side, dummy, spawn]);

  useFrame((state, delta) => {
    const b = bodies.current;
    const c = caps.current;
    if (!b || !c) return;

    // Exponential ease toward each target; clamp dt so a stalled tab can't jump.
    const dt = Math.min(delta, 0.1);
    const alpha = 1 - Math.pow(0.001, dt);

    for (let gi = 0; gi < GROUPS.length; gi++) {
      const slots = slotTargets[gi];
      const count = slots.length;
      for (let j = 0; j < CAP; j++) {
        const i = gi * CAP + j;
        const cur = current[i];
        const active = j < count;
        if (active) {
          const s = slots[j];
          target.set(s[0], s[1], s[2]);
        } else {
          target.copy(spawn);
        }
        cur.lerp(target, alpha);
        // Active pieces stand; retreating ones stay full-size until they reach
        // home, then vanish (scale 0).
        const atHome = !active && cur.distanceToSquared(spawn) < 1e-4;
        dummy.position.copy(cur);
        dummy.scale.setScalar(active || !atHome ? 1 : 0);
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
        c.setMatrixAt(i, dummy.matrix);
      }
    }
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;

    // Committed → faint gold emissive pulse across the locked formation. This is
    // the player's commit-lock signal, so only pulse the player's own pieces —
    // never gild revealed enemy formations gold.
    if (bodyMat.current) {
      bodyMat.current.emissiveIntensity =
        committed && side === "player"
          ? 0.12 + 0.06 * Math.sin(state.clock.elapsedTime * 4)
          : 0;
    }

    // Wax seal stamps down over the player's citadel in 300ms on commit.
    const seal = sealRef.current;
    if (seal) {
      if (committed) {
        if (sealStart.current === null) sealStart.current = state.clock.elapsedTime;
        const t = Math.min(1, (state.clock.elapsedTime - sealStart.current) / 0.3);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        seal.visible = true;
        seal.position.y = 0.6 + (0.03 - 0.6) * eased;
        seal.scale.setScalar(0.6 + 0.4 * eased);
      } else {
        sealStart.current = null;
        seal.visible = false;
      }
    }
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, CAPACITY]} castShadow receiveShadow>
        <primitive object={bodyGeo} attach="geometry" />
        <meshStandardMaterial
          ref={bodyMat}
          color={PALETTE.pewter}
          roughness={0.6}
          metalness={0.2}
          emissive={PALETTE.playerGold}
          emissiveIntensity={0}
        />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, CAPACITY]} castShadow>
        <primitive object={capGeo} attach="geometry" />
        <meshStandardMaterial roughness={0.5} metalness={0.25} />
      </instancedMesh>

      {side === "player" ? (
        <Cylinder ref={sealRef} args={[0.3, 0.3, 0.04, 32]} position={[0, 0.03, 2.4]} visible={false} castShadow>
          <meshStandardMaterial color="#7a1f2b" roughness={0.7} metalness={0.1} />
        </Cylinder>
      ) : null}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface TroopFormationsProps {
  side: "player" | "enemy";
  // 13-slot allocation array, or null when nothing should render (or when cloaked).
  allocations: number[] | null;
  committed: boolean;
  // Enemy only: render 3 shrouded ghost pawns (committed but not yet revealed).
  cloaked: boolean;
}

export function TroopFormations({ side, allocations, committed, cloaked }: TroopFormationsProps) {
  if (cloaked) return <GhostPawns side={side} />;
  if (!allocations) return null;
  return <RealFormations side={side} allocations={allocations} committed={committed} />;
}

export default TroopFormations;
