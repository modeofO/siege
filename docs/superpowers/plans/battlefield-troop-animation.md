> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Battlefield Troop Animation — Implementation Plan

## Overview

Add an animated battlefield view to the 1v1 match page. When a player allocates budget to gates, nodes, or repair, troop sprites move to their designated positions on a static battlefield background. On commit, a brief animation shows troops carrying out their assignments.

## Assets (already in repo)

- `public/sprites/battlefield.png` — 1920x1080 static background (blue castle left, red castle right, 3 nodes center, grass field)
- `public/sprites/troops/troop_{attack|defense|healer|node}{a|b}.png` — 8 troop sprites, 512x512 transparent PNGs
  - Gold team (A): attack, defense, healer, node
  - Steel team (B): attack, defense, healer, node

## Architecture

### New component: `BattlefieldView.tsx`

A React component that renders the battlefield background as a CSS `background-image` and overlays troop sprites as absolutely-positioned `<img>` elements. It reads the player's current allocation from the existing `AllocationForm1v1` state and animates troops accordingly.

```
<div className="battlefield-container" style={{ backgroundImage: battlefield.png }}>
  {/* Troop sprites positioned absolutely, animated with CSS transitions */}
  <TroopSprite type="attack" team="a" count={allocation.attack} target={gateIndex} />
  <TroopSprite type="defense" team="a" count={allocation.defense} target={gateIndex} />
  <TroopSprite type="healer" team="a" count={allocation.repair} />
  <TroopSprite type="node" team="a" count={totalNodeContest} target={nodeIndex} />
</div>
```

### Troop positioning logic

The battlefield has fixed landmark positions (percentage-based for responsive scaling):

| Landmark | Purpose | Approx position (% from left, % from top) |
|----------|---------|-------------------------------------------|
| Castle A base | Troop spawn point for player A | 15%, 50% |
| Castle B base | Troop spawn point for player B | 85%, 50% |
| Gate 0 (top) | Attack/defense target | 50%, 25% |
| Gate 1 (mid) | Attack/defense target | 50%, 50% |
| Gate 2 (bot) | Attack/defense target | 50%, 75% |
| Node 0 (Forge) | Node contest target | 45%, 20% |
| Node 1 (Quarry) | Node contest target | 50%, 50% |
| Node 2 (Grove) | Node contest target | 55%, 80% |
| Repair zone | Healer target (near own castle) | 25%, 50% (A) / 75%, 50% (B) |

These positions should be tuned visually once the component is live.

### Animation behavior

1. **Idle state (no allocation):** All troops clustered at their castle base.
2. **As player allocates:** Troops slide from base toward their target positions using CSS `transition: transform 0.4s ease-out`. The number of sprites shown at each target equals the budget allocated there.
3. **On commit:** Brief "march" animation — troops advance together, then hold position while waiting for opponent.
4. **On reveal/resolve:** Attack troops strike (CSS shake/pulse), damage numbers float up, vault HP updates.

### Sprite stacking

When multiple budget points go to the same target (e.g., 3 attack on gate 0), show multiple sprites with slight X/Y offsets to create a formation look. Cap visible sprites at the allocation count (1-5 sprites per target).

### Integration points

- **`AllocationForm1v1.tsx`** — Already tracks `attack[3]`, `defense[3]`, `repair`, `nodes[3]`, `traps[3]`. Pass these values as props to `BattlefieldView`.
- **`match-1v1/[id]/page.tsx`** — Mount `BattlefieldView` alongside or above the allocation form. Show it during the allocation phase.
- **Player side detection** — Use `useMyStatus()` to determine if the player is A or B, then render the correct team's sprites on "your" side.

### Animation library

Use CSS transitions for the primary movement (simple, performant, no extra dependency). If richer animations are needed later (e.g., attack slash effects, damage particles), consider Framer Motion which is already available in Next.js.

## Implementation steps

1. Create `components/BattlefieldView.tsx` — static battlefield background + landmark position constants.
2. Create `components/TroopSprite.tsx` — single sprite component with CSS transition on `transform: translate()`.
3. Wire `BattlefieldView` into `match-1v1/[id]/page.tsx`, passing allocation state as props.
4. Implement allocation-reactive positioning — troops move as sliders/inputs change.
5. Add commit animation (march forward + hold).
6. Add resolve animation (attack impact + damage numbers).
7. Tune landmark positions by running the dev server and adjusting percentages visually.
8. Add responsive scaling (battlefield scales with container width, sprite sizes scale proportionally).

## Open questions

- Should the battlefield replace the current allocation UI or sit alongside it?
- Do we want opponent troops visible (mirrored from their perspective) or just show the player's side?
- Should troop counts be shown as numbers overlaid on the formation, or purely visual sprite count?
- Sound effects on commit/resolve?
