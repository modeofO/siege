> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Conquest Match Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the conquest system to enforce kingdom-tier preset counts, support T1/T2 ability effects with token IDs 1-10, verify ability ownership, enforce parcel caps, and track wins.

**Architecture:** Expand `PresetDefense` with a 4th slot. Add a `tier_preset_count` helper. `set_preset_defense` enforces tier limits. `initiate_conquest` verifies ability ownership via ERC-1155 balance, derives tier-aware effects, checks parcel caps, and increments `total_wins` on victory. Frontend adds preset editor and conquest UI.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, Next.js, React 19

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/models/preset_defense.cairo` | Add 4th preset slot (`p3_*`) |
| Modify | `src/systems/world_system.cairo` | Add `tier_preset_count` helper |
| Modify | `src/systems/conquest.cairo` | Tier enforcement, tier-aware abilities, parcel cap, total_wins tracking |
| Modify | `src/tests/test_conquest.cairo` | Update tests for new behavior + add new tests |
| Create | `frontend/src/lib/conquest.ts` | Hooks and contract wrappers |

---

### Task 1: Expand PresetDefense Model

**Files:**
- Modify: `src/models/preset_defense.cairo`

- [ ] **Step 1: Add the 4th preset slot**

Replace the entire contents of `src/models/preset_defense.cairo`:

```cairo
use starknet::ContractAddress;

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
    // Preset 3 (Basileia only)
    pub p3_p0: u8, pub p3_p1: u8, pub p3_p2: u8,
    pub p3_g0: u8, pub p3_g1: u8, pub p3_g2: u8,
    pub preset_count: u8,
}
```

- [ ] **Step 2: Run tests to verify compilation**

Run: `sozo test`
Expected: All 129 existing tests still pass. The new field `p3_*` will default to 0 in existing tests.

- [ ] **Step 3: Commit**

```bash
git add src/models/preset_defense.cairo
git commit -m "feat: add 4th preset slot to PresetDefense for Basileia tier"
```

---

### Task 2: Add tier_preset_count Helper

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Add the helper**

In `src/systems/world_system.cairo`, find the other tier helper functions (`tier_ability_slots`, `tier_parcel_cap`, `tier_wins_required`). They're defined OUTSIDE the `mod world_system` block. Add this function alongside them:

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

- [ ] **Step 2: Run tests**

Run: `sozo test`
Expected: All 129 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/systems/world_system.cairo
git commit -m "feat: add tier_preset_count helper"
```

---

### Task 3: Enforce Tier-Based Preset Slot Limit in set_preset_defense

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

- [ ] **Step 1: Update set_preset_defense**

In `src/systems/conquest.cairo`, find the existing `set_preset_defense` implementation. Replace the entire function with:

```cairo
fn set_preset_defense(
    ref self: ContractState,
    index: u8, p0: u8, p1: u8, p2: u8, g0: u8, g1: u8, g2: u8,
) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    // Tier-based slot limit
    let kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');
    let max_presets = siege_dojo::systems::world_system::tier_preset_count(kingdom.tier);
    assert(index < max_presets, 'Index exceeds tier limit');

    let total = p0 + p1 + p2 + g0 + g1 + g2;
    assert(total <= DEFENDER_BUDGET, 'Budget exceeds 12');

    let mut defense: PresetDefense = world.read_model(caller);

    // Store into the correct preset slot
    if index == 0 {
        defense.p0_p0 = p0; defense.p0_p1 = p1; defense.p0_p2 = p2;
        defense.p0_g0 = g0; defense.p0_g1 = g1; defense.p0_g2 = g2;
    } else if index == 1 {
        defense.p1_p0 = p0; defense.p1_p1 = p1; defense.p1_p2 = p2;
        defense.p1_g0 = g0; defense.p1_g1 = g1; defense.p1_g2 = g2;
    } else if index == 2 {
        defense.p2_p0 = p0; defense.p2_p1 = p1; defense.p2_p2 = p2;
        defense.p2_g0 = g0; defense.p2_g1 = g1; defense.p2_g2 = g2;
    } else {
        defense.p3_p0 = p0; defense.p3_p1 = p1; defense.p3_p2 = p2;
        defense.p3_g0 = g0; defense.p3_g1 = g1; defense.p3_g2 = g2;
    }

    // Track how many presets have been set
    if index >= defense.preset_count {
        defense.preset_count = index + 1;
    }

    world.write_model(@defense);
}
```

