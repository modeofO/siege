> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Battle Resolution Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ~1.5s simultaneous-burst animation overlay on round resolution in 1v1 matches — gate impacts, floating damage numbers, node flips, trap detonations, and 5 distinct ability effects.

**Architecture:** A `<ResolutionOverlay>` component mounts as a sibling over `BattlefieldView` when a new round resolves. An orchestrator module (`animationEffects.ts`) builds anime.js timelines for each effect layer. The match page holds off HP/node state updates until the overlay completes, then existing CSS transitions take over.

**Tech Stack:** anime.js v4.4.1 (exact pin, audited), CSS keyframes, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-21-battle-resolution-animation-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `frontend/src/lib/animationEffects.ts` (new) | Pure functions that build anime.js timeline configs for each effect type. No React, no DOM — returns configuration objects. |
| `frontend/src/components/ResolutionOverlay.tsx` (new) | Renders SVG/CSS effect elements positioned over the battlefield, runs the anime.js timeline, handles skip + reduced-motion. |
| `frontend/src/components/BattlefieldView.tsx` (modify) | Export `POSITIONS` constant (currently module-internal). |
| `frontend/src/app/globals.css` (modify) | Add keyframes for gate-flash, float-up, ring-expand, ability-specific effects. |
| `frontend/src/app/match-1v1/[id]/page.tsx` (modify) | Intercept round resolution, hold HP state, mount/unmount overlay. |
| `frontend/src/app/match-1v1/[id]/spectate/page.tsx` (modify) | Same overlay integration for spectators. |
| `frontend/src/lib/__tests__/animationEffects.test.ts` (new) | Unit tests for the pure config-builder functions. |

---

### Task 1: Audit and install anime.js

**Files:**
- Modify: `frontend/package.json`

This is the security gate. Every sub-step must pass before proceeding.

- [ ] **Step 1: Download the tarball without installing**

```bash
cd frontend && npm pack animejs@4.4.1
```

This downloads `animejs-4.4.1.tgz` into `frontend/` without installing anything.

- [ ] **Step 2: Inspect package.json inside the tarball for install scripts and dependencies**

```bash
tar -xzf animejs-4.4.1.tgz -O package/package.json | python3 -c "
import json, sys
pkg = json.load(sys.stdin)
scripts = pkg.get('scripts', {})
hooks = {k: v for k, v in scripts.items() if k in ('preinstall','install','postinstall','preuninstall','uninstall','postuninstall')}
deps = pkg.get('dependencies', {})
print('Install hooks:', hooks if hooks else 'NONE (good)')
print('Dependencies:', deps if deps else 'NONE (good)')
print('Maintainers:', [m.get('name','?') for m in pkg.get('maintainers', pkg.get('contributors', []))])
print('Repository:', pkg.get('repository', 'not set'))
"
```

Expected: Install hooks = NONE, Dependencies = NONE. If either has entries, **stop and fall back to pure CSS**.

- [ ] **Step 3: Verify npm artifact matches GitHub source**

```bash
npm view animejs@4.4.1 dist.shasum
# Note the shasum

# Compare key source file against GitHub
tar -xzf animejs-4.4.1.tgz -O package/lib/anime.min.js | wc -c
# Cross-reference with the GitHub release at juliangarnier/anime
```

If the repository field doesn't point to `juliangarnier/anime`, **stop and fall back**.

- [ ] **Step 4: Install with exact pin**

```bash
npm install animejs@4.4.1 --save-exact
```

- [ ] **Step 5: Verify lock integrity**

```bash
grep -A5 '"animejs"' package-lock.json
# Confirm: version is exactly "4.4.1", no caret/tilde, integrity hash present
```

- [ ] **Step 6: Clean up tarball**

```bash
rm -f animejs-4.4.1.tgz
rm -rf package/
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add animejs@4.4.1 (exact pin, audited)

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 2: Export POSITIONS from BattlefieldView

**Files:**
- Modify: `frontend/src/components/BattlefieldView.tsx:31-47`

- [ ] **Step 1: Export the POSITIONS constant**

In `frontend/src/components/BattlefieldView.tsx`, change line 31 from:

```typescript
const POSITIONS = {
```

to:

```typescript
export const POSITIONS = {
```

No other changes to BattlefieldView.

- [ ] **Step 2: Verify the app still compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BattlefieldView.tsx
git commit -m "refactor: export POSITIONS from BattlefieldView for overlay alignment

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: Add CSS keyframes for resolution effects

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add keyframes at the end of globals.css**

Append the following after the existing keyframe definitions (after the `animate-damage` block, around line 56):

```css
/* === Resolution overlay effects === */

@keyframes resolution-gate-flash {
  0% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(0.3);
  }
  30% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.5);
  }
}

