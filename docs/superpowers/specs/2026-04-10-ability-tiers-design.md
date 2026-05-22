> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Ability Tiers (T2) Design

**Date:** 2026-04-10
**Status:** Approved design
**Depends on:** Phase 2B ability effects (completed), ability token + crafting (completed)

## Scope

Add T2 tier to all 5 ability types with consume-to-upgrade crafting. T3 is deferred until the campaign system exists (campaigns drop the rare materials T3 requires).

## Token ID Scheme

Contiguous range — IDs 1-5 remain T1 (existing), IDs 6-10 are T2. Reserved IDs 11-15 for future T3.

| Token ID | Ability | Tier |
|----------|---------|------|
| 1 | Siege Sword | T1 |
| 2 | Stone Cloak | T1 |
| 3 | Ember Blast | T1 |
| 4 | Hex | T1 |
| 5 | Fortify | T1 |
| 6 | Siege Sword | T2 |
| 7 | Stone Cloak | T2 |
| 8 | Ember Blast | T2 |
| 9 | Hex | T2 |
| 10 | Fortify | T2 |

### Helper functions (Cairo)

```cairo
fn ability_type_from_token(token_id: u8) -> u8 {
    ((token_id - 1) % 5) + 1  // returns 1-5
}

fn ability_tier_from_token(token_id: u8) -> u8 {
    ((token_id - 1) / 5) + 1  // returns 1 or 2
}

fn token_id_from(ability_type: u8, tier: u8) -> u8 {
    ((tier - 1) * 5) + ability_type
}
```

## Ability Effects by Tier

| Ability | T1 Effect | T2 Effect |
|---------|-----------|-----------|
| Siege Sword | Set attack on target gate to 5 | Set attack on target gate to 10 |
| Stone Cloak | Halve all gate damage taken this round (integer division, floor) | Zero all gate damage taken this round |
| Ember Blast | 2 direct vault damage (bypasses gates) | 6 direct vault damage (bypasses gates) |
| Hex | Reduce opponent's total damage by 3 (floor 0) | Reduce opponent's total damage by 8 (floor 0) |
| Fortify | Add 1 to defense at all gates | Double defense at all gates |

Stone Cloak T1 integer division: damage 5 → 2, damage 3 → 1, damage 1 → 0. Favors the defender.

## Resolution Contract Changes

The resolution contract reads `a_ability_id` and `b_ability_id` from `RoundMoves1v1`. The field type stays `u8` but now accepts values 1-10 instead of 1-5.

For each ability activation, derive type and tier from the token ID, then apply the tier-specific effect. The resolution order (gate modifiers → Fortify → Siege Sword → damage → Stone Cloak → overflow → Hex → repair → Ember Blast → traps) is unchanged.

### Stone Cloak T1 (halving) — implementation note

Unlike T2's full block which can be applied after gate damage is computed (`damage_to_X = [0,0,0]; overflow_to_X = [0,0,0]`), the T1 halving applies the same way but computes `damage_to_X[i] = damage_to_X[i] / 2` and `overflow_to_X[i] = overflow_to_X[i] / 2` for all three gates.

## Commit/Reveal Validation

`commit_reveal_1v1.cairo` currently asserts `ability_id <= 5`. Change to `ability_id <= 10`.

The Poseidon hash structure stays at 16 elements — `ability_id` is one slot, value range just expands from 0-5 to 0-10.

`MatchAbilities1v1` model fields `a_ability_1/2/3` and `b_ability_1/2/3` stay `u8`, also accepting 1-10.

## Crafting Contract Changes

Add a new function to `crafting_1v1.cairo`:

```cairo
fn craft_ability_tier2(ref self: T, ability_type: u8);
```

### Behavior

1. Validate `ability_type` is 1-5
2. Check caller owns at least 1 of the corresponding T1 token (token ID = ability_type)
3. Burn the T1 token via `AbilityToken.burn(caller, ability_type.into(), 1)`
4. Burn the T2 recipe resources (below)
5. Mint the T2 token via `AbilityToken.mint(caller, (ability_type + 5).into(), 1)`

### T2 Recipes

