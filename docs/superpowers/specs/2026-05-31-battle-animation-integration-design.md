# Battle Animation Integration Design

**Date:** 2026-05-31
**Status:** Draft
**Scope:** Wire anime.js battle animations into the live match-1v1 flow, replacing `ResolutionOverlay`

## Overview

Replace the existing `ResolutionOverlay` component (CSS keyframes + minimal anime.js) with a new `BattleAnimation` component that uses the `lib/animations/` timeline factories (troop march, gate clash with sparks/rings/vignette, ability icons, node flips, vault HP drain) driven by real `RoundResult1v1` data.

## New Component: `BattleAnimation`

**File:** `frontend/src/components/BattleAnimation.tsx`

**Props:**

```typescript
interface BattleAnimationProps {
  result: RoundResult1v1;
  prevNodes: [NodeOwner, NodeOwner, NodeOwner];
  newNodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  heldHp: { a: number; b: number };
  onComplete: () => void;
}
```

**Behavior:**

1. On mount, builds DOM refs for all effect layers (troops, gate flashes, white flashes, rings, sparks, damage numbers, nodes, node bursts, ability icon, vault HP elements, vignette).
2. Converts `RoundResult1v1` + `isPlayerA` into the troop positions, damage values, ability IDs, node changes, and HP drain values that the timeline factories expect.
3. Calls `createRoundTimeline()` and plays it.
4. On timeline complete, calls `onComplete`.
5. Skip button pauses timeline and fires `onComplete` immediately.
6. `prefers-reduced-motion`: skip animation, fire `onComplete` on mount.

## Data Mapping

### Troop positions

From `result.aAttack`, `result.aDefense`, `result.bAttack`, `result.bDefense`:
- Player's attackers go to attack positions near enemy base per gate
- Player's defenders go to defense positions near own base per gate
- Repair value from the allocation (not in `RoundResult1v1` — use 0, troops don't animate repair in resolution)
- Node contesters: not in result either — skip for resolution (they're a commit-phase visual)

Only attack and defense troops march during resolution since those are the values in the round result.

### Gate effects

From `result.gateBreakdown[i]`:
- `dmgToA` and `dmgToB` determine flash intensity per gate
- Both dealt (green, `+N`) and taken (red, `-N`) damage numbers render at each gate
- Zero-damage gates get no effects

### Nodes

Compare `prevNodes[i]` vs `newNodes[i]`:
- Changed nodes get a flip animation with color burst
- Color: gold if the node changed to the player's team, red if to enemy

### Abilities

From `result.aAbilityId`, `result.bAbilityId`:
- Render the ability SVG icon (`/sprites/abilities/`) with environmental effect
- Player's ability targets their specified gate/position
- Enemy's ability also renders (both abilities fire in the same round)

### Vault HP

From `heldHp` (pre-resolution) and current state:
- Vault A: `heldHp.a` → `heldHp.a - result.damageToA`
- Vault B: `heldHp.b` → `heldHp.b - result.damageToB`
- Both vaults animate simultaneously with count-down, shake, and pulse

## Match Page Changes

### `frontend/src/app/match-1v1/[id]/page.tsx`

1. Replace `import { ResolutionOverlay }` with `import { BattleAnimation }`
2. Move the animation from sibling-of-BattlefieldView to children-of-BattlefieldView:

Before:
```tsx
<BattlefieldView ... />
{pendingResult && <ResolutionOverlay ... />}
```

After:
```tsx
<BattlefieldView ...>
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

3. No other changes — `pendingResult`, `heldHp`, `prevNodes`, `handleResolutionComplete` all exist already.

### `frontend/src/app/match-1v1/[id]/spectate/page.tsx`

Same pattern — replace `ResolutionOverlay` with `BattleAnimation` as children of `BattlefieldView`.

## Sandbox Cleanup

Delete `frontend/src/app/sandbox/animations/` (both `page.tsx` and `mockData.ts`). The `lib/animations/` modules are now production code used by `BattleAnimation`.

## Files

### New
| File | Purpose |
|------|---------|
| `frontend/src/components/BattleAnimation.tsx` | Production animation component using `lib/animations/` timelines |

### Modified
| File | Change |
|------|--------|
| `frontend/src/app/match-1v1/[id]/page.tsx` | Swap `ResolutionOverlay` → `BattleAnimation` as child of `BattlefieldView` |
| `frontend/src/app/match-1v1/[id]/spectate/page.tsx` | Same swap |

### Deleted
| File | Reason |
|------|--------|
| `frontend/src/app/sandbox/animations/page.tsx` | Sandbox no longer needed |
| `frontend/src/app/sandbox/animations/mockData.ts` | Sandbox no longer needed |

### Not Changed
- `frontend/src/components/ResolutionOverlay.tsx` — left in codebase, just no longer imported
- `frontend/src/lib/animationEffects.ts` — left in codebase, just no longer imported
- `frontend/src/lib/animations/*.ts` — already production-ready, no changes needed
- `frontend/src/components/BattlefieldView.tsx` — already has `children` prop
- No Cairo or contract changes
