# Battle Animation Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ResolutionOverlay` with a new `BattleAnimation` component that uses the anime.js timeline factories from `lib/animations/`, driven by real `RoundResult1v1` data, in both the match and spectator pages.

**Architecture:** A single new component `BattleAnimation` converts `RoundResult1v1` into troop positions, damage values, ability IDs, and node changes, then builds DOM elements and plays `createRoundTimeline()`. It renders as `children` of `BattlefieldView` (which already accepts a `children` prop). The match and spectator pages swap imports and move the animation inside `BattlefieldView`. The sandbox directory is deleted.

**Tech Stack:** React 19, anime.js 4.4.1, Next.js 16, existing `lib/animations/` modules.

---

### Task 1: Create BattleAnimation Component

**Files:**
- Create: `frontend/src/components/BattleAnimation.tsx`

This is the core task. The component takes real game data and renders the full round resolution animation. It's adapted from the sandbox's `FullRoundScene` but parameterized with real data instead of mock constants.

- [ ] **Step 1: Create the component file**

```tsx
// frontend/src/components/BattleAnimation.tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { POSITIONS } from "./BattlefieldView";
import { createRoundTimeline, type RoundElements, type RoundConfig } from "@/lib/animations/roundResolution";
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";

interface BattleAnimationProps {
  result: RoundResult1v1;
  prevNodes: [NodeOwner, NodeOwner, NodeOwner];
  newNodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  heldHp: { a: number; b: number };
  onComplete: () => void;
}

const TROOP_SPRITES: Record<string, Record<string, string>> = {
  attack: { a: "/sprites/troops/troop_attacka.png", b: "/sprites/troops/troop_attackb.png" },
  defense: { a: "/sprites/troops/troop_defensea.png", b: "/sprites/troops/troop_defenseb.png" },
};

const TROOP_TYPE_DELAY: Record<string, number> = {
  attack: 0,
  defense: 200,
};

const SPARK_DIRECTIONS = [
  { x: -30, y: -25 },
  { x: 25, y: -35 },
  { x: 35, y: 20 },
  { x: -20, y: 30 },
  { x: 15, y: -40 },
];

const ABILITY_ICONS: Record<number, string> = {
  1: "/sprites/abilities/siege-sword.svg",
  2: "/sprites/abilities/stone-cloak.svg",
  3: "/sprites/abilities/ember-blast.svg",
  4: "/sprites/abilities/hex.svg",
  5: "/sprites/abilities/fortify.svg",
};

interface MarchGroup {
  type: "attack" | "defense";
  team: "a" | "b";
  count: number;
  toX: number;
  toY: number;
}

function getAttackPos(team: "a" | "b") {
  const target = team === "a" ? POSITIONS.baseB : POSITIONS.baseA;
  return POSITIONS.gates.map((g, i) => {
    if (i === 2) return { x: target.x + (team === "a" ? -8 : 8), y: 48 };
    return { x: target.x, y: g.y };
  });
}

function getDefensePos(team: "a" | "b") {
  const base = team === "a" ? POSITIONS.baseA : POSITIONS.baseB;
  return POSITIONS.gates.map((g, i) => {
    if (i === 2) return { x: base.x + (team === "a" ? 8 : -8), y: 48 };
    return { x: base.x + (team === "a" ? 5 : -5), y: g.y };
  });
}

function buildMarchGroups(result: RoundResult1v1, isPlayerA: boolean): MarchGroup[] {
  const groups: MarchGroup[] = [];

  const myTeam: "a" | "b" = isPlayerA ? "a" : "b";
  const enemyTeam: "a" | "b" = isPlayerA ? "b" : "a";
  const myAttack = isPlayerA ? result.aAttack : result.bAttack;
  const myDefense = isPlayerA ? result.aDefense : result.bDefense;
  const enemyAttack = isPlayerA ? result.bAttack : result.aAttack;
  const enemyDefense = isPlayerA ? result.bDefense : result.aDefense;

  const myAtkPos = getAttackPos(myTeam);
  const myDefPos = getDefensePos(myTeam);
  const enemyAtkPos = getAttackPos(enemyTeam);
  const enemyDefPos = getDefensePos(enemyTeam);

  for (let i = 0; i < 3; i++) {
    if (myAttack[i] > 0)
      groups.push({ type: "attack", team: myTeam, count: myAttack[i], toX: myAtkPos[i].x, toY: myAtkPos[i].y });
  }
  for (let i = 0; i < 3; i++) {
    if (myDefense[i] > 0)
      groups.push({ type: "defense", team: myTeam, count: myDefense[i], toX: myDefPos[i].x, toY: myDefPos[i].y });
  }
  for (let i = 0; i < 3; i++) {
    if (enemyAttack[i] > 0)
      groups.push({ type: "attack", team: enemyTeam, count: enemyAttack[i], toX: enemyAtkPos[i].x, toY: enemyAtkPos[i].y });
  }
  for (let i = 0; i < 3; i++) {
    if (enemyDefense[i] > 0)
      groups.push({ type: "defense", team: enemyTeam, count: enemyDefense[i], toX: enemyDefPos[i].x, toY: enemyDefPos[i].y });
  }

  return groups;
}

export function BattleAnimation({
  result,
  prevNodes,
  newNodes,
  isPlayerA,
  heldHp,
  onComplete,
}: BattleAnimationProps) {
  const completedRef = useRef(false);
  const complete = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [onComplete]);

  const containerRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const whiteFlashRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRefs = useRef<(HTMLDivElement | null)[][]>([[], [], []]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeBurstRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hpRefA = useRef<HTMLDivElement | null>(null);
  const hpRefB = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<ReturnType<typeof createRoundTimeline> | null>(null);

  const marchGroups = buildMarchGroups(result, isPlayerA);
  const myBase = isPlayerA ? POSITIONS.baseA : POSITIONS.baseB;
  const enemyBase = isPlayerA ? POSITIONS.baseB : POSITIONS.baseA;

  const dmgDealt = isPlayerA ? result.damageToB : result.damageToA;
  const dmgTaken = isPlayerA ? result.damageToA : result.damageToB;

  const dmgNumbers: { gateIndex: number; value: number; color: string; variant: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const dealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
    const taken = isPlayerA ? gate.dmgToA : gate.dmgToB;
    if (dealt > 0) dmgNumbers.push({ gateIndex: i, value: dealt, color: "#4ade80", variant: "dealt" });
    if (taken > 0) dmgNumbers.push({ gateIndex: i, value: taken, color: "#ef4444", variant: "taken" });
  }

  const myAbilityId = isPlayerA ? result.aAbilityId : result.bAbilityId;
  const myAbilityTarget = isPlayerA ? result.aAbilityTarget : result.bAbilityTarget;

  const nodesChanged = [
    prevNodes[0] !== newNodes[0],
    prevNodes[1] !== newNodes[1],
    prevNodes[2] !== newNodes[2],
  ];

  const nodeIsMine = (i: number) => {
    const myTeam = isPlayerA ? "teamA" : "teamB";
    return newNodes[i] === myTeam;
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }

    const container = containerRef.current;
    if (!container) { complete(); return; }

    const roundEls: RoundElements = {
      container,
      vignetteEl: vignetteRef.current,
      troopEls: troopRefs.current.filter(Boolean) as HTMLElement[],
      troopTargets: marchGroups.map((g) => ({
        toX: g.toX,
        toY: g.toY,
        delay: TROOP_TYPE_DELAY[g.type] ?? 0,
      })),
      gateFlashEls: gateRefs.current.filter(Boolean) as HTMLElement[],
      whiteFlashEls: whiteFlashRefs.current.filter(Boolean) as HTMLElement[],
      ringEls: ringRefs.current.filter(Boolean) as HTMLElement[],
      sparkEls: sparkRefs.current.map((arr) => arr.filter(Boolean) as HTMLElement[]),
      damageNumberEls: dmgRefs.current.filter(Boolean) as HTMLElement[],
      abilityEl: null,
      abilitySecondaryEl: null,
      nodeEls: nodeRefs.current.filter(Boolean) as HTMLElement[],
      nodeBurstEls: nodeBurstRefs.current.filter(Boolean) as HTMLElement[],
      vaultHpElA: hpRefA.current,
      vaultHpElB: hpRefB.current,
    };
    const config: RoundConfig = {
      abilityId: myAbilityId,
      abilityTier: myAbilityId > 0 ? Math.floor((myAbilityId - 1) / 5) + 1 : 0,
      abilityType: myAbilityId > 0 ? ((myAbilityId - 1) % 5) + 1 : 0,
      gateDamages: result.gateBreakdown,
      nodesChanged,
      vaultAHpFrom: heldHp.a,
      vaultAHpTo: heldHp.a - result.damageToA,
      vaultBHpFrom: heldHp.b,
      vaultBHpTo: heldHp.b - result.damageToB,
    };
    const tl = createRoundTimeline(roundEls, config, complete);
    tlRef.current = tl;
    tl.play();

    return () => {
      tl.pause();
      complete();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = () => {
    tlRef.current?.pause();
    complete();
  };

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Dark cinematic vignette */}
      <div
        ref={vignetteRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          opacity: 0,
        }}
      />

      {/* Skip button */}
      <button
        className="absolute top-2 right-2 text-[10px] tracking-widest text-[#d4cfc6]/60 hover:text-[#d4cfc6] font-mono uppercase border border-[#3d3428]/60 px-2 py-0.5 rounded transition-colors"
        style={{ pointerEvents: "auto", zIndex: 30 }}
        onClick={handleSkip}
      >
        SKIP
      </button>

      {/* Troop sprites starting at their base */}
      {marchGroups.map((g, i) => {
        const base = g.team === "a" ? POSITIONS.baseA : POSITIONS.baseB;
        return (
          <div
            key={`troop-${i}`}
            ref={(el) => { troopRefs.current[i] = el; }}
            className="absolute pointer-events-none"
            style={{
              left: `${base.x}%`, top: `${base.y}%`,
              transform: "translate(-50%, -50%)", width: "7%", opacity: 0.5,
            }}
          >
            <Image
              src={TROOP_SPRITES[g.type][g.team]}
              alt={g.type} width={64} height={64}
              className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
            />
          </div>
        );
      })}

      {/* White flash on impact */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`white-${i}`}
          ref={(el) => { whiteFlashRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.5)",
            background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 40%, transparent 70%)",
            opacity: 0,
          }}
        />
      ))}

      {/* Ring shockwaves */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`ring-${i}`}
          ref={(el) => { ringRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.3)",
            border: "2px solid rgba(255,255,255,0.7)",
            opacity: 0,
          }}
        />
      ))}

      {/* Sparks per gate */}
      {POSITIONS.gates.map((pos, gateIdx) =>
        SPARK_DIRECTIONS.map((_, sparkIdx) => (
          <div
            key={`spark-${gateIdx}-${sparkIdx}`}
            ref={(el) => {
              if (!sparkRefs.current[gateIdx]) sparkRefs.current[gateIdx] = [];
              sparkRefs.current[gateIdx][sparkIdx] = el;
            }}
            className="absolute rounded-full"
            style={{
              left: `${pos.x}%`, top: `${pos.y}%`,
              width: 4, height: 4,
              transform: "translate(-50%, -50%)",
              background: "rgba(255,200,80,0.9)",
              opacity: 0,
              willChange: "transform",
            }}
          />
        ))
      )}

      {/* Orange gate flashes */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`gate-${i}`}
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
        const offsetX = d.variant === "dealt" ? -20 : 20;
        return (
          <div
            key={`dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-lg select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`, top: `${pos.y}%`,
              transform: "translate(-50%, 0) scale(0.5)", color: d.color, opacity: 0,
              textShadow: "0 2px 6px rgba(0,0,0,0.9)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}

      {/* Nodes */}
      {POSITIONS.nodes.map((pos, i) => (
        <div
          key={`node-${i}`}
          ref={(el) => { nodeRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 36, height: 36,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${nodeIsMine(i) ? "#c8a44e" : "#ef4444"}99 0%, transparent 70%)`,
            border: `2px solid ${nodeIsMine(i) ? "#c8a44e" : "#ef4444"}`,
            opacity: 0,
          }}
        />
      ))}

      {/* Node burst elements */}
      {POSITIONS.nodes.map((pos, i) => (
        <div
          key={`node-burst-${i}`}
          ref={(el) => { nodeBurstRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: `radial-gradient(circle, ${nodeIsMine(i) ? "rgba(200,164,78,0.8)" : "rgba(239,68,68,0.8)"} 0%, transparent 70%)`,
            opacity: 0,
          }}
        />
      ))}

      {/* Vault HP — player A */}
      <div
        ref={hpRefA}
        className="absolute font-mono font-bold text-lg"
        style={{
          left: `${POSITIONS.baseA.x}%`, top: `${POSITIONS.baseA.y - 12}%`,
          transform: "translateX(-50%)",
          color: "#ef4444",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        {heldHp.a} HP
      </div>

      {/* Vault HP — player B */}
      <div
        ref={hpRefB}
        className="absolute font-mono font-bold text-lg"
        style={{
          left: `${POSITIONS.baseB.x}%`, top: `${POSITIONS.baseB.y - 12}%`,
          transform: "translateX(-50%)",
          color: "#ef4444",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        {heldHp.b} HP
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint and type check**

```bash
cd frontend && npx eslint src/components/BattleAnimation.tsx && npx tsc --noEmit
```

Expected: Only the `<img>` warning (if ability icons are added later), zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BattleAnimation.tsx
git commit -m "feat: add BattleAnimation component for live match resolution

Converts real RoundResult1v1 data into troop positions, damage values,
and node changes, then plays the full round animation timeline.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 2: Wire BattleAnimation into Match Page

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Swap the import**

Replace:
```typescript
import { ResolutionOverlay } from "@/components/ResolutionOverlay";
```
With:
```typescript
import { BattleAnimation } from "@/components/BattleAnimation";
```

- [ ] **Step 2: Move the animation inside BattlefieldView as children**

Find the `BattlefieldView` and `ResolutionOverlay` block (around lines 750-765):
```tsx
            <BattlefieldView
              allocations={allocations}
              isPlayerA={isPlayerA}
              committed={effectiveCommitted}
              modifiers={modifiers}
              opponentAllocations={opponentAllocations}
            />
            {pendingResult && (
              <ResolutionOverlay
                result={pendingResult}
                prevNodes={prevNodes}
                newNodes={state.nodes}
                isPlayerA={isPlayerA}
                onComplete={handleResolutionComplete}
              />
            )}
```

Replace with:
```tsx
            <BattlefieldView
              allocations={allocations}
              isPlayerA={isPlayerA}
              committed={effectiveCommitted}
              modifiers={modifiers}
              opponentAllocations={opponentAllocations}
            >
              {pendingResult && heldHp && (
                <BattleAnimation
                  result={pendingResult}
                  prevNodes={prevNodes}
                  newNodes={state.nodes}
                  isPlayerA={isPlayerA}
                  heldHp={heldHp}
                  onComplete={handleResolutionComplete}
                />
              )}
            </BattlefieldView>
```

- [ ] **Step 3: Run lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

Expected: No new errors. `ResolutionOverlay` import removed so its old warnings vanish.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: wire BattleAnimation into match-1v1 page

Replaces ResolutionOverlay with BattleAnimation rendered as children
of BattlefieldView so the overlay aligns with the 16:9 area.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: Wire BattleAnimation into Spectator Page

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/spectate/page.tsx`

- [ ] **Step 1: Swap the import**

Replace:
```typescript
import { ResolutionOverlay } from "@/components/ResolutionOverlay";
```
With:
```typescript
import { BattleAnimation } from "@/components/BattleAnimation";
```

- [ ] **Step 2: Move the animation inside BattlefieldView as children**

Find the `BattlefieldView` and `ResolutionOverlay` block (around lines 384-399):
```tsx
            <BattlefieldView
              allocations={aAllocations}
              isPlayerA={true}
              committed={true}
              modifiers={modifiers}
              opponentAllocations={bAllocations}
            />
            {pendingResult && (
              <ResolutionOverlay
                result={pendingResult}
                prevNodes={prevNodes}
                newNodes={state.nodes}
                isPlayerA={true}
                onComplete={handleResolutionComplete}
              />
            )}
```

Replace with:
```tsx
            <BattlefieldView
              allocations={aAllocations}
              isPlayerA={true}
              committed={true}
              modifiers={modifiers}
              opponentAllocations={bAllocations}
            >
              {pendingResult && heldHp && (
                <BattleAnimation
                  result={pendingResult}
                  prevNodes={prevNodes}
                  newNodes={state.nodes}
                  isPlayerA={true}
                  heldHp={heldHp}
                  onComplete={handleResolutionComplete}
                />
              )}
            </BattlefieldView>
```

- [ ] **Step 3: Run lint and type check**

```bash
cd frontend && bun run lint && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/spectate/page.tsx
git commit -m "feat: wire BattleAnimation into spectator page

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 4: Delete Sandbox and Build Verification

**Files:**
- Delete: `frontend/src/app/sandbox/animations/page.tsx`
- Delete: `frontend/src/app/sandbox/animations/mockData.ts`

- [ ] **Step 1: Delete sandbox files**

```bash
rm -rf frontend/src/app/sandbox/animations
```

- [ ] **Step 2: Run full build**

```bash
cd frontend && bun run build
```

Expected: Build succeeds. `/sandbox/animations` no longer appears in the route list. Both `match-1v1/[id]` and `match-1v1/[id]/spectate` routes still build.

- [ ] **Step 3: Run lint**

```bash
cd frontend && bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove animation sandbox, clean up unused files

The sandbox served its purpose for prototyping. Animation modules in
lib/animations/ are now production code used by BattleAnimation.

Co-authored-by: Claude <noreply@anthropic.com>"
```