| Ability Type | T2 Cost |
|--------------|---------|
| 1: Siege Sword | 1× T1 Siege Sword + 30 Iron + 20 Wood + 10 Ember |
| 2: Stone Cloak | 1× T1 Stone Cloak + 30 Stone + 20 Linen + 10 Seeds |
| 3: Ember Blast | 1× T1 Ember Blast + 30 Ember + 20 Seeds + 10 Iron |
| 4: Hex | 1× T1 Hex + 20 Iron + 20 Stone + 10 Ember + 10 Wood |
| 5: Fortify | 1× T1 Fortify + 20 Stone + 20 Linen + 10 Wood |

### Burner role setup

Currently `AbilityToken.burner_address` is unset (zero). `crafting_1v1` needs burner permission to burn T1 tokens during T2 crafting. This requires a one-time admin transaction after deploy: the AbilityToken admin calls `set_burner(crafting_1v1_address)`.

The burner address is a single slot — setting `crafting_1v1` as burner means no other contract can burn abilities. This is fine for T2 crafting, but future features (like ability consumption during matches if we ever add that) would need the same contract or an admin rotation.

## AbilityToken Metadata Changes

Current `uri(token_id)` hard-caps at `token_id.low > 5`. Expand to `token_id.low > 10`.

### Metadata module updates

`ability_metadata.cairo` currently takes `ability_type` (1-5) and builds the JSON + inline SVG. Changes:

1. Rename/update the builder to take `token_id` (1-10) instead of `ability_type`
2. Derive ability_type and tier from token_id (using the helper functions)
3. Name format: `"Siege Sword"` for T1, `"Siege Sword (T2)"` for T2
4. Description includes tier-specific effect text
5. SVG wrapping: T1 uses the raw SVG from storage. T2 wraps the same SVG with a gold border `<rect>` element generated inline

### Border generation

The Cairo code wraps the ability SVG:
- **T1**: no wrapper, output SVG as-is
- **T2**: output `<svg>...<rect fill="none" stroke="gold" stroke-width="4" .../>{base_svg_inner}</svg>`

Exact SVG structure to be determined during implementation. The ability_svgs storage map stays keyed by `ability_type` (1-5), not token_id — one SVG per ability type, reused across tiers.

## Staking Changes

`world_system.cairo` has `create_staked_match` and `join_staked_match` that escrow ERC-1155 tokens and validate ability IDs. Only change: update `assert(ability_id >= 1 && ability_id <= 5, ...)` to `<= 10` in both functions.

The `safe_transfer_from` calls work unchanged for any token ID. `MatchStakes1v1` model fields are already `u8` accepting any value.

## Frontend Changes

### `frontend/src/lib/craftingContracts.ts`

Extend the `ABILITIES` array to include 10 entries (T1 and T2 for each ability type). Add helper functions:

```typescript
export function abilityType(id: number): number {
  return ((id - 1) % 5) + 1;
}
export function abilityTier(id: number): number {
  return Math.floor((id - 1) / 5) + 1;
}
export function tokenId(type: number, tier: number): number {
  return (tier - 1) * 5 + type;
}
```

Add a new contract call:

```typescript
export async function craftAbilityTier2(
  account: AccountInterface,
  abilityType: number,
) {
  return account.execute({
    contractAddress: CONTRACTS.CRAFTING_1V1,
    entrypoint: "craft_ability_tier2",
    calldata: [abilityType.toString()],
  }, TX_OPTS);
}
```

### `frontend/src/components/AbilitySelector.tsx`

- Display tier badge (T1/T2) next to ability name
- Style T2 abilities with gold accent border to match the in-game SVG border
- Handle ability IDs 1-10 via the helper functions

### Crafting UI

Wherever T1 crafting currently lives, add a "Craft T2" section that:

- Shows the player's current T1 inventory (required for upgrade)
- Lists T2 recipes with resource costs
- Disables upgrade buttons when player lacks the required T1 or resources
- Calls `craftAbilityTier2(abilityType)` on click

### No changes

- `gameState1v1.ts` — game state polling works unchanged
- `contracts1v1.ts` — reveal signature unchanged (abilityId is still one slot)
- `crypto.ts` — hash computation already accepts any u8

## What This Does NOT Include

- T3 abilities (deferred until campaign system exists — T3 requires campaign-exclusive materials)
- Changes to matchmaking or reputation based on ability tier
- Tier-gated matches (players with T2 can still fight players with only T1)
- New artwork files (T2 uses existing SVGs with generated border)