- [ ] **Step 2: Update existing conquest tests that set multiple presets**

The tests `test_conquest_attacker_wins`, `test_conquest_attacker_loses_parcel_to_defender`, `test_last_stand_no_parcel_loss`, `test_conquest_with_ember_blast`, and `test_conquest_with_stone_cloak` all set 3 presets (indices 0, 1, 2). After this task, those will fail because players default to tier 0 (Polis, 1 slot).

In `src/tests/test_conquest.cairo`, find the `conquest_setup` function (around line 157). After the `world_sys.register_player(array![0, 1, 2]);` line for `player_b`, add:

```cairo
// Upgrade player_b to Hegemonia (tier 2) so they can set 3 preset defense slots
let mut kb_tier: PlayerKingdom = world.read_model(player_b);
kb_tier.tier = 2;
world.write_model_test(@kb_tier);
```

- [ ] **Step 3: Add new tests**

Add these tests to `src/tests/test_conquest.cairo` inside the `mod tests` block:

```cairo
#[test]
#[should_panic(expected: ('Index exceeds tier limit', 'ENTRYPOINT_FAILED'))]
fn test_polis_cannot_set_preset_1() {
    let (mut world, conquest_sys, _, _, _) = conquest_setup();

    // Create a fresh Polis player (tier 0)
    let polis_player = deploy_user();
    starknet::testing::set_contract_address(polis_player);
    let world_sys: IWorldSystemDispatcher = IWorldSystemDispatcher {
        contract_address: world.dns(@"world_system").unwrap().0,
    };
    world_sys.register_player(array![0, 1, 2]);

    // Polis tier = 0, max 1 preset. Setting index 0 is ok, index 1 should fail.
    conquest_sys.set_preset_defense(0, 2, 2, 2, 2, 2, 2);
    conquest_sys.set_preset_defense(1, 2, 2, 2, 2, 2, 2); // should panic
}

#[test]
fn test_basileia_can_set_all_four_presets() {
    let (mut world, conquest_sys, world_sys, _, _) = conquest_setup();

    // Create a Basileia player (tier 3)
    let basileia_player = deploy_user();
    starknet::testing::set_contract_address(basileia_player);
    world_sys.register_player(array![0, 1, 2]);

    let mut kb: PlayerKingdom = world.read_model(basileia_player);
    kb.tier = 3;
    world.write_model_test(@kb);

    starknet::testing::set_contract_address(basileia_player);
    conquest_sys.set_preset_defense(0, 2, 2, 2, 2, 2, 2);
    conquest_sys.set_preset_defense(1, 2, 2, 2, 2, 2, 2);
    conquest_sys.set_preset_defense(2, 2, 2, 2, 2, 2, 2);
    conquest_sys.set_preset_defense(3, 2, 2, 2, 2, 2, 2);

    let defense: PresetDefense = world.read_model(basileia_player);
    assert(defense.preset_count == 4, 'should have 4 presets');
    assert(defense.p3_p0 == 2, 'p3 slot 0 should be 2');
}
```

Note: `test_basileia_can_set_all_four_presets` receives `world_sys` from `conquest_setup` — update the tuple destructure in that test accordingly. Looking at the existing `conquest_setup` signature: it returns `(world, conquest_sys, world_sys, player_a, player_b)`, so `world_sys` is the 3rd element.

- [ ] **Step 4: Run tests**

