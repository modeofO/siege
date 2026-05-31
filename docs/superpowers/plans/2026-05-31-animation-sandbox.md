# Animation Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/sandbox/animations` page where you click buttons and watch anime.js battle animations play on a real BattlefieldView with sprites — no game state, wallet, or chain needed.

**Architecture:** Next.js route inside the existing frontend. Hardcoded mock data drives animation timeline factories in `lib/animations/`. The sandbox page renders a real `BattlefieldView` and wires button clicks to timeline playback. Animation modules are decoupled from the sandbox and reusable by the real match page later.

**Tech Stack:** Next.js 16, React 19, anime.js 4.4.1 (`createTimeline`, `animate`, `stagger`, `createSpring`), existing `BattlefieldView`/`TroopSprite` components.

**Branch:** `feat/animation-sandbox` (create from `main`)

---

### Task 0: Create Feature Branch

**Files:** None

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd frontend && git checkout -b feat/animation-sandbox main
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feat/animation-sandbox`

---

### Task 1: Scaffold Sandbox Route and Mock Data

**Files:**
- Create: `frontend/src/app/sandbox/animations/page.tsx`
- Create: `frontend/src/app/sandbox/animations/mockData.ts`

- [ ] **Step 1: Create mock data file**

This file provides hardcoded game data for each animation scene. No game state hooks involved.

```typescript
// frontend/src/app/sandbox/animations/mockData.ts
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";

export const MOCK_ALLOCATIONS_A = [3, 2, 0, 2, 1, 0, 1, 1, 0, 0];
export const MOCK_ALLOCATIONS_B = [2, 1, 2, 1, 2, 1, 0, 0, 1, 0];
export const MOCK_MODIFIERS: [number, number, number] = [0, 2, 0];

export const MOCK_PREV_NODES: [NodeOwner, NodeOwner, NodeOwner] = [
  "neutral",
  "teamA",
  "neutral",
];
export const MOCK_NEW_NODES: [NodeOwner, NodeOwner, NodeOwner] = [
  "teamA",
  "teamA",
  "teamB",
];

export const MOCK_RESULT: RoundResult1v1 = {
  round: 3,
  aAttack: [3, 2, 0],
  aDefense: [2, 1, 0],
  bAttack: [2, 1, 2],
  bDefense: [1, 2, 1],
  damageToA: 3,
  damageToB: 4,
  modifiers: [0, 2, 0],
  gateBreakdown: [
    {
      gate: 0,
      modifier: 0,
      attackA: 3,
      defenseA: 2,
      attackB: 2,
      defenseB: 1,
      dmgToA: 0,
      dmgToB: 2,
    },
    {
      gate: 1,
      modifier: 2,
      attackA: 2,
      defenseA: 1,
      attackB: 1,
      defenseB: 2,
      dmgToA: 0,
      dmgToB: 0,
    },
    {
      gate: 2,
      modifier: 0,
      attackA: 0,
      defenseA: 0,
      attackB: 2,
      defenseB: 0,
      dmgToA: 2,
      dmgToB: 0,
    },
  ],
  aTraps: [1, 0, 0],
  bTraps: [0, 0, 1],
  trapDmgToA: 5,
  trapDmgToB: 5,
  aAbilityId: 1,
  aAbilityTarget: 0,
  bAbilityId: 3,
  bAbilityTarget: 1,
};

export function mockResultWithAbility(
  abilityId: number,
  target: number,
): RoundResult1v1 {
  return {
    ...MOCK_RESULT,
    aAbilityId: abilityId,
    aAbilityTarget: target,
    bAbilityId: 0,
    bAbilityTarget: 0,
  };
}

export const MOCK_VAULT_BREACH_RESULT: RoundResult1v1 = {
  ...MOCK_RESULT,
  damageToB: 12,
  gateBreakdown: [
    { ...MOCK_RESULT.gateBreakdown[0], dmgToB: 5 },
    { ...MOCK_RESULT.gateBreakdown[1], dmgToB: 4 },
    { ...MOCK_RESULT.gateBreakdown[2], dmgToB: 3 },
  ],
};
```

- [ ] **Step 2: Create the sandbox page**

This is a simple page: a row of buttons and a battlefield. Each button stores a scene key in state. A `useEffect` runs the animation when the scene changes.

```tsx
// frontend/src/app/sandbox/animations/page.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { BattlefieldView, POSITIONS } from "@/components/BattlefieldView";
import {
  MOCK_ALLOCATIONS_A,
  MOCK_ALLOCATIONS_B,
  MOCK_MODIFIERS,
  MOCK_RESULT,
  MOCK_PREV_NODES,
  MOCK_NEW_NODES,
  MOCK_VAULT_BREACH_RESULT,
  mockResultWithAbility,
} from "./mockData";

type Scene =
  | "idle"
  | "troop-march"
  | "gate-clash"
  | "full-round"
  | "siege-sword"
  | "stone-cloak"
  | "ember-blast"
  | "hex"
  | "fortify"
  | "vault-breach";

const SCENES: { key: Scene; label: string }[] = [
  { key: "troop-march", label: "Troop March" },
  { key: "gate-clash", label: "Gate Clash" },
  { key: "full-round", label: "Full Round" },
  { key: "siege-sword", label: "Siege Sword" },
  { key: "stone-cloak", label: "Stone Cloak" },
  { key: "ember-blast", label: "Ember Blast" },
  { key: "hex", label: "Hex" },
  { key: "fortify", label: "Fortify" },
  { key: "vault-breach", label: "Vault Breach" },
];

