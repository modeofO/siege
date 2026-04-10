# Conquest Match Revisions Design

**Date:** 2026-04-10
**Status:** Approved design
**Depends on:** Kingdom tiers, ability tiers, pillaging system (all completed)

## Problem

Conquest is partially built but predates the game direction redesign. It needs three main updates to align with the current system:

1. **Tier-aware preset count** — currently hardcoded to 3 slots, ignores kingdom tier
2. **Tier-aware ability effects** — currently uses the old "max strength" Phase 2B values, ignores T1/T2 tier distinction, caps ability IDs at 5
3. **Missing integrations** — no parcel cap enforcement, no `total_wins` tracking, no ability ownership verification

## Scope

Revise the existing `conquest.cairo` system and `PresetDefense` model. Add frontend UI for setting presets and initiating conquest. Preserve existing behavior that already matches the spec (adjacency, budgets, HP, last stand, tie-to-defender).

**Out of scope:**
- Faction reinforcement presets (factions don't exist yet — deferred)
- Commit-reveal for conquest (single-transaction is sufficient — attacker commits before vRNG rolls)
- Ability burning (per design discussion, conquest does not consume abilities)
- Reputation/MatchRecord integration (conquest is territorial, not a matchmaking activity)

## PresetDefense Model Expansion

Add a 4th preset slot to support Basileia tier. The model's flat layout is kept for consistency with the existing schema.

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct PresetDefense {
    #[key]
    pub player: ContractAddress,
    // Preset 0 (Polis+)
    pub p0_p0: u8, pub p0_p1: u8, pub p0_p2: u8,
    pub p0_g0: u8, pub p0_g1: u8, pub p0_g2: u8,
    // Preset 1 (Strategos+)
    pub p1_p0: u8, pub p1_p1: u8, pub p1_p2: u8,
    pub p1_g0: u8, pub p1_g1: u8, pub p1_g2: u8,
    // Preset 2 (Hegemonia+)
    pub p2_p0: u8, pub p2_p1: u8, pub p2_p2: u8,
    pub p2_g0: u8, pub p2_g1: u8, pub p2_g2: u8,
    // Preset 3 (Basileia)
    pub p3_p0: u8, pub p3_p1: u8, pub p3_p2: u8,
    pub p3_g0: u8, pub p3_g1: u8, pub p3_g2: u8,
    pub preset_count: u8,
}
```

**Deployment note:** Adding fields to a deployed Dojo model requires a migration. On local dev, a rebuild is sufficient. For Sepolia, the model upgrade happens automatically during `sozo migrate`.

## Tier Preset Count Helper

Add to `src/systems/world_system.cairo` alongside the existing tier helpers:

```cairo
pub fn tier_preset_count(tier: u8) -> u8 {
    match tier {
        0 => 1,  // Polis
        1 => 2,  // Strategos
        2 => 3,  // Hegemonia
        3 => 4,  // Basileia
        _ => 1,
    }
}
```

## set_preset_defense Changes

Modified signature: unchanged (`index, p0, p1, p2, g0, g1, g2`).

Modified behavior:

1. Read caller's `PlayerKingdom`
2. Assert `kingdom.registered`
3. Compute `max_presets = tier_preset_count(kingdom.tier)`
4. Assert `index < max_presets` — Polis players can only set index 0, Strategos 0-1, etc.
5. Validate budget: `p0 + p1 + p2 + g0 + g1 + g2 <= 12` (unchanged)
6. Store into the corresponding slot. Add a new branch for `index == 3` that writes to `p3_*` fields.
7. Update `preset_count` if `index >= preset_count`

## initiate_conquest Changes

### Parcel cap check (new, at start)

After the basic validation (attacker budget, target parcel exists, target is non-home, target not owned by attacker), add:

```cairo
let ak: PlayerKingdom = world.read_model(attacker);
assert(ak.registered, 'Not registered');
let non_home = if ak.parcel_count > 3 { ak.parcel_count - 3 } else { 0 };
let cap = super::tier_parcel_cap(ak.tier);
assert(non_home < cap, 'Parcel cap reached');
```

A player at their parcel cap cannot initiate conquest. They must upgrade their kingdom tier first.

### Ability validation expansion

Change `assert(ability_id <= 5)` to `assert(ability_id <= 10)`.

If `ability_id > 0`, verify ownership via ERC-1155 balance check:

```cairo
if ability_id > 0 {
    assert(ability_id <= 10, 'Invalid ability ID');
    assert(ability_target <= 2, 'Invalid ability target');

    let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);
    let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
    let balance = erc1155.balance_of(attacker, ability_id.into());
    assert(balance >= 1_u256, 'Ability not owned');
}
```

The ability is NOT burned. Conquest uses abilities as "tricks" without consuming them.

### Tier-aware ability effects

Duplicate these helper functions at the module level of `conquest.cairo`:

```cairo
fn ability_type_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) % 5) + 1 }
}