Run: `sozo test`
Expected: All tests pass. Existing tests should now work because player_b is upgraded to tier 2 (3 preset slots). New tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: enforce tier-based preset slot limit in set_preset_defense"
```

---

### Task 4: Add Parcel Cap Check to initiate_conquest

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

- [ ] **Step 1: Add the parcel cap check**

In `src/systems/conquest.cairo`, inside `initiate_conquest`, AFTER the existing validation (`atk_total <= ATTACKER_BUDGET`, ability validation, target parcel checks, adjacency check) and BEFORE reading defender's preset defense, add:

```cairo
// Tier-based parcel cap check
let ak: PlayerKingdom = world.read_model(attacker);
let non_home = if ak.parcel_count > 3 { ak.parcel_count - 3 } else { 0 };
let cap = siege_dojo::systems::world_system::tier_parcel_cap(ak.tier);
assert(non_home < cap, 'Parcel cap reached');
```

Note: the attacker's kingdom is already read later in the function for `atk_kingdom`. You can either reuse that read or move the existing read up. Cleanest: move the existing `atk_kingdom` read to the top, rename it to `ak`, and use it for both the adjacency check and the parcel cap check.

Looking at the existing code structure:

```cairo
// Attacker must have a parcel adjacent to target
let atk_kingdom: PlayerKingdom = world.read_model(attacker);
assert(atk_kingdom.registered, 'Not registered');
```

Replace this section (and the parcel cap check block) with:

```cairo
// Attacker kingdom for adjacency + parcel cap check
let atk_kingdom: PlayerKingdom = world.read_model(attacker);
assert(atk_kingdom.registered, 'Not registered');

// Tier-based parcel cap check
let non_home = if atk_kingdom.parcel_count > 3 { atk_kingdom.parcel_count - 3 } else { 0 };
let cap = siege_dojo::systems::world_system::tier_parcel_cap(atk_kingdom.tier);
assert(non_home < cap, 'Parcel cap reached');
```

- [ ] **Step 2: Write the test**

Add to `src/tests/test_conquest.cairo`:

```cairo
#[test]
#[should_panic(expected: ('Parcel cap reached', 'ENTRYPOINT_FAILED'))]
fn test_conquest_rejects_at_parcel_cap() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // player_a starts with 3 home parcels + 1 non-home (parcel 8) = 4 total
    // Polis cap is 2 non-home parcels. Give player_a one more non-home parcel
    // to reach cap (3 home + 2 non-home = 5 parcels).
    let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
    let config: WorldConfig = world.read_model(0_u8);
    let mut extra_id: u32 = 999;
    let mut p: u32 = 0;
    while p < config.total_parcels {
        let parcel: Parcel = world.read_model(p);
        if parcel.owner == zero_addr {
            extra_id = p;
            break;
        }
        p += 1;
    };
    assert(extra_id != 999, 'need an unclaimed parcel');
    let mut extra: Parcel = world.read_model(extra_id);
    extra.owner = player_a;
    extra.is_home = false;
    world.write_model_test(@extra);
    let mut ka: PlayerKingdom = world.read_model(player_a);
    ka.parcel_count = 5; // 3 home + 2 non-home, at Polis cap
    world.write_model_test(@ka);

    // Set up defender presets
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

    // Give B parcel 9 as a non-home parcel to target
    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker at cap tries to conquest — should panic
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);
}
```

- [ ] **Step 3: Run the test**

Run: `sozo test -f test_conquest_rejects_at_parcel_cap`
Expected: PASS (should panic with 'Parcel cap reached')

Run: `sozo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: enforce parcel cap in initiate_conquest"
```

---

### Task 5: Tier-Aware Ability Effects + Ownership Check

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

This is the biggest change. The current `initiate_conquest` applies old hardcoded "max strength" ability values. We're replacing them with tier-aware values and adding an ability ownership check.

- [ ] **Step 1: Add IERC1155 interface and helper functions**

In `src/systems/conquest.cairo`, at the top of `mod conquest` (alongside the existing `IVrfProvider` trait and `Source` enum), add:

```cairo
// ERC-1155 interface for ability ownership check
#[starknet::interface]
trait IERC1155<T> {
    fn balance_of(self: @T, account: ContractAddress, token_id: u256) -> u256;
}

fn ability_type_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) % 5) + 1 }
}