export default function AnimationSandboxPage() {
  const [activeScene, setActiveScene] = useState<Scene>("idle");
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const playScene = useCallback((scene: Scene) => {
    setActiveScene("idle");
    setPlaying(false);
    // Force a re-render cycle so the battlefield resets before the new scene starts
    requestAnimationFrame(() => {
      setActiveScene(scene);
      setPlaying(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#12100e] text-[#d4cfc6]">
      {/* Scene buttons */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#1a1714] border-b border-[#3d3428] flex-wrap">
        <span className="text-[#c8a44e] text-xs tracking-[2px] font-serif mr-2">
          ANIMATIONS
        </span>
        {SCENES.map((s) => (
          <button
            key={s.key}
            onClick={() => playScene(s.key)}
            disabled={playing && activeScene === s.key}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              activeScene === s.key
                ? "border-[#c8a44e] bg-[#c8a44e]/15 text-[#c8a44e]"
                : "border-[#3d3428] hover:border-[#c8a44e]/50 text-[#d4cfc6]"
            } disabled:opacity-50`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Battlefield */}
      <div className="max-w-4xl mx-auto p-4">
        <div ref={containerRef} className="relative">
          <BattlefieldView
            allocations={
              activeScene === "idle"
                ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                : MOCK_ALLOCATIONS_A
            }
            isPlayerA={true}
            committed={activeScene !== "idle"}
            modifiers={MOCK_MODIFIERS}
            opponentAllocations={
              activeScene === "idle" ? null : MOCK_ALLOCATIONS_B
            }
          />
          {/* Animation overlay renders here per scene */}
          {activeScene !== "idle" && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-[#c8a44e]/60 tracking-wider font-mono pointer-events-auto">
                Playing: {activeScene}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

```bash
cd frontend && bun run dev
```

Open `http://localhost:3000/sandbox/animations` in a browser. Verify:
- Row of 9 scene buttons at the top
- BattlefieldView renders with the battlefield background and sprite assets
- Clicking a button highlights it and shows "Playing: scene-name" text
- Page loads without errors in the console

- [ ] **Step 4: Run lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/sandbox/animations/
git commit -m "feat: scaffold animation sandbox route with mock data

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 2: Troop March Animation

**Files:**
- Create: `frontend/src/lib/animations/troopMarch.ts`
- Modify: `frontend/src/app/sandbox/animations/page.tsx`

The troop march is the most visually impactful starting point. Troops start massed at their base, then march in staggered formation to their assigned positions (gates, nodes, repair).

- [ ] **Step 1: Create the troop march animation module**

This module exports a function that takes an array of troop DOM elements with their target positions, and returns an anime.js timeline that animates them from base to destination with staggered departure.

```typescript
// frontend/src/lib/animations/troopMarch.ts
import { createTimeline, stagger, createSpring } from "animejs";

export interface TroopTarget {
  el: HTMLElement;
  toX: number; // percentage
  toY: number; // percentage
}

export function createMarchTimeline(
  troops: TroopTarget[],
  onComplete?: () => void,
) {
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  for (let i = 0; i < troops.length; i++) {
    const { el, toX, toY } = troops[i];
    tl.add(
      el,
      {
        left: `${toX}%`,
        top: `${toY}%`,
        opacity: [0.5, 1],
        duration: 600,
        ease: createSpring({ stiffness: 120, damping: 18 }),
      },
      i * 80,
    );
  }

  return tl;
}
```

- [ ] **Step 2: Create animated troop elements in the sandbox**

We need troop sprites that start at the base and animate to their assigned positions. Instead of using `BattlefieldView` (which places troops instantly), we render our own troop layer on top. Modify the sandbox page to add a troop animation overlay for the "troop-march" scene.

In `frontend/src/app/sandbox/animations/page.tsx`, add the imports and a new component for the troop march scene:

Add this import at the top:
```typescript
import { useEffect } from "react";
import { createMarchTimeline, type TroopTarget } from "@/lib/animations/troopMarch";
import { POSITIONS } from "@/components/BattlefieldView";
import Image from "next/image";
```

Add this component before `AnimationSandboxPage`:
```tsx
const TROOP_SPRITES: Record<string, Record<string, string>> = {
  attack: { a: "/sprites/troops/troop_attacka.png", b: "/sprites/troops/troop_attackb.png" },
  defense: { a: "/sprites/troops/troop_defensea.png", b: "/sprites/troops/troop_defenseb.png" },
  healer: { a: "/sprites/troops/troop_healera.png", b: "/sprites/troops/troop_healerb.png" },
  node: { a: "/sprites/troops/troop_nodea.png", b: "/sprites/troops/troop_nodeb.png" },
};

interface MarchGroup {
  type: string;
  team: "a" | "b";
  count: number;
  toX: number;
  toY: number;
}

function getMarchGroups(): MarchGroup[] {
  const atk = MOCK_ALLOCATIONS_A;
  const attackPos = [
    { x: POSITIONS.baseB.x - 8, y: POSITIONS.gates[0].y },
    { x: POSITIONS.baseB.x, y: POSITIONS.gates[1].y },
    { x: POSITIONS.baseB.x - 8, y: 48 },
  ];
  const defensePos = [
    { x: POSITIONS.baseA.x + 5, y: POSITIONS.gates[0].y },
    { x: POSITIONS.baseA.x + 5, y: POSITIONS.gates[1].y },
    { x: POSITIONS.baseA.x + 8, y: 48 },
  ];
  const nodePos = POSITIONS.nodes.map((n) => ({ x: n.x - 2, y: n.y }));
  const repairPos = POSITIONS.repairA;

  const groups: MarchGroup[] = [];
  for (let i = 0; i < 3; i++) {
    if (atk[i] > 0)
      groups.push({ type: "attack", team: "a", count: atk[i], toX: attackPos[i].x, toY: attackPos[i].y });
  }
  for (let i = 0; i < 3; i++) {
    if (atk[3 + i] > 0)
      groups.push({ type: "defense", team: "a", count: atk[3 + i], toX: defensePos[i].x, toY: defensePos[i].y });
  }
  if (atk[6] > 0)
    groups.push({ type: "healer", team: "a", count: atk[6], toX: repairPos.x, toY: repairPos.y });
  for (let i = 0; i < 3; i++) {
    if (atk[7 + i] > 0)
      groups.push({ type: "node", team: "a", count: atk[7 + i], toX: nodePos[i].x, toY: nodePos[i].y });
  }
  return groups;
}

function TroopMarchScene({ onComplete }: { onComplete: () => void }) {
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const groups = getMarchGroups();
  const base = POSITIONS.baseA;

  useEffect(() => {
    const els = troopRefs.current.filter(Boolean) as HTMLElement[];
    if (els.length === 0) {
      onComplete();
      return;
    }
    const targets: TroopTarget[] = els.map((el, i) => ({
      el,
      toX: groups[i].toX,
      toY: groups[i].toY,
    }));
    const tl = createMarchTimeline(targets, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {groups.map((g, i) => (
        <div
          key={`march-${i}`}
          ref={(el) => { troopRefs.current[i] = el; }}
          className="absolute pointer-events-none"
          style={{
            left: `${base.x}%`,
            top: `${base.y}%`,
            transform: "translate(-50%, -50%)",
            width: "7%",
            opacity: 0.5,
          }}
        >
          <Image
            src={TROOP_SPRITES[g.type]["a"]}
            alt={`${g.type}`}
            width={64}
            height={64}
            className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />
          <span className="block text-center text-[9px] text-[#d4cfc6] bg-[#1a1714]/80 border border-[#3d3428] rounded px-1 mt-0.5">
            x{g.count}
          </span>
        </div>
      ))}
    </div>
  );
}
```

Then update the render section. Replace the placeholder overlay `div` inside the `{activeScene !== "idle" && (...)}` block with scene-specific rendering:

```tsx
{activeScene === "troop-march" && (
  <TroopMarchScene onComplete={() => setPlaying(false)} />
)}
{activeScene !== "idle" && activeScene !== "troop-march" && (
  <div className="absolute inset-0 pointer-events-none z-20">
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-[#c8a44e]/60 tracking-wider font-mono">
      TODO: {activeScene}
    </div>
  </div>
)}
```

Also hide the `BattlefieldView`'s own troops during the march by passing empty allocations when `troop-march` is active:

```tsx
<BattlefieldView
  allocations={
    activeScene === "idle" || activeScene === "troop-march"
      ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      : MOCK_ALLOCATIONS_A
  }
  isPlayerA={true}
  committed={activeScene !== "idle" && activeScene !== "troop-march"}
  modifiers={MOCK_MODIFIERS}
  opponentAllocations={
    activeScene === "idle" || activeScene === "troop-march"
      ? null
      : MOCK_ALLOCATIONS_B
  }
/>
```

- [ ] **Step 3: Test in browser**

Open `http://localhost:3000/sandbox/animations`. Click "Troop March". Verify:
- Troop sprites start massed at Player A's base position
- They animate outward to gate, defense, node, and repair positions
- Movement has a spring feel (slight overshoot/settle)
- Each group departs with a slight stagger delay
- "Playing" indicator clears when animation finishes
- Clicking "Troop March" again replays the animation

- [ ] **Step 4: Lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animations/troopMarch.ts frontend/src/app/sandbox/animations/page.tsx
git commit -m "feat: troop march animation with staggered spring movement

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: Gate Clash Animation

**Files:**
- Create: `frontend/src/lib/animations/gateClash.ts`
- Modify: `frontend/src/app/sandbox/animations/page.tsx`

Attackers charge toward the gates, impact flash fires, the container shakes, damage numbers float up, and defeated troops fade out.

- [ ] **Step 1: Create the gate clash animation module**

```typescript
// frontend/src/lib/animations/gateClash.ts
import { createTimeline, animate } from "animejs";
import type { RoundResult1v1 } from "@/lib/gameState1v1";

export interface ClashElements {
  container: HTMLElement;
  gates: HTMLElement[];
  damageNumbers: HTMLElement[];
}

export function createClashTimeline(
  els: ClashElements,
  result: RoundResult1v1,
  isPlayerA: boolean,
  onComplete?: () => void,
) {
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  // Phase 1: Gate impact flashes (0ms)
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0 || !els.gates[i]) continue;
    const intensity = Math.min(totalDmg / 8, 1);
    tl.add(
      els.gates[i],
      {
        scale: [0.3, 1.5],
        opacity: [0.9 * intensity, 0],
        duration: 400,
        ease: "outQuad",
      },
      0,
    );
  }

  // Phase 2: Screen shake (300ms)
  tl.add(
    els.container,
    {
      translateX: [0, -4, 5, -3, 2, 0],
      translateY: [0, 3, -4, 2, -1, 0],
      duration: 300,
      ease: "inOutQuad",
    },
    300,
  );

  // Phase 3: Damage numbers float up (400ms)
  for (let i = 0; i < els.damageNumbers.length; i++) {
    const numEl = els.damageNumbers[i];
    if (!numEl) continue;
    tl.add(
      numEl,
      {
        translateY: [0, -36],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outQuad",
      },
      400 + i * 60,
    );
  }

  return tl;
}
```

- [ ] **Step 2: Add GateClashScene to the sandbox page**

In `frontend/src/app/sandbox/animations/page.tsx`, add a new import:
```typescript
import { createClashTimeline, type ClashElements } from "@/lib/animations/gateClash";
```

Add the `GateClashScene` component:
```tsx
function GateClashScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { onComplete(); return; }

    const els: ClashElements = {
      container,
      gates: gateRefs.current.filter(Boolean) as HTMLElement[],
      damageNumbers: dmgRefs.current.filter(Boolean) as HTMLElement[],
    };
    const tl = createClashTimeline(els, MOCK_RESULT, true, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dmgNumbers: { gateIndex: number; value: number; color: string; variant: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = MOCK_RESULT.gateBreakdown[i];
    if (gate.dmgToB > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToB, color: "#4ade80", variant: "dealt" });
    if (gate.dmgToA > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToA, color: "#ef4444", variant: "taken" });
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Gate flash overlays */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`gate-flash-${i}`}
          ref={(el) => { gateRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            width: 80,
            height: 80,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: "radial-gradient(circle, rgba(255,200,80,0.8) 0%, rgba(255,80,20,0.5) 50%, transparent 100%)",
            opacity: 0,
          }}
        />
      ))}
      {/* Damage numbers */}
      {dmgNumbers.map((d, i) => {
        const pos = POSITIONS.gates[d.gateIndex];
        const offsetX = d.variant === "dealt" ? -16 : 16;
        return (
          <div
            key={`dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-sm select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`,
              top: `${pos.y}%`,
              transform: "translate(-50%, 0)",
              color: d.color,
              opacity: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}
    </div>
  );
}
```

Wire it into the scene rendering block:
```tsx
{activeScene === "gate-clash" && (
  <GateClashScene onComplete={() => setPlaying(false)} />
)}
```

- [ ] **Step 3: Test in browser**

Click "Gate Clash". Verify:
- Gate positions flash with orange/red radial bursts (proportional to damage)
- The battlefield container shakes briefly
- Green "+N" and red "-N" damage numbers float up from each gate
- Numbers stagger in slightly
- Animation completes and button re-enables

- [ ] **Step 4: Lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animations/gateClash.ts frontend/src/app/sandbox/animations/page.tsx
git commit -m "feat: gate clash animation with impact flash, shake, damage numbers

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 4: Ability Effect Animations

**Files:**
- Create: `frontend/src/lib/animations/abilityEffects.ts`
- Modify: `frontend/src/app/sandbox/animations/page.tsx`

Five ability types, each with a distinct visual. Each button triggers one specific ability.

- [ ] **Step 1: Create the ability effects animation module**

```typescript
// frontend/src/lib/animations/abilityEffects.ts
import { createTimeline, createSpring } from "animejs";
import type { POSITIONS as PositionsType } from "@/components/BattlefieldView";

type Positions = typeof PositionsType;

export interface AbilityElements {
  effectEl: HTMLElement | SVGElement;
  secondaryEl?: HTMLElement | SVGElement | null;
}

function abilityType(id: number): number {
  return ((id - 1) % 5) + 1;
}

function abilityTier(id: number): number {
  return Math.floor((id - 1) / 5) + 1;
}

export function createAbilityTimeline(
  abilityId: number,
  els: AbilityElements,
  onComplete?: () => void,
) {
  const tier = abilityTier(abilityId);
  const type = abilityType(abilityId);
  const tl = createTimeline({ autoplay: false, onComplete });

  switch (type) {
    case 1: // Siege Sword — slash
      tl.add(els.effectEl, {
        strokeDashoffset: [60, 0],
        opacity: [0.9, 1, 0],
        duration: 600,
        ease: "outQuad",
      }, 0);
      if (els.secondaryEl) {
        tl.add(els.secondaryEl, {
          strokeDashoffset: [60, 0],
          opacity: [0.9, 1, 0],
          duration: 600,
          ease: "outQuad",
        }, 80);
      }
      break;

    case 2: // Stone Cloak — shield dome
      tl.add(els.effectEl, {
        scaleY: [0.3, 1.1, 1],
        opacity: [0, 0.8, 0.6, 0],
        duration: 800,
        ease: "outQuad",
      }, 0);
      break;

    case 3: // Ember Blast — explosion burst
      tl.add(els.effectEl, {
        scale: [0.1, tier === 2 ? 2.0 : 1.5, tier === 2 ? 2.5 : 1.8],
        opacity: [0.9, 0.8, 0],
        duration: 700,
        ease: "outExpo",
      }, 0);
      break;

    case 4: // Hex — curse ripple
      tl.add(els.effectEl, {
        scale: [0.3, 1.5, 2.2],
        opacity: [0.5, 0.3, 0],
        duration: 800,
        ease: "outQuad",
      }, 0);
      if (els.secondaryEl) {
        tl.add(els.secondaryEl, {
          scale: [0.2, 1.2, 1.8],
          opacity: [0.4, 0.2, 0],
          duration: 800,
          ease: "outQuad",
        }, 150);
      }
      break;

    case 5: // Fortify — golden beam
      tl.add(els.effectEl, {
        scaleY: [0.3, 1.3, 1.0],
        opacity: [0, 0.9, 0.7, 0],
        duration: 700,
        ease: createSpring({ stiffness: 100, damping: 14 }),
      }, 0);
      break;
  }

  return tl;
}
```

- [ ] **Step 2: Add ability scene components to the sandbox page**

In `frontend/src/app/sandbox/animations/page.tsx`, add import:
```typescript
import { createAbilityTimeline, type AbilityElements } from "@/lib/animations/abilityEffects";
```

Add a generic ability scene component that renders the appropriate visual for each ability type:

```tsx
function AbilityScene({
  abilityId,
  onComplete,
}: {
  abilityId: number;
  onComplete: () => void;
}) {
  const effectRef = useRef<HTMLDivElement | SVGSVGElement | null>(null);
  const secondaryRef = useRef<HTMLDivElement | SVGLineElement | null>(null);
  const abilityType = ((abilityId - 1) % 5) + 1;
  const tier = Math.floor((abilityId - 1) / 5) + 1;

  useEffect(() => {
    const el = effectRef.current;
    if (!el) { onComplete(); return; }
    const els: AbilityElements = { effectEl: el, secondaryEl: secondaryRef.current };
    const tl = createAbilityTimeline(abilityId, els, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gatePos = POSITIONS.gates[0];
  const myBase = POSITIONS.baseA;
  const enemyBase = POSITIONS.baseB;

  switch (abilityType) {
    case 1: { // Siege Sword
      const size = tier === 2 ? 16 : 10;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <svg
            className="absolute"
            style={{ left: `${gatePos.x}%`, top: `${gatePos.y}%`, width: `${size}%`, height: `${size}%`, transform: "translate(-50%, -50%)", overflow: "visible" }}
            viewBox="-10 -10 20 20"
          >
            <line ref={effectRef as React.Ref<SVGLineElement>} x1="-8" y1="-8" x2="8" y2="8" stroke="#daa520" strokeWidth={tier === 2 ? 3 : 2} strokeLinecap="round" strokeDasharray="60" strokeDashoffset="60" opacity="0" />
            <line ref={secondaryRef as React.Ref<SVGLineElement>} x1="8" y1="-8" x2="-8" y2="8" stroke="#ff8800" strokeWidth={tier === 2 ? 3 : 2} strokeLinecap="round" strokeDasharray="60" strokeDashoffset="60" opacity="0" />
          </svg>
        </div>
      );
    }
    case 2: { // Stone Cloak
      const w = tier === 2 ? 18 : 13;
      const h = tier === 2 ? 22 : 16;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: `${myBase.x}%`, top: `${myBase.y}%`,
              width: `${w}%`, height: `${h}%`,
              transform: "translate(-50%, -50%) scaleY(0.3)",
              border: `3px solid ${tier === 2 ? "#c8a44e" : "#a0c4ff"}`,
              boxShadow: `0 0 16px 6px ${tier === 2 ? "rgba(200,164,78,0.5)" : "rgba(160,196,255,0.4)"}`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 3: { // Ember Blast
      const sz = tier === 2 ? 140 : 100;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: `${enemyBase.x}%`, top: `${enemyBase.y}%`,
              width: sz, height: sz,
              transform: "translate(-50%, -50%) scale(0.1)",
              background: "radial-gradient(circle, rgba(255,100,20,0.9) 0%, rgba(255,50,10,0.6) 40%, transparent 100%)",
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 4: { // Hex
      const sz = tier === 2 ? 180 : 130;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%",
              width: sz, height: sz,
              transform: "translate(-50%, -50%) scale(0.3)",
              border: `3px solid ${tier === 2 ? "#ff3344" : "#cc2233"}`,
              boxShadow: `0 0 24px 10px ${tier === 2 ? "rgba(255,51,68,0.4)" : "rgba(204,34,51,0.3)"}`,
              opacity: 0,
            }}
          />
          <div
            ref={secondaryRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%",
              width: sz * 0.7, height: sz * 0.7,
              transform: "translate(-50%, -50%) scale(0.2)",
              border: `2px solid ${tier === 2 ? "#ff3344" : "#cc2233"}`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 5: { // Fortify
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute"
            style={{
              left: `${myBase.x}%`, top: `${myBase.y}%`,
              width: tier === 2 ? 8 : 5,
              height: tier === 2 ? 160 : 120,
              transform: "translate(-50%, -50%) scaleY(0.3)",
              background: `linear-gradient(to bottom, transparent, ${tier === 2 ? "#c8a44e" : "#a0c4ff"}, transparent)`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    default:
      return null;
  }
}
```

Wire each ability button to render the correct ability ID:
```tsx
{activeScene === "siege-sword" && (
  <AbilityScene abilityId={1} onComplete={() => setPlaying(false)} />
)}
{activeScene === "stone-cloak" && (
  <AbilityScene abilityId={2} onComplete={() => setPlaying(false)} />
)}
{activeScene === "ember-blast" && (
  <AbilityScene abilityId={3} onComplete={() => setPlaying(false)} />
)}
{activeScene === "hex" && (
  <AbilityScene abilityId={4} onComplete={() => setPlaying(false)} />
)}
{activeScene === "fortify" && (
  <AbilityScene abilityId={5} onComplete={() => setPlaying(false)} />
)}
```

- [ ] **Step 3: Test each ability in browser**

Click each ability button one at a time:
- **Siege Sword:** Two crossing slash lines draw in at gate 0 with gold/orange strokes
- **Stone Cloak:** Shield dome scales up around Player A's base with blue shimmer
- **Ember Blast:** Orange explosion burst scales out from Player B's base
- **Hex:** Red concentric ripples expand from the battlefield center, inner ring staggers behind
- **Fortify:** Vertical golden beam rises at Player A's base with spring settle

Verify each button replays when clicked again.

- [ ] **Step 4: Lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animations/abilityEffects.ts frontend/src/app/sandbox/animations/page.tsx
git commit -m "feat: ability effect animations for all 5 ability types

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 5: Vault Breach Animation

**Files:**
- Create: `frontend/src/lib/animations/vaultBreach.ts`
- Modify: `frontend/src/app/sandbox/animations/page.tsx`

The dramatic match-ending sequence: slow-mo final blow feeling, vault crumbles, screen flashes, victory/defeat banner.

- [ ] **Step 1: Create the vault breach animation module**

```typescript
// frontend/src/lib/animations/vaultBreach.ts
import { createTimeline } from "animejs";

export interface BreachElements {
  container: HTMLElement;
  vault: HTMLElement;
  flash: HTMLElement;
  banner: HTMLElement;
  bannerText: HTMLElement;
}

export function createBreachTimeline(
  els: BreachElements,
  isWinner: boolean,
  onComplete?: () => void,
) {
  const tl = createTimeline({ autoplay: false, onComplete });

  // Phase 1: Screen shake buildup (0ms)
  tl.add(els.container, {
    translateX: [0, -2, 3, -4, 5, -3, 4, -2, 0],
    translateY: [0, 1, -2, 3, -2, 2, -1, 1, 0],
    duration: 600,
    ease: "inOutQuad",
  }, 0);

  // Phase 2: Vault crumble — opacity drops, scale shrinks (200ms)
  tl.add(els.vault, {
    opacity: [1, 0.6, 0.2, 0],
    scale: [1, 0.95, 0.85],
    duration: 800,
    ease: "inQuad",
  }, 200);

  // Phase 3: Full screen flash (600ms)
  tl.add(els.flash, {
    opacity: [0, 0.8, 0],
    duration: 400,
    ease: "inOutQuad",
  }, 600);

  // Phase 4: Victory/defeat banner slides in (900ms)
  tl.add(els.banner, {
    opacity: [0, 1],
    scale: [0.8, 1.05, 1],
    duration: 500,
    ease: "outBack",
  }, 900);

  // Phase 5: Banner text fades in (1100ms)
  tl.add(els.bannerText, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 300,
    ease: "outQuad",
  }, 1100);

  return tl;
}
```

- [ ] **Step 2: Add VaultBreachScene to the sandbox page**

In `frontend/src/app/sandbox/animations/page.tsx`, add import:
```typescript
import { createBreachTimeline, type BreachElements } from "@/lib/animations/vaultBreach";
```

Add the component:
```tsx
function VaultBreachScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const bannerTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const vault = vaultRef.current;
    const flash = flashRef.current;
    const banner = bannerRef.current;
    const bannerText = bannerTextRef.current;
    if (!container || !vault || !flash || !banner || !bannerText) {
      onComplete();
      return;
    }
    const els: BreachElements = { container, vault, flash, banner, bannerText };
    const tl = createBreachTimeline(els, true, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Enemy vault that crumbles */}
      <div
        ref={vaultRef}
        className="absolute"
        style={{
          left: `${POSITIONS.baseB.x}%`,
          top: `${POSITIONS.baseB.y}%`,
          transform: "translate(-50%, -50%)",
          width: 60,
          height: 60,
          borderRadius: 8,
          background: "radial-gradient(circle, rgba(255,50,20,0.6) 0%, rgba(200,40,10,0.3) 60%, transparent 100%)",
          border: "2px solid rgba(255,80,30,0.5)",
        }}
      />
      {/* Full screen flash */}
      <div
        ref={flashRef}
        className="absolute inset-0"
        style={{ background: "rgba(255,220,150,0.8)", opacity: 0 }}
      />
      {/* Victory banner */}
      <div
        ref={bannerRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          background: "linear-gradient(135deg, #1a1714 0%, #2a2420 100%)",
          border: "2px solid #c8a44e",
          borderRadius: 8,
          padding: "20px 40px",
          opacity: 0,
          boxShadow: "0 0 40px rgba(200,164,78,0.3)",
        }}
      >
        <div
          ref={bannerTextRef}
          className="text-center"
          style={{ opacity: 0 }}
        >
          <div className="text-[#c8a44e] text-2xl font-serif tracking-wider">VICTORY</div>
          <div className="text-[#7a7060] text-xs mt-1">Enemy vault destroyed</div>
        </div>
      </div>
    </div>
  );
}
```

Wire it into scene rendering:
```tsx
{activeScene === "vault-breach" && (
  <VaultBreachScene onComplete={() => setPlaying(false)} />
)}
```

- [ ] **Step 3: Test in browser**

Click "Vault Breach". Verify:
- Battlefield shakes with increasing intensity
- Enemy vault area pulses and fades out
- Brief white-gold flash fills the screen
- "VICTORY" banner scales in with overshoot easing
- Banner text fades up after the banner appears

- [ ] **Step 4: Lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animations/vaultBreach.ts frontend/src/app/sandbox/animations/page.tsx
git commit -m "feat: vault breach animation with shake, crumble, flash, victory banner

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 6: Full Round Resolution Animation

**Files:**
- Create: `frontend/src/lib/animations/roundResolution.ts`
- Modify: `frontend/src/app/sandbox/animations/page.tsx`

The master timeline that composes troop march, gate clash, abilities, and effects into one cinematic sequence.

- [ ] **Step 1: Create the round resolution animation module**

This module composes the other animation modules into a single orchestrated timeline. It doesn't re-implement effects — it sequences them.

```typescript
// frontend/src/lib/animations/roundResolution.ts
import { createTimeline } from "animejs";

export interface RoundElements {
  container: HTMLElement;
  troopEls: HTMLElement[];
  troopTargets: { toX: number; toY: number }[];
  gateFlashEls: HTMLElement[];
  damageNumberEls: HTMLElement[];
  abilityEl: HTMLElement | SVGElement | null;
  abilitySecondaryEl: HTMLElement | SVGElement | null;
  nodeEls: HTMLElement[];
  vaultHpEl: HTMLElement | null;
}

export interface RoundConfig {
  abilityId: number;
  abilityTier: number;
  abilityType: number;
  gateDamages: { dmgToA: number; dmgToB: number }[];
  nodesChanged: boolean[];
  vaultHpFrom: number;
  vaultHpTo: number;
}

export function createRoundTimeline(
  els: RoundElements,
  config: RoundConfig,
  onComplete?: () => void,
) {
  const tl = createTimeline({ autoplay: false, onComplete });

  // Phase 1: Troop deploy (0ms–800ms)
  for (let i = 0; i < els.troopEls.length; i++) {
    const el = els.troopEls[i];
    const target = els.troopTargets[i];
    if (!el || !target) continue;
    tl.add(el, {
      left: `${target.toX}%`,
      top: `${target.toY}%`,
      opacity: [0.5, 1],
      duration: 500,
      ease: "outQuad",
    }, i * 60);
  }

  // Phase 2: Gate clash (800ms)
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.gateFlashEls[i]) continue;
    tl.add(els.gateFlashEls[i], {
      scale: [0.3, 1.5],
      opacity: [0.8, 0],
      duration: 400,
      ease: "outQuad",
    }, 800);
  }

  // Screen shake at impact
  tl.add(els.container, {
    translateX: [0, -3, 4, -2, 0],
    translateY: [0, 2, -3, 1, 0],
    duration: 250,
    ease: "inOutQuad",
  }, 850);

  // Damage numbers
  for (let i = 0; i < els.damageNumberEls.length; i++) {
    if (!els.damageNumberEls[i]) continue;
    tl.add(els.damageNumberEls[i], {
      translateY: [0, -36],
      opacity: [0, 1, 1, 0],
      duration: 800,
      ease: "outQuad",
    }, 1000 + i * 50);
  }

  // Phase 3: Node flips (1600ms)
  for (let i = 0; i < 3; i++) {
    if (!config.nodesChanged[i] || !els.nodeEls[i]) continue;
    tl.add(els.nodeEls[i], {
      scale: [1, 1.5, 1],
      opacity: [0, 1, 0.8],
      duration: 500,
      ease: "outQuad",
    }, 1600);
  }

  // Phase 4: Ability effect (2200ms)
  if (els.abilityEl && config.abilityId > 0) {
    const abilityType = config.abilityType;
    if (abilityType === 3) {
      // Ember blast
      tl.add(els.abilityEl, {
        scale: [0.1, 1.5, 1.8],
        opacity: [0.9, 0.7, 0],
        duration: 700,
        ease: "outExpo",
      }, 2200);
    } else if (abilityType === 1) {
      // Slash
      tl.add(els.abilityEl, {
        strokeDashoffset: [60, 0],
        opacity: [0.9, 1, 0],
        duration: 600,
        ease: "outQuad",
      }, 2200);
      if (els.abilitySecondaryEl) {
        tl.add(els.abilitySecondaryEl, {
          strokeDashoffset: [60, 0],
          opacity: [0.9, 1, 0],
          duration: 600,
          ease: "outQuad",
        }, 2280);
      }
    } else if (abilityType === 2) {
      // Shield
      tl.add(els.abilityEl, {
        scaleY: [0.3, 1.1, 1],
        opacity: [0, 0.8, 0],
        duration: 800,
        ease: "outQuad",
      }, 2200);
    } else if (abilityType === 4) {
      // Hex ripple
      tl.add(els.abilityEl, {
        scale: [0.3, 1.5, 2.2],
        opacity: [0.5, 0.3, 0],
        duration: 800,
        ease: "outQuad",
      }, 2200);
    } else if (abilityType === 5) {
      // Fortify beam
      tl.add(els.abilityEl, {
        scaleY: [0.3, 1.3, 1.0],
        opacity: [0, 0.9, 0],
        duration: 700,
        ease: "outQuad",
      }, 2200);
    }
  }

  // Phase 5: Vault HP drain text (3000ms)
  if (els.vaultHpEl) {
    tl.add(els.vaultHpEl, {
      scale: [1, 1.2, 1],
      opacity: [1, 0.5, 1],
      duration: 400,
      ease: "inOutQuad",
    }, 3000);
  }

  return tl;
}
```

- [ ] **Step 2: Add FullRoundScene to the sandbox page**

In `frontend/src/app/sandbox/animations/page.tsx`, add import:
```typescript
import { createRoundTimeline, type RoundElements, type RoundConfig } from "@/lib/animations/roundResolution";
```

Add the component:
```tsx
function FullRoundScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const abilityRef = useRef<HTMLDivElement | null>(null);
  const hpRef = useRef<HTMLDivElement | null>(null);

  const marchGroups = getMarchGroups();
  const base = POSITIONS.baseA;

  const dmgNumbers: { gateIndex: number; value: number; color: string; variant: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = MOCK_RESULT.gateBreakdown[i];
    if (gate.dmgToB > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToB, color: "#4ade80", variant: "dealt" });
    if (gate.dmgToA > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToA, color: "#ef4444", variant: "taken" });
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { onComplete(); return; }

    const roundEls: RoundElements = {
      container,
      troopEls: troopRefs.current.filter(Boolean) as HTMLElement[],
      troopTargets: marchGroups.map((g) => ({ toX: g.toX, toY: g.toY })),
      gateFlashEls: gateRefs.current.filter(Boolean) as HTMLElement[],
      damageNumberEls: dmgRefs.current.filter(Boolean) as HTMLElement[],
      abilityEl: abilityRef.current,
      abilitySecondaryEl: null,
      nodeEls: nodeRefs.current.filter(Boolean) as HTMLElement[],
      vaultHpEl: hpRef.current,
    };
    const config: RoundConfig = {
      abilityId: MOCK_RESULT.aAbilityId,
      abilityTier: 1,
      abilityType: ((MOCK_RESULT.aAbilityId - 1) % 5) + 1,
      gateDamages: MOCK_RESULT.gateBreakdown,
      nodesChanged: [
        MOCK_PREV_NODES[0] !== MOCK_NEW_NODES[0],
        MOCK_PREV_NODES[1] !== MOCK_NEW_NODES[1],
        MOCK_PREV_NODES[2] !== MOCK_NEW_NODES[2],
      ],
      vaultHpFrom: 42,
      vaultHpTo: 38,
    };
    const tl = createRoundTimeline(roundEls, config, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Troop sprites starting at base */}
      {marchGroups.map((g, i) => (
        <div
          key={`round-troop-${i}`}
          ref={(el) => { troopRefs.current[i] = el; }}
          className="absolute pointer-events-none"
          style={{
            left: `${base.x}%`, top: `${base.y}%`,
            transform: "translate(-50%, -50%)", width: "7%", opacity: 0.5,
          }}
        >
          <Image
            src={TROOP_SPRITES[g.type]["a"]}
            alt={g.type} width={64} height={64}
            className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />
        </div>
      ))}

      {/* Gate flashes */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`round-gate-${i}`}
          ref={(el) => { gateRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 80, height: 80,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: "radial-gradient(circle, rgba(255,200,80,0.8) 0%, rgba(255,80,20,0.5) 50%, transparent 100%)",
            opacity: 0,
          }}
        />
      ))}

      {/* Damage numbers */}
      {dmgNumbers.map((d, i) => {
        const pos = POSITIONS.gates[d.gateIndex];
        const offsetX = d.variant === "dealt" ? -16 : 16;
        return (
          <div
            key={`round-dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-sm select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`, top: `${pos.y}%`,
              transform: "translate(-50%, 0)", color: d.color, opacity: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}

      {/* Node flip markers */}
      {POSITIONS.nodes.map((pos, i) => (
        <div
          key={`round-node-${i}`}
          ref={(el) => { nodeRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 36, height: 36,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${MOCK_NEW_NODES[i] === "teamA" ? "#c8a44e" : "#ef4444"}99 0%, transparent 70%)`,
            border: `2px solid ${MOCK_NEW_NODES[i] === "teamA" ? "#c8a44e" : "#ef4444"}`,
            opacity: 0,
          }}
        />
      ))}

      {/* Ability effect — Siege Sword (ability 1) at gate 0 */}
      <div
        ref={abilityRef}
        className="absolute rounded-full"
        style={{
          left: `${POSITIONS.gates[0].x}%`, top: `${POSITIONS.gates[0].y}%`,
          width: 80, height: 80,
          transform: "translate(-50%, -50%) scale(0.1)",
          background: "radial-gradient(circle, rgba(218,165,32,0.8) 0%, rgba(255,136,0,0.4) 50%, transparent 100%)",
          opacity: 0,
        }}
      />

      {/* Vault HP indicator */}
      <div
        ref={hpRef}
        className="absolute font-mono font-bold text-lg"
        style={{
          left: `${POSITIONS.baseB.x}%`, top: `${POSITIONS.baseB.y - 12}%`,
          transform: "translateX(-50%)",
          color: "#ef4444",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        -4 HP
      </div>
    </div>
  );
}
```

Wire it into scene rendering:
```tsx
{activeScene === "full-round" && (
  <FullRoundScene onComplete={() => setPlaying(false)} />
)}
```

- [ ] **Step 3: Test in browser**

Click "Full Round". Verify the full cinematic sequence:
- 0–800ms: Troops march from base to positions with stagger
- 800–1200ms: Gate flashes fire, screen shakes, damage numbers float up
- 1600–2100ms: Node ownership markers pulse
- 2200–2900ms: Ability effect plays (Siege Sword flash at gate 0)
- 3000–3400ms: "-4 HP" text pulses at enemy vault
- Total duration ~3.5s, then animation completes

- [ ] **Step 4: Lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animations/roundResolution.ts frontend/src/app/sandbox/animations/page.tsx
git commit -m "feat: full round resolution animation composing all sub-animations

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 7: Final Cleanup and Build Verification

**Files:**
- Modify: `frontend/src/app/sandbox/animations/page.tsx` (cleanup unused placeholder)

- [ ] **Step 1: Remove the fallback TODO placeholder**

In `page.tsx`, remove or confirm there is no remaining "TODO" fallback text for unimplemented scenes. All 9 buttons should now have scene components. The remaining `activeScene !== "idle"` block with "TODO" text can be removed — every scene is handled.

- [ ] **Step 2: Run full build**

```bash
cd frontend && bun run build
```

Expected: Build succeeds with no errors. The sandbox page is included in the build but that's fine — it's a dev tool.

- [ ] **Step 3: Run lint**

```bash
cd frontend && bun run lint
```

- [ ] **Step 4: Verify all 9 scenes work end-to-end**

Open `http://localhost:3000/sandbox/animations` and click each button in order:
1. Troop March — troops spring from base to positions
2. Gate Clash — flash, shake, damage numbers
3. Full Round — complete cinematic sequence
4. Siege Sword — slash lines at gate
5. Stone Cloak — shield dome at base
6. Ember Blast — explosion at enemy base
7. Hex — ripple rings from center
8. Fortify — golden beam at base
9. Vault Breach — shake, crumble, flash, victory banner

Each should replay on re-click. No console errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete animation sandbox with all 9 scenes

Co-authored-by: Claude <noreply@anthropic.com>"
```