@keyframes resolution-float-up {
  0% {
    opacity: 0;
    transform: translate(-50%, 0);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, -4px);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -24px);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -36px);
  }
}

@keyframes resolution-node-bounce {
  0% {
    transform: translate(-50%, -50%) scale(1);
  }
  40% {
    transform: translate(-50%, -50%) scale(1.4);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes resolution-trap-ring {
  0% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(0.2);
  }
  60% {
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.4);
  }
}

@keyframes resolution-slash {
  0% {
    stroke-dashoffset: 60;
    opacity: 0.9;
  }
  50% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

@keyframes resolution-shield-shimmer {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(0.3);
  }
  30% {
    opacity: 0.7;
    transform: translate(-50%, -50%) scaleY(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(1);
  }
}

@keyframes resolution-ember-burst {
  0% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(0.1);
  }
  40% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.8);
  }
}

@keyframes resolution-hex-ripple {
  0% {
    opacity: 0.3;
    transform: translate(-50%, -50%) scale(0.5);
  }
  50% {
    opacity: 0.2;
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2);
  }
}

@keyframes resolution-fortify-glow {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(0.5);
  }
  30% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scaleY(1.2);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scaleY(1);
  }
}

@keyframes resolution-fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "style: add CSS keyframes for resolution overlay effects

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 4: Build animation config functions (with tests)

**Files:**
- Create: `frontend/src/lib/animationEffects.ts`
- Create: `frontend/src/lib/__tests__/animationEffects.test.ts`

These are pure functions that take round result data and return arrays of effect descriptors. No DOM access, no React — just data transformation. This makes them testable with vitest in the existing node environment.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/animationEffects.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildGateImpacts,
  buildDamageNumbers,
  buildNodeFlips,
  buildTrapEffects,
  buildAbilityEffect,
  type EffectDescriptor,
} from "../animationEffects";
import type { RoundResult1v1 } from "../gameState1v1";
import type { NodeOwner } from "../gameState1v1";

const baseResult: RoundResult1v1 = {
  round: 1,
  aAttack: [3, 2, 1],
  aDefense: [2, 1, 0],
  bAttack: [1, 2, 3],
  bDefense: [0, 1, 2],
  damageToA: 3,
  damageToB: 5,
  modifiers: [0, 0, 0],
  gateBreakdown: [
    { gate: 0, modifier: 0, attackA: 3, defenseA: 2, attackB: 1, defenseB: 0, dmgToA: 0, dmgToB: 3 },
    { gate: 1, modifier: 0, attackA: 2, defenseA: 1, attackB: 2, defenseB: 1, dmgToA: 1, dmgToB: 1 },
    { gate: 2, modifier: 0, attackA: 1, defenseA: 0, attackB: 3, defenseB: 2, dmgToA: 2, dmgToB: 0 },
  ],
  aTraps: [0, 0, 0],
  bTraps: [0, 0, 0],
  trapDmgToA: 0,
  trapDmgToB: 0,
  aAbilityId: 0,
  aAbilityTarget: 0,
  bAbilityId: 0,
  bAbilityTarget: 0,
};