fn ability_tier_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) / 5) + 1 }
}
```

- [ ] **Step 2: Update ability validation**

In `initiate_conquest`, find the current ability validation:

```cairo
// Validate ability (0 = none, 1-5 = valid)
if ability_id > 0 {
    assert(ability_id <= 5, 'Invalid ability ID');
    assert(ability_target <= 2, 'Invalid ability target');
}
```

Replace with:

```cairo
// Validate ability (0 = none, 1-10 = valid)
if ability_id > 0 {
    assert(ability_id <= 10, 'Invalid ability ID');
    assert(ability_target <= 2, 'Invalid ability target');

    // Verify attacker owns the ability token
    let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);
    let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
    let balance = erc1155.balance_of(attacker, ability_id.into());
    assert(balance >= 1_u256, 'Ability not owned');
}
```

- [ ] **Step 3: Update Fortify effect (applied before damage calc)**

In `initiate_conquest`, find the existing Fortify block:

```cairo
// Fortify (ID 5): double attacker defense
if ability_id == 5 {
    atk_g0 = atk_g0 * 2;
    atk_g1 = atk_g1 * 2;
    atk_g2 = atk_g2 * 2;
}
```

Replace with:

```cairo
// Fortify — tier-aware defense boost
let a_type = ability_type_from_token(ability_id);
let a_tier = ability_tier_from_token(ability_id);
if a_type == 5 {
    if a_tier == 1 {
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

- [ ] **Step 4: Update Siege Sword effect**

Find:

```cairo
// Siege Sword (ID 1): override attack on target gate to 10
if ability_id == 1 {
    if ability_target == 0 { atk_p0 = 10; }
    else if ability_target == 1 { atk_p1 = 10; }
    else { atk_p2 = 10; }
}
```

Replace with:

```cairo
// Siege Sword — tier-aware attack override
if a_type == 1 {
    let new_attack: u8 = if a_tier == 1 { 5 } else { 10 };
    if ability_target == 0 { atk_p0 = new_attack; }
    else if ability_target == 1 { atk_p1 = new_attack; }
    else { atk_p2 = new_attack; }
}
```

- [ ] **Step 5: Update Stone Cloak effect**

Find:

```cairo
// Stone Cloak (ID 2): zero all gate damage to attacker
if ability_id == 2 {
    total_dmg_to_atk = 0;
}
```

Replace with:

```cairo
// Stone Cloak — tier-aware gate damage reduction
if a_type == 2 {
    if a_tier == 1 {
        total_dmg_to_atk = total_dmg_to_atk / 2;
    } else {
        total_dmg_to_atk = 0;
    }
}
```

- [ ] **Step 6: Update Hex effect**

Find:

```cairo
// Hex (ID 4): reduce damage to attacker by 7
if ability_id == 4 {
    if total_dmg_to_atk > 7 { total_dmg_to_atk = total_dmg_to_atk - 7; }
    else { total_dmg_to_atk = 0; }
}
```

Replace with:

```cairo
// Hex — tier-aware total damage reduction
if a_type == 4 {
    let reduction: u8 = if a_tier == 1 { 3 } else { 8 };
    if total_dmg_to_atk > reduction {
        total_dmg_to_atk = total_dmg_to_atk - reduction;
    } else {
        total_dmg_to_atk = 0;
    }
}
```

- [ ] **Step 7: Update Ember Blast effect**

Find:

```cairo
// Ember Blast (ID 3): 5 direct damage to defender vault
if ability_id == 3 {
    if def_hp > 5 { def_hp = def_hp - 5; } else { def_hp = 0; }
}
```

Replace with:

```cairo
// Ember Blast — tier-aware direct vault damage
if a_type == 3 {
    let ember_dmg: u8 = if a_tier == 1 { 2 } else { 6 };
    if def_hp > ember_dmg { def_hp = def_hp - ember_dmg; } else { def_hp = 0; }
}
```

- [ ] **Step 8: Update VRF selection to support 4 presets**

Find this block in `initiate_conquest`:

```cairo
// Read selected preset
let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if preset_idx == 0 {
    (defense.p0_p0, defense.p0_p1, defense.p0_p2, defense.p0_g0, defense.p0_g1, defense.p0_g2)
} else if preset_idx == 1 {
    (defense.p1_p0, defense.p1_p1, defense.p1_p2, defense.p1_g0, defense.p1_g1, defense.p1_g2)
} else {
    (defense.p2_p0, defense.p2_p1, defense.p2_p2, defense.p2_g0, defense.p2_g1, defense.p2_g2)
};
```

Replace with:

```cairo
// Read selected preset (supports 4 slots)
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

- [ ] **Step 9: Update existing ability-related conquest tests**

The existing tests `test_conquest_with_ember_blast` and `test_conquest_with_stone_cloak` assume old "max strength" values. With T1 values they'd fail. We need to either change them to use T2 tokens (IDs 7 for Stone Cloak T2, 8 for Ember Blast T2) or rework the numeric values. We'll change them to use T2 token IDs AND mint the T2 ability tokens to player_a first.

Find `test_conquest_with_ember_blast` and replace it entirely with:

```cairo
#[test]
fn test_conquest_with_ember_blast_t2() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Give player_a a T2 Ember Blast (token ID 8)
    let rc: ResourceConfig = world.read_model(0_u8);
    let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
    let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
    starknet::testing::set_contract_address(world_sys_addr);
    ability_token.mint(player_a, 8_u256, 1_u256);

    // Defender: no attack, moderate defense
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 4, 4, 4);
    conquest_sys.set_preset_defense(1, 0, 0, 0, 4, 4, 4);
    conquest_sys.set_preset_defense(2, 0, 0, 0, 4, 4, 4);

    // Give B parcel 9 as a non-home parcel
    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker: 5/5/0 attack, no defense, T2 Ember Blast (token ID 8 = 6 damage)
    // Gate damage to defender: (5-4)+(5-4)+(0-4)=0 = 2
    // Defender HP: 15 - 2 = 13, then T2 Ember Blast -6 = 7
    // Defender attack = 0 → damage to attacker = 0
    // Attacker HP: 10
    // 10 > 7 → attacker wins
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 5, 5, 0, 0, 0, 0, 8, 0);

    let target: Parcel = world.read_model(9_u32);
    assert(target.owner == player_a, 'ember blast t2 should win');
}
```

Find `test_conquest_with_stone_cloak` and replace it entirely with:

```cairo
#[test]
fn test_conquest_with_stone_cloak_t2() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Give player_a a T2 Stone Cloak (token ID 7)
    let rc: ResourceConfig = world.read_model(0_u8);
    let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
    let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
    starknet::testing::set_contract_address(world_sys_addr);
    ability_token.mint(player_a, 7_u256, 1_u256);

    // Defender: heavy counterattack
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0);
    conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
    conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker: 10/0/0 attack, no defense, T2 Stone Cloak (token ID 7 = zeros damage)
    // Gate damage to defender: (10-0)+(0-0)+(0-0) = 10. Def HP: 15-10 = 5
    // Gate damage to attacker: 4+4+4 = 12. T2 Stone Cloak → 0
    // Attacker HP: 10
    // 10 > 5 → attacker wins
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 7, 0);

    let target: Parcel = world.read_model(9_u32);
    assert(target.owner == player_a, 'stone cloak t2 should win');
}
```

- [ ] **Step 10: Add new T1 effect tests**

Add these tests to `src/tests/test_conquest.cairo`:

```cairo
#[test]
fn test_conquest_t1_siege_sword_attack_5() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Give player_a a T1 Siege Sword (token ID 1)
    let rc: ResourceConfig = world.read_model(0_u8);
    let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
    let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
    starknet::testing::set_contract_address(world_sys_addr);
    ability_token.mint(player_a, 1_u256, 1_u256);

    // Defender: weak, only has defense
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 2, 2, 2);
    conquest_sys.set_preset_defense(1, 0, 0, 0, 2, 2, 2);
    conquest_sys.set_preset_defense(2, 0, 0, 0, 2, 2, 2);

    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker: p0=1, ability=1 (T1 Siege Sword, sets attack to 5)
    // Gate damage: (5-2)+(0-2)+(0-2) = 3. Def HP: 15-3 = 12
    // Attacker HP: 10. 10 < 12 → defender wins.
    // But this just tests the T1 override mechanic, not win condition.
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 1, 0, 0, 0, 0, 0, 1, 0);

    // The test above loses. Let's verify the attacker lost a parcel (expected from T1 value)
    // If we had T2 (attack = 10), dmg would be (10-2)=8, def hp = 7, 10 > 7 → attacker wins.
    // T1: dmg = (5-2)=3, def hp = 12, 10 < 12 → defender wins.
    let target: Parcel = world.read_model(9_u32);
    assert(target.owner == player_b, 'T1 siege should lose here');
}

