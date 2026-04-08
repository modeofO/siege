# Ability Selection UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ability selector to the 1v1 game board so players can activate one ability per round during commit phase.

**Architecture:** New `AbilitySelector` component placed at the top of `AllocationForm1v1`. A new `useMatchAbilities1v1` hook fetches ability data from Torii. The page wires the selected ability into the existing commitment hash and reveal call (replacing hardcoded `0, 0`).

**Tech Stack:** React 19, Next.js 16, Tailwind 4, Torii GraphQL

---

### Task 1: Torii Hook — useMatchAbilities1v1

Fetch the player's brought abilities and used flags from the `MatchAbilities1v1` Dojo model via Torii GraphQL.

**Files:**
- Modify: `frontend/src/lib/gameState1v1.ts`

- [ ] **Step 1: Add the useMatchAbilities1v1 hook**

Add this at the end of `frontend/src/lib/gameState1v1.ts`:

```typescript
export interface MatchAbilitiesData {
  abilities: [number, number, number]; // ability IDs (0 = empty)
  used: [boolean, boolean, boolean];   // which slots are used
}

export function useMatchAbilities1v1(
  matchId: string | null,
  playerAddress: string | null,
  playerA: string | null,
  refreshKey?: number,
) {
  const [data, setData] = useState<MatchAbilitiesData>({
    abilities: [0, 0, 0],
    used: [false, false, false],
  });

  useEffect(() => {
    if (!matchId || !playerAddress || !playerA) return;
    const id = Number(matchId);
    const isA = playerAddress.toLowerCase() === playerA.toLowerCase();

    const fetch = async () => {
      const result = await toriiQuery<{
        siegeDojoMatchAbilities1V1Models: GraphEdges<{
          a_ability_1: string; a_ability_2: string; a_ability_3: string;
          b_ability_1: string; b_ability_2: string; b_ability_3: string;
          a_used_1: boolean; a_used_2: boolean; a_used_3: boolean;
          b_used_1: boolean; b_used_2: boolean; b_used_3: boolean;
        }>;
      }>(`
        query {
          siegeDojoMatchAbilities1V1Models(where: { match_id: "${id}" }) {
            edges { node {
              a_ability_1 a_ability_2 a_ability_3
              b_ability_1 b_ability_2 b_ability_3
              a_used_1 a_used_2 a_used_3
              b_used_1 b_used_2 b_used_3
            } }
          }
        }
      `);
      const node = result?.siegeDojoMatchAbilities1V1Models?.edges?.[0]?.node;
      if (node) {
        if (isA) {
          setData({
            abilities: [toNum(node.a_ability_1), toNum(node.a_ability_2), toNum(node.a_ability_3)],
            used: [!!node.a_used_1, !!node.a_used_2, !!node.a_used_3],
          });
        } else {
          setData({
            abilities: [toNum(node.b_ability_1), toNum(node.b_ability_2), toNum(node.b_ability_3)],
            used: [!!node.b_used_1, !!node.b_used_2, !!node.b_used_3],
          });
        }
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, playerAddress, playerA, refreshKey]);

  return data;
}
```

Note: `toriiQuery` and `toNum` are already defined in this file. `GraphEdges` type is also already defined. The Torii model name follows the pattern: `siegeDojo` + PascalCase model name + `Models`.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/gameState1v1.ts
git commit -m "feat: add useMatchAbilities1v1 hook for ability data polling"
```

---

### Task 2: AbilitySelector Component

Create the ability selector component that shows available abilities as clickable cards.

**Files:**
- Create: `frontend/src/components/AbilitySelector.tsx`

- [ ] **Step 1: Create the AbilitySelector component**

```typescript
// frontend/src/components/AbilitySelector.tsx
"use client";

import React from "react";
import { ABILITIES } from "@/lib/craftingContracts";

interface AbilitySelectorProps {
  abilities: [number, number, number];
  used: [boolean, boolean, boolean];
  selectedAbility: number;
  selectedTarget: number;
  onSelect: (abilityId: number, abilityTarget: number) => void;
}

const GATE_NAMES = ["East", "Under.", "West"];