describe("buildGateImpacts", () => {
  it("creates effects only for gates with damage", () => {
    const effects = buildGateImpacts(baseResult, true);
    const nonZero = effects.filter((e) => e.type === "gate-flash");
    expect(nonZero.length).toBe(2);
    expect(nonZero[0].gateIndex).toBe(0);
    expect(nonZero[1].gateIndex).toBe(1);
  });

  it("skips gates with zero damage", () => {
    const zeroDmgResult: RoundResult1v1 = {
      ...baseResult,
      gateBreakdown: [
        { gate: 0, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
        { gate: 1, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
        { gate: 2, modifier: 0, attackA: 0, defenseA: 0, attackB: 0, defenseB: 0, dmgToA: 0, dmgToB: 0 },
      ],
    };
    const effects = buildGateImpacts(zeroDmgResult, true);
    expect(effects).toHaveLength(0);
  });

  it("scales intensity by damage amount", () => {
    const effects = buildGateImpacts(baseResult, true);
    const gate0 = effects.find((e) => e.gateIndex === 0)!;
    const gate1 = effects.find((e) => e.gateIndex === 1)!;
    expect(gate0.intensity).toBeGreaterThan(gate1.intensity);
  });
});

describe("buildDamageNumbers", () => {
  it("creates per-gate damage numbers for dealt and taken", () => {
    const effects = buildDamageNumbers(baseResult, true);
    const dealt = effects.filter((e) => e.variant === "dealt");
    const taken = effects.filter((e) => e.variant === "taken");
    expect(dealt.length).toBeGreaterThan(0);
    expect(taken.length).toBeGreaterThan(0);
  });

  it("creates no numbers for zero total damage", () => {
    const noDmg: RoundResult1v1 = {
      ...baseResult,
      damageToA: 0,
      damageToB: 0,
      gateBreakdown: baseResult.gateBreakdown.map((g) => ({ ...g, dmgToA: 0, dmgToB: 0 })),
    };
    const effects = buildDamageNumbers(noDmg, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildNodeFlips", () => {
  it("creates effects only for nodes that changed ownership", () => {
    const prevNodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "teamA", "neutral"];
    const newNodes: [NodeOwner, NodeOwner, NodeOwner] = ["teamA", "teamA", "teamB"];
    const effects = buildNodeFlips(prevNodes, newNodes, true);
    expect(effects).toHaveLength(2);
    expect(effects[0].nodeIndex).toBe(0);
    expect(effects[1].nodeIndex).toBe(2);
  });

  it("creates no effects when nodes stay the same", () => {
    const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["teamA", "neutral", "teamB"];
    const effects = buildNodeFlips(nodes, nodes, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildTrapEffects", () => {
  it("creates trap ring + damage number for active traps", () => {
    const result: RoundResult1v1 = {
      ...baseResult,
      aTraps: [1, 0, 0],
      bTraps: [0, 0, 1],
    };
    const effects = buildTrapEffects(result, true);
    const rings = effects.filter((e) => e.type === "trap-ring");
    const numbers = effects.filter((e) => e.type === "trap-number");
    expect(rings).toHaveLength(2);
    expect(numbers).toHaveLength(2);
  });

  it("creates no effects when no traps active", () => {
    const effects = buildTrapEffects(baseResult, true);
    expect(effects).toHaveLength(0);
  });
});

describe("buildAbilityEffect", () => {
  it("returns slash effect for Siege Sword (type 1)", () => {
    const effect = buildAbilityEffect(1, 1, true, true);
    expect(effect).not.toBeNull();
    expect(effect!.type).toBe("ability-slash");
  });

  it("returns shield effect for Stone Cloak (type 2)", () => {
    const effect = buildAbilityEffect(2, 0, true, true);
    expect(effect!.type).toBe("ability-shield");
  });

  it("returns ember effect for Ember Blast (type 3)", () => {
    const effect = buildAbilityEffect(3, 0, true, true);
    expect(effect!.type).toBe("ability-ember");
  });

  it("returns hex effect for Hex (type 4)", () => {
    const effect = buildAbilityEffect(4, 0, true, true);
    expect(effect!.type).toBe("ability-hex");
  });

  it("returns fortify effect for Fortify (type 5)", () => {
    const effect = buildAbilityEffect(5, 0, true, true);
    expect(effect!.type).toBe("ability-fortify");
  });

  it("returns T2 variant with higher intensity for T2 abilities", () => {
    const t1 = buildAbilityEffect(1, 1, true, true);
    const t2 = buildAbilityEffect(6, 1, true, true);
    expect(t1!.tier).toBe(1);
    expect(t2!.tier).toBe(2);
    expect(t2!.intensity).toBeGreaterThan(t1!.intensity);
  });

  it("returns null for ability ID 0", () => {
    const effect = buildAbilityEffect(0, 0, true, true);
    expect(effect).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/lib/__tests__/animationEffects.test.ts
```

Expected: All tests fail (module not found).

- [ ] **Step 3: Implement animationEffects.ts**

Create `frontend/src/lib/animationEffects.ts`:

```typescript
import type { RoundResult1v1, NodeOwner } from "./gameState1v1";

export interface EffectDescriptor {
  type: string;
  gateIndex?: number;
  nodeIndex?: number;
  variant?: string;
  value?: number;
  intensity: number;
  tier?: number;
  target?: number;
  color?: string;
  isMine?: boolean;
}

export function buildGateImpacts(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const dmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
    const dmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
    const totalDmg = dmgDealt + dmgTaken;
    if (totalDmg === 0) continue;
    effects.push({
      type: "gate-flash",
      gateIndex: i,
      intensity: Math.min(totalDmg / 8, 1),
      value: totalDmg,
    });
  }
  return effects;
}

export function buildDamageNumbers(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const dmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
    const dmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
    if (dmgDealt > 0) {
      effects.push({
        type: "damage-number",
        gateIndex: i,
        variant: "dealt",
        value: dmgDealt,
        intensity: Math.min(dmgDealt / 8, 1),
        color: "#4ade80",
      });
    }
    if (dmgTaken > 0) {
      effects.push({
        type: "damage-number",
        gateIndex: i,
        variant: "taken",
        value: dmgTaken,
        intensity: Math.min(dmgTaken / 8, 1),
        color: "#ef4444",
      });
    }
  }
  return effects;
}

export function buildNodeFlips(
  prevNodes: [NodeOwner, NodeOwner, NodeOwner],
  newNodes: [NodeOwner, NodeOwner, NodeOwner],
  isPlayerA: boolean,
): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    if (prevNodes[i] !== newNodes[i]) {
      const myTeam = isPlayerA ? "teamA" : "teamB";
      effects.push({
        type: "node-flip",
        nodeIndex: i,
        intensity: 1,
        isMine: newNodes[i] === myTeam,
        color: newNodes[i] === myTeam ? "#c8a44e" : "#ef4444",
      });
    }
  }
  return effects;
}

export function buildTrapEffects(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  const myTraps = isPlayerA ? result.aTraps : result.bTraps;
  const theirTraps = isPlayerA ? result.bTraps : result.aTraps;

  for (let i = 0; i < 3; i++) {
    if (myTraps[i] > 0) {
      effects.push({ type: "trap-ring", nodeIndex: i, intensity: 1, isMine: true, color: "#daa520" });
      effects.push({ type: "trap-number", nodeIndex: i, intensity: 1, value: 5, isMine: true, color: "#daa520" });
    }
    if (theirTraps[i] > 0) {
      effects.push({ type: "trap-ring", nodeIndex: i, intensity: 1, isMine: false, color: "#ff6633" });
      effects.push({ type: "trap-number", nodeIndex: i, intensity: 1, value: 5, isMine: false, color: "#ff6633" });
    }
  }
  return effects;
}

const ABILITY_TYPE_MAP: Record<number, string> = {
  1: "ability-slash",
  2: "ability-shield",
  3: "ability-ember",
  4: "ability-hex",
  5: "ability-fortify",
};

export function buildAbilityEffect(
  abilityId: number,
  target: number,
  isPlayerA: boolean,
  isMine: boolean,
): EffectDescriptor | null {
  if (abilityId === 0) return null;
  const abilityTypeNum = ((abilityId - 1) % 5) + 1;
  const tier = Math.floor((abilityId - 1) / 5) + 1;
  const effectType = ABILITY_TYPE_MAP[abilityTypeNum];
  if (!effectType) return null;
  return {
    type: effectType,
    target,
    tier,
    intensity: tier === 2 ? 1 : 0.7,
    isMine,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/lib/__tests__/animationEffects.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/animationEffects.ts frontend/src/lib/__tests__/animationEffects.test.ts
git commit -m "feat: add animation effect config builders with tests

Pure functions that transform RoundResult1v1 data into effect
descriptors for gate impacts, damage numbers, node flips, traps,
and ability-specific visuals. No DOM, no React.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 5: Build the ResolutionOverlay component

**Files:**
- Create: `frontend/src/components/ResolutionOverlay.tsx`

This is the main visual component. It renders absolutely-positioned SVG/CSS elements and runs the anime.js timeline.

- [ ] **Step 1: Create the ResolutionOverlay component**

Create `frontend/src/components/ResolutionOverlay.tsx`:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import anime from "animejs";
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";
import {
  buildGateImpacts,
  buildDamageNumbers,
  buildNodeFlips,
  buildTrapEffects,
  buildAbilityEffect,
} from "@/lib/animationEffects";
import { POSITIONS } from "@/components/BattlefieldView";

interface ResolutionOverlayProps {
  result: RoundResult1v1;
  prevNodes: [NodeOwner, NodeOwner, NodeOwner];
  newNodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  onComplete: () => void;
}

export function ResolutionOverlay({
  result,
  prevNodes,
  newNodes,
  isPlayerA,
  onComplete,
}: ResolutionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<ReturnType<typeof anime> | null>(null);
  const completedRef = useRef(false);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.pause();
    }
    handleComplete();
  }, [handleComplete]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      handleComplete();
      return;
    }

    const el = overlayRef.current;
    if (!el) return;

    const gateFlashes = el.querySelectorAll(".fx-gate-flash");
    const dmgNumbers = el.querySelectorAll(".fx-damage-number");
    const nodeFlips = el.querySelectorAll(".fx-node-flip");
    const trapRings = el.querySelectorAll(".fx-trap-ring");
    const trapNumbers = el.querySelectorAll(".fx-trap-number");
    const abilityElements = el.querySelectorAll(".fx-ability");
    const overlay = el;

    const tl = anime.timeline({
      autoplay: true,
      complete: handleComplete,
    });

    if (gateFlashes.length > 0) {
      tl.add({
        targets: Array.from(gateFlashes),
        opacity: [0, 1, 0],
        scale: [0.3, 1, 1.5],
        duration: 400,
        easing: "easeOutQuad",
      }, 0);
    }

    if (trapRings.length > 0) {
      tl.add({
        targets: Array.from(trapRings),
        opacity: [0.8, 0],
        scale: [0.2, 1.4],
        duration: 350,
        easing: "easeOutQuad",
      }, 0);
    }

    if (trapNumbers.length > 0) {
      tl.add({
        targets: Array.from(trapNumbers),
        opacity: [0, 1, 0],
        translateY: [0, -36],
        duration: 800,
        easing: "easeOutCubic",
      }, 50);
    }

    if (dmgNumbers.length > 0) {
      tl.add({
        targets: Array.from(dmgNumbers),
        opacity: [0, 1, 0],
        translateY: [0, -36],
        duration: 800,
        easing: "easeOutCubic",
      }, 100);
    }

    if (nodeFlips.length > 0) {
      tl.add({
        targets: Array.from(nodeFlips),
        scale: [1, 1.4, 1],
        opacity: [0, 1, 0],
        duration: 500,
        easing: "easeOutElastic(1, 0.5)",
      }, 0);
    }

    if (abilityElements.length > 0) {
      tl.add({
        targets: Array.from(abilityElements),
        opacity: [0, 0.9, 0],
        scale: [0.3, 1.2],
        duration: 600,
        easing: "easeOutQuad",
      }, 0);
    }

    tl.add({
      targets: overlay,
      opacity: [1, 0],
      duration: 200,
      easing: "easeOutQuad",
    }, "+=100");

    timelineRef.current = tl;

    return () => {
      if (timelineRef.current) {
        timelineRef.current.pause();
      }
    };
  }, [handleComplete]);

  const gateImpacts = buildGateImpacts(result, isPlayerA);
  const dmgNumbers = buildDamageNumbers(result, isPlayerA);
  const nodeFlips = buildNodeFlips(prevNodes, newNodes, isPlayerA);
  const trapEffects = buildTrapEffects(result, isPlayerA);

  const myAbility = buildAbilityEffect(
    isPlayerA ? result.aAbilityId : result.bAbilityId,
    isPlayerA ? result.aAbilityTarget : result.bAbilityTarget,
    isPlayerA,
    true,
  );
  const theirAbility = buildAbilityEffect(
    isPlayerA ? result.bAbilityId : result.aAbilityId,
    isPlayerA ? result.bAbilityTarget : result.aAbilityTarget,
    isPlayerA,
    false,
  );

  const gatePos = POSITIONS.gates;
  const nodePos = POSITIONS.nodes;
  const enemyBase = isPlayerA ? POSITIONS.baseB : POSITIONS.baseA;
  const myBase = isPlayerA ? POSITIONS.baseA : POSITIONS.baseB;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none z-20"
      style={{ overflow: "hidden" }}
    >
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="absolute top-2 right-2 text-[10px] text-[#7a7060] hover:text-[#d4cfc6] tracking-wider z-30 pointer-events-auto cursor-pointer"
      >
        SKIP
      </button>

      {/* Gate impact flashes */}
      {gateImpacts.map((fx, i) => (
        <div
          key={`gate-${i}`}
          className="fx-gate-flash absolute rounded-full"
          style={{
            left: `${gatePos[fx.gateIndex!].x}%`,
            top: `${gatePos[fx.gateIndex!].y}%`,
            width: `${6 + fx.intensity * 6}%`,
            height: `${6 + fx.intensity * 6}%`,
            background: `radial-gradient(circle, rgba(255,${Math.round(200 - fx.intensity * 150)},${Math.round(100 - fx.intensity * 100)},0.8) 0%, transparent 70%)`,
            transform: "translate(-50%, -50%) scale(0.3)",
            opacity: 0,
          }}
        />
      ))}

      {/* Floating damage numbers at gates */}
      {dmgNumbers.map((fx, i) => {
        const offsetY = fx.variant === "dealt" ? -3 : 3;
        return (
          <div
            key={`dmg-${i}`}
            className="fx-damage-number absolute font-bold text-sm"
            style={{
              left: `${gatePos[fx.gateIndex!].x}%`,
              top: `${gatePos[fx.gateIndex!].y + offsetY}%`,
              color: fx.color,
              transform: "translate(-50%, 0)",
              opacity: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              fontSize: `${12 + fx.intensity * 6}px`,
            }}
          >
            {fx.variant === "dealt" ? `+${fx.value}` : `-${fx.value}`}
          </div>
        );
      })}

      {/* Node ownership flips */}
      {nodeFlips.map((fx, i) => (
        <div
          key={`node-${i}`}
          className="fx-node-flip absolute rounded-full"
          style={{
            left: `${nodePos[fx.nodeIndex!].x}%`,
            top: `${nodePos[fx.nodeIndex!].y}%`,
            width: "4%",
            height: "4%",
            background: `radial-gradient(circle, ${fx.color}88 0%, transparent 70%)`,
            border: `2px solid ${fx.color}`,
            transform: "translate(-50%, -50%) scale(1)",
            opacity: 0,
          }}
        />
      ))}

      {/* Trap detonation rings */}
      {trapEffects
        .filter((fx) => fx.type === "trap-ring")
        .map((fx, i) => (
          <div
            key={`trap-ring-${i}`}
            className="fx-trap-ring absolute rounded-full"
            style={{
              left: `${nodePos[fx.nodeIndex!].x}%`,
              top: `${nodePos[fx.nodeIndex!].y}%`,
              width: "8%",
              height: "8%",
              border: `2px solid ${fx.color}`,
              transform: "translate(-50%, -50%) scale(0.2)",
              opacity: 0,
            }}
          />
        ))}

      {/* Trap damage numbers */}
      {trapEffects
        .filter((fx) => fx.type === "trap-number")
        .map((fx, i) => (
          <div
            key={`trap-num-${i}`}
            className="fx-trap-number absolute font-bold text-xs"
            style={{
              left: `${nodePos[fx.nodeIndex!].x}%`,
              top: `${nodePos[fx.nodeIndex!].y - 4}%`,
              color: fx.color,
              transform: "translate(-50%, 0)",
              opacity: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            -{fx.value}
          </div>
        ))}

      {/* Ability effects */}
      {[myAbility, theirAbility].filter(Boolean).map((fx, i) => {
        const targetGate = fx!.target && fx!.target > 0 ? fx!.target - 1 : 1;
        const sizeMultiplier = fx!.tier === 2 ? 1.5 : 1;

        if (fx!.type === "ability-slash") {
          return (
            <svg
              key={`ability-${i}`}
              className="fx-ability absolute"
              style={{
                left: `${gatePos[targetGate].x - 4}%`,
                top: `${gatePos[targetGate].y - 4}%`,
                width: `${8 * sizeMultiplier}%`,
                height: `${8 * sizeMultiplier}%`,
                opacity: 0,
              }}
              viewBox="0 0 60 60"
            >
              <line x1="5" y1="5" x2="55" y2="55" stroke="#c8a44e" strokeWidth="3" strokeLinecap="round"
                strokeDasharray="60" strokeDashoffset="60" />
              <line x1="55" y1="5" x2="5" y2="55" stroke="#c8a44e" strokeWidth="3" strokeLinecap="round"
                strokeDasharray="60" strokeDashoffset="60" />
            </svg>
          );
        }

        if (fx!.type === "ability-shield") {
          return (
            <div
              key={`ability-${i}`}
              className="fx-ability absolute"
              style={{
                left: `${(isPlayerA ? POSITIONS.baseA.x : POSITIONS.baseB.x)}%`,
                top: "50%",
                width: `${12 * sizeMultiplier}%`,
                height: `${40 * sizeMultiplier}%`,
                border: `2px solid rgba(138, 138, 154, ${0.4 * sizeMultiplier})`,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                opacity: 0,
                boxShadow: `inset 0 0 20px rgba(138, 138, 154, ${0.2 * sizeMultiplier})`,
              }}
            />
          );
        }

        if (fx!.type === "ability-ember") {
          return (
            <div
              key={`ability-${i}`}
              className="fx-ability absolute rounded-full"
              style={{
                left: `${enemyBase.x}%`,
                top: `${enemyBase.y}%`,
                width: `${14 * sizeMultiplier}%`,
                height: `${14 * sizeMultiplier}%`,
                background: `radial-gradient(circle, rgba(255,102,51,0.6) 0%, rgba(255,51,0,0.3) 40%, transparent 70%)`,
                transform: "translate(-50%, -50%) scale(0.1)",
                opacity: 0,
              }}
            />
          );
        }

        if (fx!.type === "ability-hex") {
          return (
            <div
              key={`ability-${i}`}
              className="fx-ability absolute rounded-full"
              style={{
                left: "50%",
                top: "50%",
                width: `${60 * sizeMultiplier}%`,
                height: `${60 * sizeMultiplier}%`,
                border: `2px solid rgba(168, 85, 247, ${0.3 * sizeMultiplier})`,
                background: `radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)`,
                transform: "translate(-50%, -50%) scale(0.5)",
                opacity: 0,
              }}
            />
          );
        }

        if (fx!.type === "ability-fortify") {
          return (
            <div
              key={`ability-${i}`}
              className="fx-ability absolute"
              style={{
                left: `${fx!.isMine ? myBase.x : enemyBase.x}%`,
                top: "50%",
                width: `${4 * sizeMultiplier}%`,
                height: `${50 * sizeMultiplier}%`,
                background: `linear-gradient(to top, transparent, rgba(200, 164, 78, ${0.4 * sizeMultiplier}), transparent)`,
                transform: "translate(-50%, -50%)",
                opacity: 0,
              }}
            />
          );
        }

        return null;
      })}

      {/* Dark vignette during animation */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.3) 100%)",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors. If anime.js types cause issues, the v4 package ships its own types — check that the import resolves.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ResolutionOverlay.tsx
git commit -m "feat: add ResolutionOverlay component

Renders gate impacts, floating damage numbers, node flips, trap
detonation rings, and 5 distinct ability effects as an overlay
on BattlefieldView. anime.js orchestrates the ~1.5s timeline.
Supports skip button and prefers-reduced-motion.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 6: Integrate overlay into the player match page

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

The key change: detect when a new round result appears in `history`, capture it as `pendingResult`, hold the displayed HP values, mount the overlay, then release on `onComplete`.

- [ ] **Step 1: Add state and detection logic**

In `frontend/src/app/match-1v1/[id]/page.tsx`, add the import at the top with the other component imports:

```typescript
import { ResolutionOverlay } from "@/components/ResolutionOverlay";
```

Add the following state variables after the existing `expandedRounds` state declaration (around line 109):

```typescript
const [pendingResult, setPendingResult] = useState<RoundResult1v1 | null>(null);
const [heldHp, setHeldHp] = useState<{ a: number; b: number } | null>(null);
const [prevNodes, setPrevNodes] = useState<[NodeOwner, NodeOwner, NodeOwner]>(["neutral", "neutral", "neutral"]);
const prevRoundRef = useRef<number>(0);
```

Add the `NodeOwner` type to the existing import from `gameState1v1`:

```typescript
import type { RoundResult1v1 } from "@/lib/gameState1v1";
```

Change to:

```typescript
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";
```

- [ ] **Step 2: Add the round-change detection effect**

Add this effect after the existing round-reset effect (the one that resets allocations on `state?.round` change, around line 252):

```typescript
useEffect(() => {
  if (!state || !history.length) return;
  const currentRound = state.round;
  if (prevRoundRef.current > 0 && currentRound > prevRoundRef.current) {
    const justResolved = history.find((r) => r.round === prevRoundRef.current);
    if (justResolved) {
      setHeldHp({ a: state.vaultAHp + (isPlayerA ? justResolved.damageToA : justResolved.damageToB),
                   b: state.vaultBHp + (isPlayerA ? justResolved.damageToB : justResolved.damageToA) });
      setPendingResult(justResolved);
    }
  }
  if (currentRound !== prevRoundRef.current) {
    setPrevNodes(state.nodes);
    prevRoundRef.current = currentRound;
  }
}, [state?.round, history, state, isPlayerA]);
```

Note: `history` is sorted newest-first (descending by round number — see `gameState1v1.ts:419`), so `.find()` by round number is the right approach.

- [ ] **Step 3: Add the complete handler and override displayed HP**

Add the handler function after the `handleRetryReveal` callback:

```typescript
const handleResolutionComplete = useCallback(() => {
  setPendingResult(null);
  setHeldHp(null);
}, []);
```

Then find the HP calculation lines (around line 577-580):

```typescript
const yourVault = isPlayerA ? state.vaultAHp : state.vaultBHp;
const enemyVault = isPlayerA ? state.vaultBHp : state.vaultAHp;
```

Replace them with:

```typescript
const yourVault = heldHp ? heldHp.a : (isPlayerA ? state.vaultAHp : state.vaultBHp);
const enemyVault = heldHp ? heldHp.b : (isPlayerA ? state.vaultBHp : state.vaultAHp);
```

(When `heldHp` is non-null, we show the pre-resolution HP. When the overlay completes and clears it, the component re-renders with the actual post-resolution HP and the existing 700ms CSS transition animates the drain.)

- [ ] **Step 4: Mount the overlay in the JSX**

Find the BattlefieldView section in the JSX (around line 718-725):

```tsx
{/* Left: Animated Battlefield + War Log */}
<div className="flex flex-col gap-2">
  <BattlefieldView
    allocations={allocations}
    isPlayerA={isPlayerA}
    committed={effectiveCommitted}
    modifiers={modifiers}
    opponentAllocations={opponentAllocations}
  />
```

Wrap the `BattlefieldView` in a relative container and add the overlay:

```tsx
{/* Left: Animated Battlefield + War Log */}
<div className="flex flex-col gap-2">
  <div className="relative">
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
  </div>
```

- [ ] **Step 5: Verify compilation**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: integrate resolution overlay into player match page

Detects round transitions, holds HP display at pre-resolution values,
mounts ResolutionOverlay with result data, releases state on complete
so existing HP bar transitions animate the drain.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 7: Integrate overlay into the spectator page

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/spectate/page.tsx`

Same pattern as the player page but simpler — spectator has no commit/reveal machinery.

- [ ] **Step 1: Add imports and state**

Add the import with the other component imports:

```typescript
import { ResolutionOverlay } from "@/components/ResolutionOverlay";
import type { NodeOwner } from "@/lib/gameState1v1";
```

Inside `SpectatorPage()`, after the existing hooks (around line 192), add:

```typescript
const [pendingResult, setPendingResult] = useState<RoundResult1v1 | null>(null);
const [heldHp, setHeldHp] = useState<{ a: number; b: number } | null>(null);
const [prevNodes, setPrevNodes] = useState<[NodeOwner, NodeOwner, NodeOwner]>(["neutral", "neutral", "neutral"]);
const prevRoundRef = useRef<number>(0);
```

Add `useRef` to the React import at line 2:

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
```

- [ ] **Step 2: Add round-change detection and complete handler**

After the new state declarations, add:

```typescript
useEffect(() => {
  if (!state || !history.length) return;
  const currentRound = state.round;
  if (prevRoundRef.current > 0 && currentRound > prevRoundRef.current) {
    const justResolved = history.find((r) => r.round === prevRoundRef.current);
    if (justResolved) {
      setHeldHp({ a: state.vaultAHp + justResolved.damageToA, b: state.vaultBHp + justResolved.damageToB });
      setPendingResult(justResolved);
    }
  }
  if (currentRound !== prevRoundRef.current) {
    setPrevNodes(state.nodes);
    prevRoundRef.current = currentRound;
  }
}, [state?.round, history, state]);

const handleResolutionComplete = useCallback(() => {
  setPendingResult(null);
  setHeldHp(null);
}, []);
```

- [ ] **Step 3: Override HP values**

Replace the HP calculation lines (around line 205-206):

```typescript
const vaultAPct = Math.max(0, Math.min(100, (state.vaultAHp / 50) * 100));
const vaultBPct = Math.max(0, Math.min(100, (state.vaultBHp / 50) * 100));
```

With:

```typescript
const displayAHp = heldHp ? heldHp.a : state.vaultAHp;
const displayBHp = heldHp ? heldHp.b : state.vaultBHp;
const vaultAPct = Math.max(0, Math.min(100, (displayAHp / 50) * 100));
const vaultBPct = Math.max(0, Math.min(100, (displayBHp / 50) * 100));
```

Also update the HP text displays. Find (around line 298-299):

```tsx
{state.vaultAHp} / 50
```

Replace with:

```tsx
{displayAHp} / 50
```

And the same for Player B's HP text (around line 330-331):

```tsx
{state.vaultBHp} / 50
```

Replace with:

```tsx
{displayBHp} / 50
```

- [ ] **Step 4: Mount the overlay in the JSX**

Find the BattlefieldView section (around line 354):

```tsx
<BattlefieldView
  allocations={aAllocations}
  isPlayerA={true}
  committed={true}
  modifiers={modifiers}
  opponentAllocations={bAllocations}
/>
```

Wrap it:

```tsx
<div className="relative">
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
</div>
```

- [ ] **Step 5: Verify compilation**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/spectate/page.tsx
git commit -m "feat: integrate resolution overlay into spectator page

Same overlay behavior as the player page — detects round transitions,
holds HP during animation, releases on complete.

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 8: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All existing tests pass + new `animationEffects.test.ts` passes.

- [ ] **Step 2: Run linter**

```bash
cd frontend && npm run lint
```

Expected: No new lint errors. If `react-hooks/exhaustive-deps` warns on the round-detection effects, verify the deps are intentionally narrow (they should be — `state?.round` as a dep is correct, not the full `state` object).

- [ ] **Step 3: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Start dev server and visually verify**

```bash
cd frontend && npm run dev
```

Open a 1v1 match page, play through a round (or use the bot script: `cd scripts && MATCH_ID=<id> npx tsx play-opponent.js`). Verify:

1. After round resolves, the overlay appears over the battlefield for ~1.5s
2. Gate flashes appear at gate positions where damage occurred
3. Floating damage numbers rise and fade
4. Skip button in top-right corner works
5. After overlay completes, HP bars animate their drain with the existing 700ms transition
6. War Dispatch Log still shows the correct round breakdown
7. No console errors related to the overlay or anime.js

- [ ] **Step 5: Verify reduced motion**

In browser DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Reload match page and trigger a round resolution. The overlay should not appear — HP updates instantly as before.

- [ ] **Step 6: Commit any fixes needed**

If any issues were found and fixed, commit them:

```bash
git add -u
git commit -m "fix: address issues found during resolution overlay testing

Co-authored-by: Claude <noreply@anthropic.com>"
```