fn ability_tier_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) / 5) + 1 }
}
```

Apply effects using T1/T2 values:

**Fortify (type 5)** — applied to attacker's defense values before damage calc:
```cairo
if ability_type == 5 {
    if ability_tier == 1 {
        atk_g0 = atk_g0 + 1;
        atk_g1 = atk_g1 + 1;
        atk_g2 = atk_g2 + 1;
    } else {
        atk_g0 = atk_g0 * 2;
        atk_g1 = atk_g1 * 2;
        atk_g2 = atk_g2 * 2;
    }
}
```

**Siege Sword (type 1)** — overrides attack on target gate:
```cairo
if ability_type == 1 {
    let new_attack: u8 = if ability_tier == 1 { 5 } else { 10 };
    if ability_target == 0 { atk_p0 = new_attack; }
    else if ability_target == 1 { atk_p1 = new_attack; }
    else { atk_p2 = new_attack; }
}
```

**Stone Cloak (type 2)** — applied after total damage to attacker calculated:
```cairo
if ability_type == 2 {
    if ability_tier == 1 {
        total_dmg_to_atk = total_dmg_to_atk / 2;
    } else {
        total_dmg_to_atk = 0;
    }
}
```

**Hex (type 4)** — reduces total damage to attacker:
```cairo
if ability_type == 4 {
    let reduction: u8 = if ability_tier == 1 { 3 } else { 8 };
    if total_dmg_to_atk > reduction {
        total_dmg_to_atk = total_dmg_to_atk - reduction;
    } else {
        total_dmg_to_atk = 0;
    }
}
```

**Ember Blast (type 3)** — direct damage to defender vault, applied after HP calc:
```cairo
if ability_type == 3 {
    let ember_dmg: u8 = if ability_tier == 1 { 2 } else { 6 };
    if def_hp > ember_dmg { def_hp = def_hp - ember_dmg; } else { def_hp = 0; }
}
```

### VRF selection supports 4 presets

The current code does `random_value % defense.preset_count` and maps to slots 0-2. Extend the slot selection to include slot 3:

```cairo
let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if preset_idx == 0 {
    (defense.p0_p0, defense.p0_p1, defense.p0_p2, defense.p0_g0, defense.p0_g1, defense.p0_g2)
} else if preset_idx == 1 {
    (defense.p1_p0, defense.p1_p1, defense.p1_p2, defense.p1_g0, defense.p1_g1, defense.p1_g2)
} else if preset_idx == 2 {
    (defense.p2_p0, defense.p2_p1, defense.p2_p2, defense.p2_g0, defense.p2_g1, defense.p2_g2)
} else {
    (defense.p3_p0, defense.p3_p1, defense.p3_p2, defense.p3_g0, defense.p3_g1, defense.p3_g2)
};
```

### Total wins increment on attacker win

In the attacker-wins branch, after the parcel transfer and parcel_count update:

```cairo
let mut ak: PlayerKingdom = world.read_model(attacker);
ak.parcel_count += 1;
ak.total_wins += 1;  // NEW
world.write_model(@ak);
```

The defender does NOT get a `total_wins` credit on a successful defense. Only the attacker is progressing through conquest wins.

## Frontend Changes

### `frontend/src/lib/conquest.ts` (new file)

Contract call wrappers:
```typescript
export async function setPresetDefense(
  account: AccountInterface,
  index: number,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
): Promise<string>

