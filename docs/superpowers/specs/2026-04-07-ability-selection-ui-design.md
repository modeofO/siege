# Ability Selection UI

Add an ability selector to the 1v1 match game board so players can activate one of their brought abilities each round. This makes Phase 2B ability effects usable from the frontend.

## Component: AbilitySelector

A horizontal row of up to 3 ability cards placed at the top of the Deploy Orders panel in AllocationForm1v1. Players pick one ability (or none) before allocating their budget.

### Layout
- Horizontal row of up to 3 cards, full width of the deploy orders section
- Each card: ability name, one-line effect description, "USED" overlay if already activated in a prior round
- Selected card: gold border glow (`--color-gold`), matching the commit button style
- Unselected cards: dimmed, clickable
- Click to select, click again to deselect (toggle)
- Section header: "ABILITY" with icon, matching existing headers ("ATTACK", "DEFENSE", etc.)

### Siege Sword Gate Target
When Siege Sword (ID 1) is selected, a 3-button gate target selector appears below the ability row. Buttons labeled East (0) / Underground (1) / West (2), matching the gate display order. Default: none selected (player must choose).

### Empty State
If the player has no abilities available (all 3 slots empty or all used), display a muted line: "No abilities available"

### Data Flow

**Input** (props to AbilitySelector):
- `abilities: [u8, u8, u8]` — ability IDs the player brought (from MatchAbilities1v1)
- `used: [bool, bool, bool]` — which slots have been used in prior rounds
- `onSelect: (abilityId: number, abilityTarget: number) => void` — callback when selection changes

**Output**:
- `abilityId`: 0 = none, 1-5 = selected ability
- `abilityTarget`: 0-2 = target gate (only meaningful for Siege Sword)

These values are included in the Poseidon commitment hash (already wired — `computeCommitment1v1` accepts `abilityId, abilityTarget`) and passed to `revealMove1v1`.

## Files

### Create: `src/components/AbilitySelector.tsx`

The selector component. Props:
```typescript
interface AbilitySelectorProps {
  abilities: number[];      // [id, id, id] from MatchAbilities1v1
  used: boolean[];          // [used, used, used] from MatchAbilities1v1
  selectedAbility: number;  // current selection (0 = none)
  selectedTarget: number;   // current target (0-2)
  onSelect: (abilityId: number, abilityTarget: number) => void;
}
```

Ability metadata (name + effect) is already defined in `craftingContracts.ts` as the `ABILITIES` array. Import and reuse it.

### Modify: `src/components/AllocationForm1v1.tsx`

- Add `AbilitySelector` at the top of the form (before the Attack section)
- Add `abilityId` and `abilityTarget` to the component's state
- Pass them to the parent's `onCommit` callback alongside the 13-element allocations array
- The parent (page.tsx) uses these when computing the commitment hash and calling reveal

### Modify: `src/app/match-1v1/[id]/page.tsx`

- Add `useMatchAbilities1v1(matchId, playerAddress)` hook call
- Pass abilities + used data to AllocationForm1v1
- Replace hardcoded `0, 0` in `computeCommitment1v1` and `revealMove1v1` calls with the actual abilityId/abilityTarget from the form

### Create or modify: `src/lib/gameState1v1.ts`

Add a `useMatchAbilities1v1(matchId, playerAddress)` hook:
- Query Torii for `MatchAbilities1v1` model where `match_id = matchId`
- Determine which player (A or B) based on playerAddress
- Return `{ abilities: number[], used: boolean[] }` for the current player
- Poll on the same interval as other match state hooks (4s)

## Ability Metadata Reference

From `craftingContracts.ts`:
| ID | Name | Effect (display text) |
|----|------|----------------------|
| 1 | Siege Sword | Max damage (10) to one gate |
| 2 | Stone Cloak | Block all gate damage |
| 3 | Ember Blast | 5 direct damage bypassing gates |
| 4 | Hex | Reduce opponent damage by 7 |
| 5 | Fortify | Double defense on all gates |

## Visual Style

- Cards match the existing node contest cards (dark panel, border, centered content)
- Gold highlight on selection matches `--color-gold` / `--color-friendly`
- "USED" overlay: semi-transparent dark cover with "USED" text, similar to how depleted states look
- Gate target buttons (Siege Sword): 3 inline buttons matching the gate names from the Battlefield section
- Responsive: cards stack vertically on small screens

## What This Does NOT Include

- Ability effects in round history (showing what was activated in past rounds)
- Ability selection at match creation (choosing which 3 to bring — that's the staked match flow)
- World system or conquest UI
- Ability balance checking (ERC-1155) — the contract validates on reveal; the UI trusts MatchAbilities1v1