#[test]
#[should_panic(expected: ('Ability not owned', 'ENTRYPOINT_FAILED'))]
fn test_conquest_rejects_unowned_ability() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Defender setup
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker tries to use ability 1 (Siege Sword) without owning it
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 5, 0, 0, 0, 0, 0, 1, 0);
}
```

- [ ] **Step 11: Run all conquest tests**

Run: `sozo test -f test_conquest`
Expected: All conquest tests pass, including the new ones.

Run: `sozo test`
Expected: All tests pass (~134 total).

- [ ] **Step 12: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: tier-aware ability effects + ownership check in conquest"
```

---

### Task 6: Total Wins Increment on Conquest Victory

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

- [ ] **Step 1: Update attacker-win branch**

In `src/systems/conquest.cairo`, find the attacker-wins branch in `initiate_conquest`:

```cairo
if attacker_wins {
    // Transfer target parcel to attacker
    let mut t = target;
    t.owner = attacker;
    world.write_model(@t);

    let mut ak: PlayerKingdom = world.read_model(attacker);
    ak.parcel_count += 1;
    world.write_model(@ak);

    let mut dk: PlayerKingdom = world.read_model(defender);
    dk.parcel_count -= 1;
    world.write_model(@dk);
}
```

Update the `ak` mutation to also increment `total_wins`:

```cairo
if attacker_wins {
    // Transfer target parcel to attacker
    let mut t = target;
    t.owner = attacker;
    world.write_model(@t);

    let mut ak: PlayerKingdom = world.read_model(attacker);
    ak.parcel_count += 1;
    ak.total_wins += 1;
    world.write_model(@ak);

    let mut dk: PlayerKingdom = world.read_model(defender);
    dk.parcel_count -= 1;
    world.write_model(@dk);
}
```

- [ ] **Step 2: Write the test**

Add to `src/tests/test_conquest.cairo`:

```cairo
#[test]
fn test_conquest_win_increments_total_wins() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Defender: weak
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
    conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    let ka_before: PlayerKingdom = world.read_model(player_a);
    assert(ka_before.total_wins == 0, 'should start at 0 wins');

    // Attacker wins with overwhelming force
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);

    let ka_after: PlayerKingdom = world.read_model(player_a);
    assert(ka_after.total_wins == 1, 'total_wins should be 1');
}

#[test]
fn test_conquest_loss_no_total_wins() {
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Defender: strong counterattack
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0);
    conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
    conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

    let mut tp: Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    // Attacker loses
    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 1, 1, 1, 0, 0, 0, 0, 0);

    let ka_after: PlayerKingdom = world.read_model(player_a);
    assert(ka_after.total_wins == 0, 'no wins on loss');
    // Defender should NOT get a win credit either
    let kb_after: PlayerKingdom = world.read_model(player_b);
    assert(kb_after.total_wins == 0, 'defender gets no win');
}
```

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_conquest_win_increments_total_wins && sozo test -f test_conquest_loss_no_total_wins`
Expected: PASS

Run: `sozo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: increment total_wins on conquest victory"
```

---

### Task 7: Frontend Conquest Library

**Files:**
- Create: `frontend/src/lib/conquest.ts`

- [ ] **Step 1: Create conquest.ts**

Create `frontend/src/lib/conquest.ts`:

```typescript
import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