export async function initiateConquest(
  account: AccountInterface,
  targetParcelId: number,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
  abilityId: number,
  abilityTarget: number,
): Promise<string>
```

Hooks:
```typescript
export function usePresetDefense(playerAddress: string | null): {
  slots: Array<{ p0, p1, p2, g0, g1, g2 } | null>;
  presetCount: number;
} | null;

export function useConquestTarget(parcelId: number | null): {
  parcel: ParcelData;
  owner: string;
  ownerTier: number;
  ownerPresets: Array<{...}>;
} | null;
```

### New Components

**`PresetDefenseEditor.tsx`** — lets the player set defense presets:
- Shows slots based on player's kingdom tier (`tier_preset_count`)
- Each slot has 6 numeric inputs (p0-p2, g0-g2) with a budget counter (max 12)
- "Save Preset" button per slot calls `setPresetDefense`
- Visual distinction for slots already saved vs empty

**`ConquestScout.tsx`** — shows target parcel details:
- Parcel owner, owner's kingdom tier, owner's registered presets
- Lists the attacker's own parcels adjacent to this target
- "Attack" button opens the conquest attack modal

**`ConquestAttack.tsx`** — attacker's allocation + ability pick:
- 6 numeric inputs for p0-p2/g0-g2 with budget counter (max 10)
- Ability selector (reuse existing `AbilitySelector` component or similar) — shows abilities the attacker owns
- Target gate picker for Siege Sword
- "Confirm Conquest" calls `initiateConquest`

### Integration on the `/world` page

- Add a "Defense" tab or panel to the kingdom summary where the player edits their presets
- On the hex map, clicking an enemy non-home parcel opens the `ConquestScout` panel
- From scout, the "Attack" button opens `ConquestAttack` as a modal

## Test Coverage

The existing `src/tests/test_conquest.cairo` has tests for the old behavior. Tests to add or update in that file:

- `test_set_preset_defense_polis_only_slot_0` — Polis player (tier 0) can set index 0 but fails on index 1
- `test_set_preset_defense_basileia_all_four_slots` — Basileia player can set all 4 slots
- `test_initiate_conquest_requires_ability_ownership` — attacker trying to use ability they don't own panics
- `test_initiate_conquest_t1_siege_sword_sets_attack_to_5` — T1 effect value
- `test_initiate_conquest_t2_siege_sword_sets_attack_to_10` — T2 effect value
- `test_initiate_conquest_parcel_cap_enforced` — attacker at cap can't initiate
- `test_initiate_conquest_attacker_win_increments_total_wins` — win writes to `PlayerKingdom.total_wins`
- `test_initiate_conquest_4th_preset_can_be_selected` — VRF selection works with 4 presets
- Existing tests that relied on old ability values need updating (test_conquest_with_stone_cloak, etc.)

## Implementation Priority

1. `PresetDefense` model expansion (add `p3_*` fields)
2. `tier_preset_count` helper
3. `set_preset_defense` tier enforcement
4. `initiate_conquest` parcel cap check
5. `initiate_conquest` ability ID range + ownership check
6. `initiate_conquest` tier-aware effects + VRF 4-slot selection
7. `initiate_conquest` total_wins increment
8. Update existing conquest tests + add new ones
9. Frontend `conquest.ts` hooks and contract wrappers
10. `PresetDefenseEditor` component
11. `ConquestScout` + `ConquestAttack` components
12. Integration with `/world` page

## What This Does NOT Include

- Faction reinforcement presets (factions deferred)
- Commit-reveal flow (single transaction is sufficient)
- Ability burning on use (abilities stay in wallet)
- Reputation updates (conquest is separate from matchmaking reputation)
- Match history records (conquest is not a head-to-head match)
- Defender-side rewards on successful defense (passive defense doesn't get win credit)
