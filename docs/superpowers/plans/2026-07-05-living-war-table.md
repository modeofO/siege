# Living War Table (three.js Battlefield) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2D battlefield panel in the 1v1 match page with a three.js war-table scene — carved game pieces on a parchment map that respond physically to slider input, act out each round's outcome in 3–5 seconds driven by the resolution engine's event list, and keep persistent battle damage — with automatic fallback to the existing 2D view when WebGL is unavailable.

**Architecture:** React Three Fiber scene lazy-loaded behind a gate component. Pieces are procedural geometry (no external art assets — "carved miniature" aesthetic from primitives + stylized materials). Data flows one way: existing page props (allocations, commits, modifiers, node owners) drive piece positions declaratively; the optimistic `RoundOutcome` from `resolution1v1.ts` (already wired, subsystem 1) feeds a pure timeline builder whose output the scene plays back on the frame clock. Aftermath (scorch, banners) is derived from round history, so it survives reloads.

**Tech Stack:** three@0.185.1, @react-three/fiber@9.6.1, @react-three/drei@10.7.7 (peer-compatible with the project's React 19.2.3 — fiber 9 requires `react >=19 <19.3`). No other new dependencies. Existing: Next 16.2.6, vitest.

## Global Constraints

- Do NOT touch `/Users/modeofo/Apps/siege/.claude/worktrees/`. Work from `/Users/modeofo/Apps/siege/frontend`. Branch: `feat/war-table-3d`.
- The 2D `BattlefieldView` and `BattleAnimation` components stay in the tree untouched — they are the automatic fallback path.
- Frontend rules: `BigInt(0)` not `0n`; no new GraphQL; `react-hooks/set-state-in-effect` is strict — no synchronous setState in effect bodies. Inside R3F, mutate refs in `useFrame`, never setState per frame.
- Gates for every task: `bun run lint` (baseline: 10 pre-existing problems — add ZERO), `bunx tsc --noEmit`, `bun run build`. Unit tests (`bunx vitest run <file>`) are mandated only where a task's logic is pure (timeline builder, layout math, scorch derivation).
- Commit after every task with trailer `Co-authored-by: Claude <noreply@anthropic.com>`. Do not push.
- npm packages must be audited before install (user rule): check registry publish history and maintainers for the three packages before `bun add`. All three are pmndrs/mrdoob mainline packages — verify the versions above match what `npm view` reports and that no unexpected maintainer/publish anomaly appears.
- threejs skills are available via the Skill tool (`threejs-fundamentals`, `threejs-materials`, `threejs-animation`, `threejs-shaders`, `threejs-interaction`) — consult them rather than guessing at three.js API details.

## Shared Visual Language (used by every scene task)

- **Palette:** parchment `#d8c9a3`, table wood `#3a2b1c`, pewter pieces `#8a8a92`, player gold `#c8a44e`, enemy crimson `#8e2f38`, attack orange `#ff8800`, defense blue `#6b8cae`, repair green `#66cc66`, trap red `#ff3344`, holo cyan `#59d8e6`, candle warm `#ffb35c`.
- **Coordinate system:** map plane 10 × 6 world units on XZ, centered at origin, table surface y = 0. Player side +Z, enemy side −Z.
  - Player citadel `(0, 0, 2.4)`, enemy citadel `(0, 0, -2.4)`.
  - Gates left→right match the 2D layout order (East, Underground, West = data indices 0, 2, 1): gate 0 `(-2.5, 0, 0)`, gate 2 `(0, 0, 0)`, gate 1 `(2.5, 0, 0)`.
  - Node marker `i` sits directly behind its gate at `(gateX(i), 0, -0.8)` — the node→gate pairing must read visually.
- **Camera:** perspective 45° FOV at `(0, 6.5, 5.2)` looking at `(0, 0, -0.2)` (~50° down-angle). No user camera controls in v1 (YAGNI).
- **Scale:** citadels ≈ 1.2 u tall, gates ≈ 0.7 u, troop pieces ≈ 0.28 u, node markers ≈ 0.35 u.

## File Structure

- Create: `frontend/src/components/battlefield3d/Battlefield3D.tsx` — Canvas root + scene composition (kept thin; composition only)
- Create: `frontend/src/components/battlefield3d/Battlefield3DGate.tsx` — lazy load + WebGL detect + 2D fallback
- Create: `frontend/src/components/battlefield3d/layout.ts` — positions, palette, piece-count helpers (pure)
- Create: `frontend/src/components/battlefield3d/pieces.tsx` — citadel, gate, node marker, troop piece meshes
- Create: `frontend/src/components/battlefield3d/TroopFormations.tsx` — allocation → piece placement/movement
- Create: `frontend/src/components/battlefield3d/Ambient.tsx` — candle light flicker, dust motes, holo shimmer, vault smoke
- Create: `frontend/src/components/battlefield3d/choreography.ts` — pure timeline builder from `RoundEvent[]`
- Create: `frontend/src/components/battlefield3d/ResolutionPlayer.tsx` — plays a timeline on the frame clock (flashes, particles, HP ticks)
- Create: `frontend/src/components/battlefield3d/aftermath.ts` — pure scorch/banner derivation from round history
- Test: `frontend/src/components/battlefield3d/__tests__/choreography.test.ts`, `__tests__/layout.test.ts`, `__tests__/aftermath.test.ts`
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx` — swap `BattlefieldView` for `Battlefield3DGate` (final task only)

---

### Task 1: Dependencies + gate component with 2D fallback

**Files:**
- Modify: `frontend/package.json` (via `bun add`)
- Create: `frontend/src/components/battlefield3d/Battlefield3DGate.tsx`
- Create: `frontend/src/components/battlefield3d/Battlefield3D.tsx` (placeholder scene)

**Interfaces:**
- Produces: `Battlefield3DGate` accepting the full prop contract every later task fills in:

```ts
export interface Battlefield3DProps {
  allocations: number[];                 // 13-slot: [p0..p2, g0..g2, repair, nc0..nc2, trap0..trap2]
  isPlayerA: boolean;
  committed: boolean;
  opponentCommitted: boolean;
  modifiers: [number, number, number];
  opponentAllocations?: number[] | null;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  vaultAHp: number;
  vaultBHp: number;
  history: RoundResult1v1[];
  outcome: RoundOutcome | null;          // optimistic or chain-derived; null outside resolution
  onResolutionComplete?: () => void;
  children?: React.ReactNode;            // DOM overlay passthrough (badges etc.)
}
```

- [ ] **Step 1: Audit the packages** (user rule). For each of `three@0.185.1`, `@react-three/fiber@9.6.1`, `@react-three/drei@10.7.7`: `npm view <pkg> maintainers time.modified versions --json | tail -40` — confirm the version exists, publish cadence looks normal, maintainers are the long-standing ones (mrdoob for three; pmndrs collective for fiber/drei). Record one line per package in your report. Abort and escalate on any anomaly.

- [ ] **Step 2: Install**

```bash
bun add three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7
bun add -d @types/three@0.185.0
```

- [ ] **Step 3: Write the gate + placeholder scene**

`Battlefield3DGate.tsx` — this is the architecture-critical piece, write it exactly:

```tsx
"use client";

import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { BattlefieldView } from "@/components/BattlefieldView";
import type { Battlefield3DProps } from "./Battlefield3D";

const Battlefield3D = lazy(() => import("./Battlefield3D"));

function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// NEXT_PUBLIC_BATTLE_3D=0 force-disables (dev escape hatch); default on.
const FLAG_ON = process.env.NEXT_PUBLIC_BATTLE_3D !== "0";

export function Battlefield3DGate(props: Battlefield3DProps & { children?: ReactNode }) {
  const use3d = useMemo(() => FLAG_ON && webglAvailable(), []);

  if (!use3d) {
    return (
      <BattlefieldView
        allocations={props.allocations}
        isPlayerA={props.isPlayerA}
        committed={props.committed}
        modifiers={props.modifiers}
        opponentAllocations={props.opponentAllocations}
      >
        {props.children}
      </BattlefieldView>
    );
  }

  return (
    <Suspense fallback={<div className="h-full min-h-[320px] animate-pulse bg-[#1a1714] rounded-lg" />}>
      <Battlefield3D {...props} />
    </Suspense>
  );
}
```

`Battlefield3D.tsx` placeholder: default-export a component rendering an R3F `<Canvas>` with the camera spec from Shared Visual Language, a `color="#3a2b1c"` ground plane 12×8, one `ambientLight intensity={0.3}`, one placeholder box at origin, and the `children` rendered in an absolutely-positioned DOM overlay div on top of the canvas container (`position: relative` wrapper, canvas fills, overlay `pointer-events-none` except its own children). Export the `Battlefield3DProps` interface from this file. The 2D fallback is NOT wired into the page yet — that's Task 9; nothing user-visible changes in this task.

- [ ] **Step 4: Gates** — `bunx tsc --noEmit`, `bun run lint` (baseline), `bun run build`. The build must succeed with the three.js bundle only in the lazy chunk: verify `bun run build` output doesn't grow the match page's first-load JS by more than ~5 kB (the gate + Suspense only).

- [ ] **Step 5: Commit** — `war table: deps (audited), gate with WebGL fallback, placeholder scene`

---

### Task 2: Layout module + scene foundation (table, map, lighting)

**Files:**
- Create: `frontend/src/components/battlefield3d/layout.ts`
- Test: `frontend/src/components/battlefield3d/__tests__/layout.test.ts`
- Modify: `Battlefield3D.tsx` (replace placeholder contents)

**Interfaces:**
- Produces (pure, exact — later tasks import these):

```ts
export const PALETTE = { parchment: "#d8c9a3", wood: "#3a2b1c", pewter: "#8a8a92",
  playerGold: "#c8a44e", enemyCrimson: "#8e2f38", attack: "#ff8800", defense: "#6b8cae",
  repair: "#66cc66", trap: "#ff3344", holo: "#59d8e6", candle: "#ffb35c" } as const;

export function gatePosition(gate: 0 | 1 | 2): [number, number, number];
// gate 0 → [-2.5, 0, 0]; gate 2 → [0, 0, 0]; gate 1 → [2.5, 0, 0]  (matches 2D East/Under/West order)
export function nodePosition(node: 0 | 1 | 2): [number, number, number]; // behind its gate: [gateX, 0, -0.8]
export function citadelPosition(side: "player" | "enemy"): [number, number, number];
// Formation slots: distribute n pieces in ranks of 4, 0.18u apart, centered on an anchor,
// facing -Z for player pieces and +Z for enemy pieces.
export function formationSlots(anchor: [number, number, number], n: number, facing: 1 | -1): [number, number, number][];
```

- [ ] **Step 1: Failing tests** for `gatePosition`/`nodePosition` exact values, `formationSlots` (n=0 → [], n=5 → rank of 4 + 1 centered second rank, all slots unique, x-centered on anchor).
- [ ] **Step 2: Implement layout.ts; tests pass.**
- [ ] **Step 3: Scene foundation in Battlefield3D.tsx:** wooden table (large box, `PALETTE.wood`, `meshStandardMaterial` roughness 0.9), parchment map plane 10×6 slightly above it (`PALETTE.parchment`, roughness 0.8) with a thin dark border frame; lighting = `ambientLight` 0.25 + one warm `pointLight` (`PALETTE.candle`, intensity 2.2, position `[3.5, 3, 2.5]`) + one cool fill `directionalLight` 0.4 from `[-4, 5, -3]`. Consult `threejs-lighting` skill for shadow setup: the point light casts soft shadows (map 1024). Frame-rate discipline: `<Canvas shadows dpr={[1, 2]}>`.
- [ ] **Step 4: Gates + commit** — `war table: layout module and table scene foundation`

---

### Task 3: Static pieces — citadels, gates, node markers

**Files:**
- Create: `frontend/src/components/battlefield3d/pieces.tsx`
- Modify: `Battlefield3D.tsx` (compose them)

**Interfaces:**
- Produces components (all accept `position` and render procedural geometry only — no assets): `CitadelPiece {side, hp}` (0–50 HP drives intact/cracked/crumbling tiers at ≥30 / ≥12 / <12: progressively tilted crenellations and darkened material), `GatePiece {gate, modifier, scorch}` (arch of 2 pillars + lintel; `modifier` shows a small floating holo glyph in `PALETTE.holo` — reuse the 2D `MODIFIER_LABELS` initial letter as a `drei` `<Text>`; `scorch` 0–1 darkens the material toward charcoal), `NodeMarker {node, owner, trapped}` (obelisk; owner tints `playerGold`/`enemyCrimson`/neutral pewter, `trapped` (own side only) adds a small red rune ring).

Design latitude: mesh detailing is the implementer's craft (consult `threejs-fundamentals` / `threejs-materials`); the interfaces, positions, palette, and state→appearance mappings above are fixed. Every piece must read at the camera distance defined in Task 2 — verify with `bun run dev` and an eyeball check, note it in the report.

- [ ] Steps: implement, compose in scene at layout positions with props hardwired to representative values for now (`hp=50`, `modifier from props.modifiers`, `owner from props.nodes`), gates, commit — `war table: citadel, gate, and node pieces`

---

### Task 4: Troop formations bound to allocations

**Files:**
- Create: `frontend/src/components/battlefield3d/TroopFormations.tsx`
- Modify: `Battlefield3D.tsx`

**Interfaces:**
- Consumes: `formationSlots`, piece positions from layout; `allocations`/`opponentAllocations`/`isPlayerA`/`committed`/`opponentCommitted` from props.
- Produces: `<TroopFormations side allocations committed cloaked />` rendering instanced troop pieces (`InstancedMesh`, cone-on-cylinder "pawn" silhouette, `pewter` with a `playerGold`/`enemyCrimson` cap band).

Behavior (fixed):
- Attack allocation at gate g → that many pieces in formation anchored 0.55 u in front of gate g on the owner's side. Defense → pieces in a tight rank 0.35 u behind the gate on the owner's side, shield-wall spacing 0.14 u. Node contest → pieces beside the node marker. Repair → that many pieces clustered at the owner's citadel base with a `repair`-green cap. Traps are NOT shown as pieces (they're secret; own traps show via `NodeMarker.trapped`).
- Movement: pieces lerp from citadel to slot on allocation increase and back on decrease — exponential ease in `useFrame` (`pos.lerp(target, 1 - Math.pow(0.001, dt))`), never setState. Consult `threejs-animation`.
- `committed` locks the formation and adds a faint gold emissive pulse; a wax-seal disc (drei `<Cylinder>` r=0.3, `#7a1f2b`) stamps down over the player's citadel base with a 300 ms drop animation when `committed` flips true.
- Opponent pieces render ONLY as cloaked when `opponentCommitted && !opponentAllocations`: a single ghost formation of 3 shrouded pieces (semi-transparent pewter, opacity 0.35) at their citadel — presence without information. When `opponentAllocations` is provided (post-reveal), render their true formations.

- [ ] Steps: implement, wire props through `Battlefield3D`, gates, commit — `war table: troop formations bound to allocations, wax-seal commit, cloaked enemy`

---

### Task 5: Ambient layer

**Files:**
- Create: `frontend/src/components/battlefield3d/Ambient.tsx`
- Modify: `Battlefield3D.tsx`

Fixed spec: candle point-light intensity flickers ±8% via smoothed noise in `useFrame` (mutate `light.intensity`, no setState); ~120 dust motes as a `<points>` cloud drifting slowly in the light cone (additive, size 0.02, opacity 0.35); a holo shimmer plane 0.02 u above the parchment — `PALETTE.holo` at opacity 0.05 with a slow-scrolling scanline shader (consult `threejs-shaders`; a 10-line fragment shader, no texture assets); vault smoke — when a citadel's HP tier drops below 30/12, emit a thin gray particle column above it whose density scales with damage tier; citadel banners — one small cloth plane (8×6 segments) per citadel in the owner's color (`playerGold`/`enemyCrimson`) on a mast, waved by a gentle sine displacement of the free-edge vertices in `useFrame` (mutate position attribute, mark needsUpdate — consult `threejs-geometry`). Everything must idle below ~2 ms/frame on a mid-tier laptop; use one shared clock, no per-frame allocations in loops.

- [ ] Steps: implement, gates, commit — `war table: ambient life (candle flicker, dust, holo shimmer, vault smoke)`

---

### Task 6: Choreography — pure timeline builder

**Files:**
- Create: `frontend/src/components/battlefield3d/choreography.ts`
- Test: `frontend/src/components/battlefield3d/__tests__/choreography.test.ts`

**Interfaces:**
- Consumes: `RoundEvent` from `@/lib/resolution1v1`.
- Produces (exact):

```ts
export interface TimelineStep {
  at: number;        // seconds from timeline start
  duration: number;  // seconds
  action:
    | { kind: "node_flip"; node: number; to: NodeOwner }
    | { kind: "clash"; gate: number; dmgToA: number; dmgToB: number }  // intensity = dmg
    | { kind: "repair_glow"; side: "a" | "b"; amount: number }
    | { kind: "hp_tick"; side: "a" | "b"; delta: number }              // negative = damage
    | { kind: "ember"; side: "a" | "b"; amount: number }
    | { kind: "trap_blast"; node: number; victim: "a" | "b" }
    | { kind: "banner_finish"; winnerTeam: 0 | 1 | 2 };
  }

export function buildTimeline(events: RoundEvent[]): { steps: TimelineStep[]; total: number };
```

Fixed timing map (test-pinned): node captures at 0.0 s (0.5 s each, simultaneous); clashes start 0.6 s staggered 0.3 s per gate in gate order, 1.0 s each; repair glow 2.4 s (0.6 s); gate-damage hp_ticks at 2.6 s (0.8 s); ember 3.4 s (0.5 s); trap blasts 3.4 s staggered 0.2 s (0.6 s each); banner_finish 0.3 s after the last other step. `total` = end of last step, and must be ≤ 5.5 s for the maximal event list. Events with zero amounts (no clash at a gate, zero repair) produce NO step — quiet rounds are short.

- [ ] **Step 1: Failing tests:** empty events → `{steps: [], total: 0}`; a full kitchen-sink event list (use the exact `RoundEvent[]` a real `resolveRoundLocal` call produces — import and call it with a crafted input) → assert step ordering, stagger arithmetic, zero-amount omission, total ≤ 5.5; a quiet round (only hp_tick) → short total.
- [ ] **Step 2: Implement; tests pass. Gates. Commit** — `war table: pure choreography timeline builder`

---

### Task 7: Resolution player — timeline on the frame clock

**Files:**
- Create: `frontend/src/components/battlefield3d/ResolutionPlayer.tsx`
- Modify: `Battlefield3D.tsx`

**Interfaces:**
- Consumes: `buildTimeline`, `props.outcome` (a `RoundOutcome | null`), `props.onResolutionComplete`.
- Behavior (fixed): when `outcome` transitions null→non-null, build the timeline once (memo on the outcome object identity) and start a clock ref. Each `useFrame`, advance and drive active steps: clash = attacker formation lunges 0.2 u + white point-flash + spark burst scaled to damage (particle count = 6×dmg, cap 60); node_flip = marker tint crossfade + small banner pop; repair_glow = green pulse on citadel; hp_tick = ticks a mutable HP display value the citadel piece and a drei `<Text>` HP counter read from a shared ref (final values must equal `outcome.vaultAHpAfter/BHpAfter` exactly when the timeline ends); ember = crimson streak from caster citadel to victim citadel; trap_blast = red shockwave ring at the node. On `elapsed >= total`, call `onResolutionComplete` ONCE (ref-guarded) and leave the field in post-round state. No setState in useFrame — refs and material mutation only; the single allowed setState is inside the `onResolutionComplete` callback owned by the page.
- If `outcome` becomes null (round advanced) mid-playback, stop cleanly and snap to final state.

- [ ] Steps: implement (consult `threejs-animation`, `threejs-interaction`), gates, commit — `war table: resolution playback driven by outcome events`

---

### Task 8: Aftermath persistence

**Files:**
- Create: `frontend/src/components/battlefield3d/aftermath.ts`
- Test: `frontend/src/components/battlefield3d/__tests__/aftermath.test.ts`
- Modify: `Battlefield3D.tsx` (feed `GatePiece.scorch` and node banners from it)

**Interfaces:**

```ts
// Pure: derives cumulative battle wear from round history so it survives reloads.
export function deriveAftermath(history: RoundResult1v1[], isPlayerA: boolean): {
  gateScorch: [number, number, number];   // 0-1 per gate: 1 - 0.92^(total damage through that gate, both directions)
  myVaultWear: number;                    // 0-1 from cumulative damage taken
  enemyVaultWear: number;
};
```

- [ ] **Step 1: Failing tests:** empty history → zeros; damage accumulation math exact (`1 - Math.pow(0.92, totalDmg)`); perspective flip (isPlayerA false swaps vault wear).
- [ ] **Step 2: Implement; wire into scene** (scorch to `GatePiece`, wear darkens citadels in addition to live HP tiers; node banners already track `props.nodes`). Gates. Commit — `war table: persistent aftermath derived from history`

---

### Task 9: Page integration

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

Replace the `<BattlefieldView ...>` block (~line 883) with `<Battlefield3DGate ...>` passing: existing props plus `opponentCommitted` (derive from `effectiveCommitCount >= 2` when the player has committed, or `roundStatus`'s commit count minus own), `nodes={state.nodes}`, `vaultAHp/vaultBHp` (perspective-raw, the component handles sides), `history`, `outcome={optimisticOutcome ?? null}`, and `onResolutionComplete={handleOptimisticComplete}`. The `children` (the `BattleAnimation` overlay + pills) continue to render inside the gate so the **2D fallback path keeps today's exact behavior**; in the 3D path, suppress the `BattleAnimation` overlay (the scene plays the resolution itself) but keep the "confirming on-chain…" pill. Read the current wiring around `pendingResult`/`optimisticView`/`dismissedOptimisticRound` carefully — the 3D scene takes over the optimistic playback role, and the reconcile/suppression logic from subsystem 1 must remain intact for both paths.

- [ ] Steps: wire, verify both paths build (`NEXT_PUBLIC_BATTLE_3D=0 bun run build` and default), full gates (`bun run lint` baseline, `bunx tsc --noEmit`, `bun run test` — only pre-existing stakedMatch suite failure, `bun run build`), commit — `match page: living war table with 2D fallback`

---

## Testing

Pure logic (layout, choreography, aftermath) is vitest-covered with exact expected values. Scene rendering is verified by lint/tsc/build gates plus the implementer's eyeball check via `bun run dev` (screenshot or described observation in the task report). No snapshot tests of WebGL output.

## Out of scope (YAGNI)

- Camera controls, postprocessing passes, sound.
- Replacing the 2D `BattlefieldView`/`BattleAnimation` code (they are the fallback).
- The intel drawer (subsystem 3) and any contract changes.