export function AbilitySelector({
  abilities,
  used,
  selectedAbility,
  selectedTarget,
  onSelect,
}: AbilitySelectorProps) {
  const hasAny = abilities.some((a) => a > 0);
  if (!hasAny) return null;

  const handleClick = (abilityId: number) => {
    if (selectedAbility === abilityId) {
      // Deselect
      onSelect(0, 0);
    } else {
      onSelect(abilityId, abilityId === 1 ? selectedTarget : 0);
    }
  };

  const handleTargetChange = (target: number) => {
    onSelect(selectedAbility, target);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-[#b8860b] uppercase font-bold border-b border-[#b8860b]/20 pb-0.5 mb-1 font-serif">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        ABILITY
      </div>

      <div className="grid grid-cols-3 gap-2">
        {abilities.map((abilityId, slotIdx) => {
          if (abilityId === 0) return null;

          const ability = ABILITIES.find((a) => a.id === abilityId);
          if (!ability) return null;

          const isUsed = used[slotIdx];
          const isSelected = selectedAbility === abilityId;

          return (
            <button
              key={slotIdx}
              onClick={() => !isUsed && handleClick(abilityId)}
              disabled={isUsed}
              className={`relative rounded-lg p-2 text-left transition-all border ${
                isUsed
                  ? "opacity-30 cursor-not-allowed border-[#3d3428] bg-[#252019]"
                  : isSelected
                    ? "border-[#daa520] bg-[#daa520]/10 shadow-[0_0_8px_rgba(218,165,32,0.3)]"
                    : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
              }`}
            >
              <div className="text-xs font-bold text-[#d4cfc6] font-serif">{ability.name}</div>
              <div className="text-[9px] text-[#7a7060] mt-0.5 leading-tight">{ability.effect}</div>
              {isUsed && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0d0b0a]/60 rounded-lg">
                  <span className="text-[10px] font-bold text-[#7a7060] tracking-wider">USED</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Siege Sword gate target selector */}
      {selectedAbility === 1 && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[10px] text-[#7a7060] tracking-wider">TARGET GATE:</span>
          {GATE_NAMES.map((name, gi) => (
            <button
              key={gi}
              onClick={() => handleTargetChange(gi)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedTarget === gi
                  ? "border-[#ff8800] bg-[#ff8800]/20 text-[#ff8800]"
                  : "border-[#3d3428] text-[#7a7060] hover:border-[#ff8800] hover:text-[#ff8800]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AbilitySelector.tsx
git commit -m "feat: add AbilitySelector component"
```

---

### Task 3: Wire Into AllocationForm1v1

Add the AbilitySelector to the top of the deploy orders form. Pass ability state through the component interface.

**Files:**
- Modify: `frontend/src/components/AllocationForm1v1.tsx`

- [ ] **Step 1: Update AllocationForm1v1 props and add AbilitySelector**

Add ability-related props to the interface:

```typescript
import { AbilitySelector } from "./AbilitySelector";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
  onCommit: () => void;
  submitting: boolean;
  error: string;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  // Ability selection (Phase 2B)
  abilities: [number, number, number];
  abilitiesUsed: [boolean, boolean, boolean];
  selectedAbility: number;
  selectedTarget: number;
  onAbilitySelect: (abilityId: number, abilityTarget: number) => void;
}
```

Then in the JSX, add the AbilitySelector at the top of the form body (after the budget header `<div>`, before the 2-column attack/defense grid):

```tsx
      {/* Ability selector — Phase 2B */}
      <AbilitySelector
        abilities={abilities}
        used={abilitiesUsed}
        selectedAbility={selectedAbility}
        selectedTarget={selectedTarget}
        onSelect={onAbilitySelect}
      />
```

Update the function signature to destructure the new props:

```typescript
export function AllocationForm1v1({
  budget, allocations, onChange, onCommit, submitting, error, nodes, isPlayerA,
  abilities, abilitiesUsed, selectedAbility, selectedTarget, onAbilitySelect,
}: AllocationForm1v1Props) {
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors — page.tsx doesn't pass the new props yet. That's expected; we'll fix in Task 4.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AllocationForm1v1.tsx
git commit -m "feat: add ability props to AllocationForm1v1"
```

---

### Task 4: Wire Into Page — Commit & Reveal with Abilities

Connect the Torii hook, component state, and contract calls in the 1v1 match page.

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Add ability state and hook**

In `frontend/src/app/match-1v1/[id]/page.tsx`:

Add import:
```typescript
import { useMatchAbilities1v1 } from "@/lib/gameState1v1";
```

Inside the component, after the existing hooks (useMatchState1v1, useRoundStatus1v1, etc.), add:

```typescript
  // Ability selection state
  const [selectedAbility, setSelectedAbility] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(0);

  const matchAbilities = useMatchAbilities1v1(
    matchId,
    address || null,
    state?.playerA || null,
    refreshKey,
  );

  const handleAbilitySelect = useCallback((abilityId: number, target: number) => {
    setSelectedAbility(abilityId);
    setSelectedTarget(target);
  }, []);

  // Reset ability selection when round changes
  useEffect(() => {
    setSelectedAbility(0);
    setSelectedTarget(0);
  }, [state?.round]);
```

You'll need to add `useState` and `useCallback` to the React imports if not already there, and `useEffect` as well.

- [ ] **Step 2: Pass ability props to AllocationForm1v1**

Find the `<AllocationForm1v1` JSX in the page and add the new props:

```tsx
              <AllocationForm1v1
                budget={budget}
                allocations={allocations}
                onChange={setAllocations}
                onCommit={handleCommit}
                submitting={submitting}
                error={error}
                nodes={state.nodes}
                isPlayerA={isPlayerA}
                abilities={matchAbilities.abilities}
                abilitiesUsed={matchAbilities.used}
                selectedAbility={selectedAbility}
                selectedTarget={selectedTarget}
                onAbilitySelect={handleAbilitySelect}
              />
```

- [ ] **Step 3: Update handleCommit to use ability values**

Find the `handleCommit` callback. Replace the hardcoded `0, 0` in `computeCommitment1v1` with the actual ability values:

Change:
```typescript
        0, 0,
```

To:
```typescript
        selectedAbility, selectedTarget,
```

Also update `storeMove1v1` to include ability data. Currently it stores the 13-element allocations array. We need to also store the ability selection so the auto-reveal can use it. The simplest approach: store as a separate key.

Add after `storeMove1v1(matchId, state.round, allocations)`:
```typescript
      // Store ability selection for auto-reveal
      localStorage.setItem(
        `siege_1v1_ability_${matchId}_${state.round}`,
        JSON.stringify({ abilityId: selectedAbility, abilityTarget: selectedTarget }),
      );
```

- [ ] **Step 4: Update auto-reveal to use stored ability values**

Find the auto-reveal logic (the `attemptReveal` function and the `useEffect` that calls it). The reveal call currently passes `"0", "0"` for ability params.

Replace the hardcoded ability params in the `revealMove1v1` call:

```typescript
      // Read stored ability selection
      const abilityData = localStorage.getItem(`siege_1v1_ability_${matchId}_${state.round}`);
      const { abilityId: storedAbilityId, abilityTarget: storedAbilityTarget } = abilityData
        ? JSON.parse(abilityData)
        : { abilityId: 0, abilityTarget: 0 };
```

Then in the `revealMove1v1` call, replace `"0", "0"` with:
```typescript
          storedAbilityId.toString(), storedAbilityTarget.toString(),
```

- [ ] **Step 5: Add `selectedAbility` and `selectedTarget` to handleCommit dependencies**

Update the `useCallback` dependency array for `handleCommit` to include `selectedAbility` and `selectedTarget`:

```typescript
  }, [account, state, allocations, budget, matchId, refresh, selectedAbility, selectedTarget]);
```

- [ ] **Step 6: Verify build and test manually**

Run: `cd frontend && npx tsc --noEmit`
Expected: No TypeScript errors.

Run: `cd frontend && bun run dev`
Test: Open a 1v1 match in the browser. The ability selector should appear at the top of Deploy Orders (if MatchAbilities1v1 has been populated for this match). Clicking an ability highlights it with a gold border. Committing includes the ability in the hash.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/match-1v1/[id]/page.tsx
git commit -m "feat: wire ability selection into commit/reveal flow"
```