export const CONQUEST_ADDRESS = process.env.NEXT_PUBLIC_CONQUEST_ADDRESS || "";

export interface PresetSlot {
  p0: number;
  p1: number;
  p2: number;
  g0: number;
  g1: number;
  g2: number;
}

export interface PresetDefenseData {
  slots: PresetSlot[];
  presetCount: number;
}

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

export function usePresetDefense(playerAddress: string | null): PresetDefenseData | null {
  const [data, setData] = useState<PresetDefenseData | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPresetDefenseModels: GraphEdges<{
          p0_p0: string; p0_p1: string; p0_p2: string;
          p0_g0: string; p0_g1: string; p0_g2: string;
          p1_p0: string; p1_p1: string; p1_p2: string;
          p1_g0: string; p1_g1: string; p1_g2: string;
          p2_p0: string; p2_p1: string; p2_p2: string;
          p2_g0: string; p2_g1: string; p2_g2: string;
          p3_p0: string; p3_p1: string; p3_p2: string;
          p3_g0: string; p3_g1: string; p3_g2: string;
          preset_count: string;
        }>;
      }>(`
        query {
          siegeDojoPresetDefenseModels(where: { player: "${playerAddress}" }) {
            edges { node {
              p0_p0 p0_p1 p0_p2 p0_g0 p0_g1 p0_g2
              p1_p0 p1_p1 p1_p2 p1_g0 p1_g1 p1_g2
              p2_p0 p2_p1 p2_p2 p2_g0 p2_g1 p2_g2
              p3_p0 p3_p1 p3_p2 p3_g0 p3_g1 p3_g2
              preset_count
            } }
          }
        }
      `);

      const node = result?.siegeDojoPresetDefenseModels?.edges?.[0]?.node;
      if (!node) {
        setData({ slots: [], presetCount: 0 });
        return;
      }

      const slots: PresetSlot[] = [
        { p0: toNum(node.p0_p0), p1: toNum(node.p0_p1), p2: toNum(node.p0_p2),
          g0: toNum(node.p0_g0), g1: toNum(node.p0_g1), g2: toNum(node.p0_g2) },
        { p0: toNum(node.p1_p0), p1: toNum(node.p1_p1), p2: toNum(node.p1_p2),
          g0: toNum(node.p1_g0), g1: toNum(node.p1_g1), g2: toNum(node.p1_g2) },
        { p0: toNum(node.p2_p0), p1: toNum(node.p2_p1), p2: toNum(node.p2_p2),
          g0: toNum(node.p2_g0), g1: toNum(node.p2_g1), g2: toNum(node.p2_g2) },
        { p0: toNum(node.p3_p0), p1: toNum(node.p3_p1), p2: toNum(node.p3_p2),
          g0: toNum(node.p3_g0), g1: toNum(node.p3_g1), g2: toNum(node.p3_g2) },
      ];

      setData({ slots, presetCount: toNum(node.preset_count) });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export async function setPresetDefense(
  account: AccountInterface,
  index: number,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "set_preset_defense",
    calldata: [
      index.toString(),
      p0.toString(), p1.toString(), p2.toString(),
      g0.toString(), g1.toString(), g2.toString(),
    ],
  });
  return result.transaction_hash;
}

export async function initiateConquest(
  account: AccountInterface,
  targetParcelId: number,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
  abilityId: number,
  abilityTarget: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "initiate_conquest",
    calldata: [
      targetParcelId.toString(),
      p0.toString(), p1.toString(), p2.toString(),
      g0.toString(), g1.toString(), g2.toString(),
      abilityId.toString(),
      abilityTarget.toString(),
    ],
  });
  return result.transaction_hash;
}

export const DEFENDER_BUDGET = 12;
export const ATTACKER_BUDGET = 10;
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/conquest.ts
git commit -m "feat: add conquest frontend — usePresetDefense hook, contract wrappers"
```

---

### Task 8: Final Integration

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All tests pass (~135).

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 pass.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for conquest revisions"
```
