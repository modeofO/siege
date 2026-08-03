"use client";

import { createRef, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { NodeOwner } from "@/lib/gameState1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";
import { buildTimeline, type TimelineStep } from "./choreography";
import { PALETTE, citadelPosition, gatePosition, nodePosition } from "./layout";

// ResolutionPlayer — plays a choreography timeline on the R3F frame clock.
//
// Data flow: `outcome` transitions null → non-null when both reveals resolve.
// buildTimeline(outcome.events) is memoised on the outcome object identity, so
// the script is built ONCE per round; a clock ref then advances every useFrame.
// Nothing here calls setState — HP values live in refs, effects are a fixed pool
// of pre-allocated meshes toggled visible/opaque in place, and the only React
// state mutation is the page-owned `onResolutionComplete` callback (ref-guarded
// so it fires exactly once). No per-frame allocation: spark buffers, ref arrays,
// and directions are all built once.
//
// This component owns ITS OWN effect meshes and the drei <Text> HP counters. It
// does not reach into pieces / TroopFormations internals — cross-component
// signals flow through composition-root-owned refs instead: the displayed HP is
// mirrored into `playerHpRef` / `enemyHpRef` (read by CitadelPiece for tier
// visuals), and clash lunge envelopes are written into `playerLungeRef` /
// `enemyLungeRef` (read by TroopFormations for the 0.2u attack-group lunge).
//
// HP display follows choreography.ts's HP SUMMATION CONTRACT exactly: start HP
// (captured when the outcome appears) then, in order, + repair (clamp 50),
// − gate damage, − ember, − 5×trap (each floored at 0). On the final frame the
// display is snapped to outcome.vaultAHpAfter / vaultBHpAfter so it matches the
// authoritative result to the unit.

const GATES: ReadonlyArray<0 | 1 | 2> = [0, 1, 2];
const SPARK_CAP = 60; // 6 × dmg, capped — worst-case particles per gate
const EMBER_COLOR = "#e0402f"; // fiery crimson streak

// Deterministic pseudo-random in [0, 1) (fract of sin) — matches hash01 in
// Ambient.tsx. Pure, so it is safe inside useMemo under react-compiler rules.
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 0→1→0 bell envelope for flash / pulse intensity. */
function bell(p: number): number {
  return Math.sin(Math.PI * THREE.MathUtils.clamp(p, 0, 1));
}

/** easeOutBack — overshoots slightly past 1 for a banner "pop". */
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export interface ResolutionPlayerProps {
  outcome: RoundOutcome | null;
  isPlayerA: boolean;
  // Pre-round vault HP (perspective-mapped inside): the ticker starts here and
  // counts to the outcome's final HP.
  vaultAHp: number;
  vaultBHp: number;
  // Shared displayed-HP refs (composition-root owned). The ticking HP shown on
  // the <Text> counters is mirrored here every frame so CitadelPiece can drive
  // its damage tiers from the same value.
  playerHpRef?: React.RefObject<number>;
  enemyHpRef?: React.RefObject<number>;
  // Shared clash-lunge signals (composition-root owned): per-gate progress
  // 0..1 for each side's attack formations. During a clash step the side that
  // DEALT damage gets a 0→1→0 bell envelope at that gate.
  playerLungeRef?: React.RefObject<[number, number, number]>;
  enemyLungeRef?: React.RefObject<[number, number, number]>;
  onResolutionComplete?: () => void;
}

export default function ResolutionPlayer({
  outcome,
  isPlayerA,
  vaultAHp,
  vaultBHp,
  playerHpRef,
  enemyHpRef,
  playerLungeRef,
  enemyLungeRef,
  onResolutionComplete,
}: ResolutionPlayerProps) {
  // Built once per round (memo on outcome identity). Null when idle.
  const timeline = useMemo(() => (outcome ? buildTimeline(outcome.events) : null), [outcome]);

  // ----- Playback lifecycle refs (mutated only in useFrame) -----
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const lastOutcomeRef = useRef<RoundOutcome | null>(null);
  const startPlayerRef = useRef(0);
  const startEnemyRef = useRef(0);

  // ----- HP ticker refs read by the <Text> counters -----
  const playerText = useRef<(THREE.Mesh & { text: string; sync: () => void }) | null>(null);
  const enemyText = useRef<(THREE.Mesh & { text: string; sync: () => void }) | null>(null);
  const lastPlayerShown = useRef(Number.NaN);
  const lastEnemyShown = useRef(Number.NaN);

  // ----- Pre-allocated effect-mesh ref pools (worst-case sizes) -----
  const flashRefs = useMemo(() => GATES.map(() => createRef<THREE.Mesh>()), []);
  const sparkRefs = useMemo(() => GATES.map(() => createRef<THREE.Points>()), []);
  const bannerRefs = useMemo(() => GATES.map(() => createRef<THREE.Mesh>()), []);
  const repairRefs = useMemo(() => [createRef<THREE.Mesh>(), createRef<THREE.Mesh>()], []); // [player, enemy]
  const emberRefs = useMemo(() => [createRef<THREE.Mesh>(), createRef<THREE.Mesh>()], []); // [player, enemy] victim
  const trapRefs = useMemo(() => GATES.map(() => createRef<THREE.Mesh>()), []);

  // Per-banner last-set color: driveBanner re-tints a banner's material only
  // when its owner color actually changes (never re-parses hex per frame).
  const bannerColorCache = useMemo(() => GATES.map(() => ({ value: "" })), []);

  // Spark buffers + stable outward directions, allocated once per gate.
  const sparkData = useMemo(
    () =>
      GATES.map((g) => {
        const positions = new Float32Array(SPARK_CAP * 3);
        const dirs = new Float32Array(SPARK_CAP * 3);
        for (let i = 0; i < SPARK_CAP; i++) {
          const az = hash01(g * 97.3 + i * 3 + 0.1) * Math.PI * 2;
          const el = hash01(g * 97.3 + i * 3 + 1.3) * 0.9; // 0..0.9 rad above table
          const c = Math.cos(el);
          dirs[i * 3] = Math.cos(az) * c;
          dirs[i * 3 + 1] = Math.sin(el) + 0.25; // bias upward
          dirs[i * 3 + 2] = Math.sin(az) * c;
        }
        return { positions, dirs };
      }),
    [],
  );

  // Constant initial text captured once (lazy state, never updated) so React
  // never fights the ref-driven per-frame updates by re-rendering the children.
  const [initialPlayer] = useState(() => String(Math.round(isPlayerA ? vaultAHp : vaultBHp)));
  const [initialEnemy] = useState(() => String(Math.round(isPlayerA ? vaultBHp : vaultAHp)));

  const playerSide: "a" | "b" = isPlayerA ? "a" : "b";
  const [pcx, , pcz] = citadelPosition("player");
  const [ecx, , ecz] = citadelPosition("enemy");

  useFrame((_state, delta) => {
    const idlePlayer = isPlayerA ? vaultAHp : vaultBHp;
    const idleEnemy = isPlayerA ? vaultBHp : vaultAHp;

    // Lunge signals rest at 0 every frame; active clash steps rewrite below.
    resetLunge(playerLungeRef);
    resetLunge(enemyLungeRef);

    // ---- Idle / round-advanced: snap HP to live props, hide effects ----
    if (!timeline || !outcome) {
      if (lastOutcomeRef.current !== null) {
        hideAllEffects(flashRefs, sparkRefs, bannerRefs, repairRefs, emberRefs, trapRefs);
        lastOutcomeRef.current = null;
        elapsedRef.current = 0;
        completedRef.current = false;
      }
      setHpText(playerText.current, Math.round(idlePlayer), lastPlayerShown, playerHpRef);
      setHpText(enemyText.current, Math.round(idleEnemy), lastEnemyShown, enemyHpRef);
      return;
    }

    // ---- New round: reset the clock and capture pre-round start HP ----
    if (lastOutcomeRef.current !== outcome) {
      lastOutcomeRef.current = outcome;
      elapsedRef.current = 0;
      completedRef.current = false;
      startPlayerRef.current = idlePlayer;
      startEnemyRef.current = idleEnemy;
      hideAllEffects(flashRefs, sparkRefs, bannerRefs, repairRefs, emberRefs, trapRefs);
    }

    const { steps, total } = timeline;
    if (!completedRef.current) elapsedRef.current += Math.min(delta, 0.1);
    const elapsed = elapsedRef.current;

    // Reset every pooled mesh to hidden, then re-activate those in-window. One
    // extra visible-write per mesh is far cheaper than tracking transitions.
    hideAllEffects(flashRefs, sparkRefs, bannerRefs, repairRefs, emberRefs, trapRefs);

    for (let si = 0; si < steps.length; si++) {
      const step = steps[si];
      const a = step.action;
      const p = (elapsed - step.at) / step.duration;
      const active = elapsed >= step.at && p <= 1;
      if (!active) continue;

      switch (a.kind) {
        case "clash": {
          driveClash(flashRefs[a.gate].current, sparkRefs[a.gate].current, sparkData[a.gate], p, a.dmgToA + a.dmgToB);
          // Lunge: the side that DEALT damage lunges toward the gate. dmgToB>0
          // means side A's attackers connected (and vice versa); map a/b onto
          // the player/enemy display sides via playerSide. Both may lunge.
          const env = bell(p);
          if (a.dmgToB > 0) writeLunge(playerSide === "a" ? playerLungeRef : enemyLungeRef, a.gate, env);
          if (a.dmgToA > 0) writeLunge(playerSide === "b" ? playerLungeRef : enemyLungeRef, a.gate, env);
          break;
        }
        case "node_flip": {
          driveBanner(bannerRefs[a.node].current, p, nodeDisplayColor(a.to, isPlayerA), bannerColorCache[a.node]);
          break;
        }
        case "repair_glow": {
          const idx = a.side === playerSide ? 0 : 1;
          drivePulse(repairRefs[idx].current, p, 0.8, 0.4, 0.7);
          break;
        }
        case "ember": {
          const idx = a.side === playerSide ? 0 : 1; // side = victim
          driveEmber(emberRefs[idx].current, p);
          break;
        }
        case "trap_blast": {
          // The victim side is reflected only in the HP ticker; the shockwave
          // ring is anchored to the contested node.
          driveRing(trapRefs[a.node].current, p);
          break;
        }
        default:
          // hp_tick and banner_finish have no effect mesh here — both are
          // silent but still counted in `total` so playback runs full length.
          break;
      }
    }

    // ---- HP ticker ----
    const finalPlayer = isPlayerA ? outcome.vaultAHpAfter : outcome.vaultBHpAfter;
    const finalEnemy = isPlayerA ? outcome.vaultBHpAfter : outcome.vaultAHpAfter;
    if (elapsed >= total) {
      setHpText(playerText.current, finalPlayer, lastPlayerShown, playerHpRef);
      setHpText(enemyText.current, finalEnemy, lastEnemyShown, enemyHpRef);
      if (!completedRef.current) {
        completedRef.current = true;
        onResolutionComplete?.();
      }
    } else {
      const hpP = computeHp(steps, elapsed, startPlayerRef.current, "player", playerSide);
      const hpE = computeHp(steps, elapsed, startEnemyRef.current, "enemy", playerSide);
      setHpText(playerText.current, Math.round(hpP), lastPlayerShown, playerHpRef);
      setHpText(enemyText.current, Math.round(hpE), lastEnemyShown, enemyHpRef);
    }
  });

  return (
    <group>
      {/* HP counters float beside each citadel's right flank (+x reads as
          screen-right from the fixed +Z camera), clear of the keep towers and
          curtain walls that occlude a centered counter. */}
      <Text
        ref={playerText}
        position={[pcx + 1.35, 1.1, pcz]}
        fontSize={0.4}
        color={PALETTE.playerGold}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#1a1207"
        material-toneMapped={false}
      >
        {initialPlayer}
      </Text>
      <Text
        ref={enemyText}
        position={[ecx + 1.35, 1.1, ecz]}
        fontSize={0.4}
        color={PALETTE.enemyCrimson}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#1a0709"
        material-toneMapped={false}
      >
        {initialEnemy}
      </Text>

      {/* Per-gate clash: white point-flash + orange spark burst. */}
      {GATES.map((g) => {
        const [gx, , gz] = gatePosition(g);
        return (
          <group key={g} position={[gx, 0, gz]}>
            <mesh ref={flashRefs[g]} position={[0, 0.4, 0]} visible={false}>
              <sphereGeometry args={[0.22, 12, 12]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <points ref={sparkRefs[g]} position={[0, 0.35, 0]} visible={false}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[sparkData[g].positions, 3]} />
              </bufferGeometry>
              <pointsMaterial
                color={PALETTE.attack}
                size={0.05}
                sizeAttenuation
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </points>
          </group>
        );
      })}

      {/* Node capture banner pops. */}
      {GATES.map((g) => {
        const [nx, , nz] = nodePosition(g);
        return (
          <mesh key={g} ref={bannerRefs[g]} position={[nx, 0.45, nz + 0.06]} visible={false}>
            <planeGeometry args={[0.3, 0.42]} />
            <meshBasicMaterial color={PALETTE.pewter} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      })}

      {/* Repair glow around each citadel. */}
      {(["player", "enemy"] as const).map((side, i) => {
        const [cx, , cz] = citadelPosition(side);
        return (
          <mesh key={side} ref={repairRefs[i]} position={[cx, 0.6, cz]} visible={false}>
            <sphereGeometry args={[0.9, 16, 16]} />
            <meshBasicMaterial
              color={PALETTE.repair}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      {/* Ember streaks spanning the citadels (slightly offset so both read). */}
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={emberRefs[i]}
          position={[i === 0 ? -0.15 : 0.15, 0.7, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          visible={false}
        >
          <cylinderGeometry args={[0.045, 0.045, 4.8, 8]} />
          <meshBasicMaterial
            color={EMBER_COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Trap shockwave rings at each node. */}
      {GATES.map((g) => {
        const [nx, , nz] = nodePosition(g);
        return (
          <mesh key={g} ref={trapRefs[g]} position={[nx, 0.06, nz]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.3, 0.04, 8, 32]} />
            <meshBasicMaterial
              color={PALETTE.trap}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Helpers (module scope — no per-frame closure allocation)
// ---------------------------------------------------------------------------

type MeshRef = React.RefObject<THREE.Mesh | null>;
type PointsRef = React.RefObject<THREE.Points | null>;

function basicMat(o: THREE.Mesh | null): THREE.MeshBasicMaterial | null {
  return o ? (o.material as THREE.MeshBasicMaterial) : null;
}

/** Reset every pooled effect mesh to hidden before re-activating in-window ones. */
function hideAllEffects(
  flashRefs: MeshRef[],
  sparkRefs: PointsRef[],
  bannerRefs: MeshRef[],
  repairRefs: MeshRef[],
  emberRefs: MeshRef[],
  trapRefs: MeshRef[],
): void {
  for (let i = 0; i < flashRefs.length; i++) if (flashRefs[i].current) flashRefs[i].current!.visible = false;
  for (let i = 0; i < sparkRefs.length; i++) if (sparkRefs[i].current) sparkRefs[i].current!.visible = false;
  for (let i = 0; i < bannerRefs.length; i++) if (bannerRefs[i].current) bannerRefs[i].current!.visible = false;
  for (let i = 0; i < repairRefs.length; i++) if (repairRefs[i].current) repairRefs[i].current!.visible = false;
  for (let i = 0; i < emberRefs.length; i++) if (emberRefs[i].current) emberRefs[i].current!.visible = false;
  for (let i = 0; i < trapRefs.length; i++) if (trapRefs[i].current) trapRefs[i].current!.visible = false;
}

/** Clash: white bell flash + outward spark burst scaled to damage (6×dmg, cap 60). */
function driveClash(
  flash: THREE.Mesh | null,
  sparks: THREE.Points | null,
  data: { positions: Float32Array; dirs: Float32Array },
  p: number,
  dmg: number,
): void {
  const env = bell(p);
  if (flash) {
    flash.visible = true;
    flash.scale.setScalar(0.6 + 0.9 * env);
    const m = basicMat(flash);
    if (m) m.opacity = 0.9 * env;
  }
  if (sparks) {
    sparks.visible = true;
    const count = Math.min(SPARK_CAP, Math.max(1, Math.floor(6 * dmg)));
    const radius = 0.15 + p * 0.7;
    const { positions, dirs } = data;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      positions[ix] = dirs[ix] * radius;
      positions[ix + 1] = dirs[ix + 1] * radius;
      positions[ix + 2] = dirs[ix + 2] * radius;
    }
    const geo = sparks.geometry;
    geo.setDrawRange(0, count);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const mat = sparks.material as THREE.PointsMaterial;
    mat.opacity = (1 - p) * 0.9;
  }
}

/** Zero a shared per-gate lunge signal in place (called at the top of every frame). */
function resetLunge(ref: React.RefObject<[number, number, number]> | undefined): void {
  if (!ref) return;
  const l = ref.current;
  l[0] = 0;
  l[1] = 0;
  l[2] = 0;
}

/** Write one gate's lunge envelope into a shared signal (attacker side only). */
function writeLunge(
  ref: React.RefObject<[number, number, number]> | undefined,
  gate: number,
  env: number,
): void {
  if (ref) ref.current[gate] = env;
}

/**
 * Node capture banner pop-up (easeOutBack rise, late fade), tinted to the new
 * owner. `cache` remembers the last color set on this banner's material so the
 * hex string is parsed once on step activation, not every active frame.
 */
function driveBanner(banner: THREE.Mesh | null, p: number, color: string, cache: { value: string }): void {
  if (!banner) return;
  banner.visible = true;
  banner.scale.set(1, easeOutBack(Math.min(1, p / 0.6)), 1);
  const m = basicMat(banner);
  if (m) {
    if (cache.value !== color) {
      m.color.set(color);
      cache.value = color;
    }
    m.opacity = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
  }
}

/** Generic bell-envelope pulse (repair glow): scale from `base` + `grow`, opacity `peak`. */
function drivePulse(mesh: THREE.Mesh | null, p: number, base: number, grow: number, peak: number): void {
  if (!mesh) return;
  const env = bell(p);
  mesh.visible = true;
  mesh.scale.setScalar(base + grow * env);
  const m = basicMat(mesh);
  if (m) m.opacity = peak * env;
}

/** Ember streak: length shoots out over the first 40%, then a bell fade. */
function driveEmber(mesh: THREE.Mesh | null, p: number): void {
  if (!mesh) return;
  mesh.visible = true;
  mesh.scale.set(1, Math.min(1, p / 0.4), 1);
  const m = basicMat(mesh);
  if (m) m.opacity = bell(p);
}

/** Trap shockwave: ring expands outward and fades. */
function driveRing(mesh: THREE.Mesh | null, p: number): void {
  if (!mesh) return;
  mesh.visible = true;
  mesh.scale.setScalar(0.2 + p * 1.8);
  const m = basicMat(mesh);
  if (m) m.opacity = (1 - p) * 0.9;
}

/** Perspective node-flip color: player team → gold, enemy → crimson, neutral → pewter. */
function nodeDisplayColor(owner: NodeOwner, isPlayerA: boolean): string {
  if (owner === "neutral") return PALETTE.pewter;
  const playerTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";
  return owner === playerTeam ? PALETTE.playerGold : PALETTE.enemyCrimson;
}

/**
 * HP display value for one side at `elapsed`, per the choreography HP SUMMATION
 * CONTRACT. Each step contributes a fraction = its progress in [0,1], so the
 * counter ticks smoothly through the step window; applied in the fixed order
 * repair (clamp 50) → gate → ember → trap (each floored at 0).
 */
function computeHp(
  steps: TimelineStep[],
  elapsed: number,
  startHp: number,
  display: "player" | "enemy",
  playerSide: "a" | "b",
): number {
  let repair = 0;
  let gate = 0;
  let ember = 0;
  let trap = 0;
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    if (elapsed < step.at) continue;
    const prog = Math.min(1, (elapsed - step.at) / step.duration);
    const a = step.action;
    switch (a.kind) {
      case "repair_glow":
        if (sideDisplay(a.side, playerSide) === display) repair += a.amount * prog;
        break;
      case "hp_tick":
        if (sideDisplay(a.side, playerSide) === display) gate += Math.abs(a.delta) * prog;
        break;
      case "ember":
        if (sideDisplay(a.side, playerSide) === display) ember += a.amount * prog;
        break;
      case "trap_blast":
        if (sideDisplay(a.victim, playerSide) === display) trap += 5 * prog;
        break;
      default:
        break;
    }
  }
  let hp = Math.min(50, startHp + repair);
  hp = Math.max(0, hp - gate);
  hp = Math.max(0, hp - ember);
  hp = Math.max(0, hp - trap);
  return hp;
}

function sideDisplay(side: "a" | "b", playerSide: "a" | "b"): "player" | "enemy" {
  return side === playerSide ? "player" : "enemy";
}

/**
 * Publish one side's displayed HP: mirror it into the shared ref (read by
 * CitadelPiece's tier ticker every frame — a plain scalar write) and update the
 * drei <Text> counter only when the integer changes (troika sync is costly).
 */
function setHpText(
  t: (THREE.Mesh & { text: string; sync: () => void }) | null,
  value: number,
  last: React.RefObject<number>,
  hpRef?: React.RefObject<number>,
): void {
  if (hpRef) hpRef.current = value;
  if (!t || value === last.current) return;
  t.text = String(value);
  t.sync();
  last.current = value;
}
