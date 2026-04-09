# Kingdom Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-tier kingdom progression system (Polis → Strategos → Hegemonia → Basileia) that gates ability slots, defense presets, and parcel caps — the core power-depth layer of the game direction redesign. Names draw from ancient Greek: Polis (city-state), Strategos (military commander), Hegemonia (regional dominance), Basileia (kingdom/empire).

**Architecture:** Extend the existing `PlayerKingdom` Dojo model with a `tier` field. Add an `upgrade_kingdom` function to `world_system` that validates requirements (wins + resource burns) and advances the tier. Modify `create_staked_match` / `join_staked_match` to enforce ability slot limits per tier. Modify `claim_parcel` to enforce parcel caps per tier. Frontend shows tier on player profile and kingdom upgrade UI.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, sozo v1.8.6, Next.js, React 19, Tailwind 4

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/models/player_kingdom.cairo` | Add `tier` and `total_wins` fields |
| Modify | `src/systems/world_system.cairo` | Add `upgrade_kingdom`, enforce tier limits in staked match + claim |
| Modify | `src/systems/commit_reveal_1v1.cairo` | Enforce ability slot limit per tier during reveal |
| Create | `src/tests/test_kingdom_tiers.cairo` | All tier-related tests |
| Modify | `src/lib.cairo` | Register new test module |
| Modify | `frontend/src/lib/gameState1v1.ts` | Expose tier in match state queries |
| Modify | `frontend/src/lib/contracts1v1.ts` | Add `upgradeKingdom` contract call |

## Tier Constants

Used across tasks — these are the authoritative values:

```
TIER_POLIS      = 0  → ability_slots: 1, parcel_cap: 2, defense_presets: 1
TIER_STRATEGOS  = 1  → ability_slots: 2, parcel_cap: 5, defense_presets: 2
TIER_HEGEMONIA  = 2  → ability_slots: 3, parcel_cap: 8, defense_presets: 3
TIER_BASILEIA   = 3  → ability_slots: 4, parcel_cap: 12, defense_presets: 4
```

Upgrade requirements:
```
Polis → Strategos:  10 wins + 20 Iron + 20 Stone + 10 Wood
Strategos → Hegemonia:  30 wins + 50 Iron + 50 Stone + 30 Wood + 20 Ember
Hegemonia → Basileia:    60 wins + 100 Iron + 100 Stone + 60 Wood + 40 Ember + 20 Seeds
```

These can be tuned later — the contract should read them from constants, not hardcode in multiple places.

---

### Task 1: Extend PlayerKingdom Model

**Files:**
- Modify: `src/models/player_kingdom.cairo`

- [ ] **Step 1: Write the failing test**

Create `src/tests/test_kingdom_tiers.cairo` with a test that reads the new `tier` and `total_wins` fields:

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_player_kingdom_has_tier_and_wins() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let player = contract_address_const::<0x1>();
        world.write_model_test(@PlayerKingdom {
            player,
            home_0: 0, home_1: 1, home_2: 2,
            parcel_count: 3,
            registered: true,
            free_craft_used: false,
            last_drip_time: 0,
            tier: 0,
            total_wins: 0,
        });

        let k: PlayerKingdom = world.read_model(player);
        assert(k.tier == 0, 'tier should be 0');
        assert(k.total_wins == 0, 'wins should be 0');
    }
}
```

- [ ] **Step 2: Register test module in lib.cairo**

Add to `src/lib.cairo` in the `#[cfg(test)]` block:

```cairo
pub mod test_kingdom_tiers;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `sozo test -f test_player_kingdom_has_tier_and_wins`
Expected: FAIL — `PlayerKingdom` doesn't have `tier` or `total_wins` fields

- [ ] **Step 4: Add tier and total_wins to PlayerKingdom**

Modify `src/models/player_kingdom.cairo`:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerKingdom {
    #[key]
    pub player: ContractAddress,
    pub home_0: u32,
    pub home_1: u32,
    pub home_2: u32,
    pub parcel_count: u32,
    pub registered: bool,
    pub free_craft_used: bool,
    pub last_drip_time: u64,
    pub tier: u8,
    pub total_wins: u32,
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `sozo test -f test_player_kingdom_has_tier_and_wins`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/models/player_kingdom.cairo src/tests/test_kingdom_tiers.cairo src/lib.cairo
git commit -m "feat: add tier and total_wins fields to PlayerKingdom model"
```

---

### Task 2: Add Tier Helper Functions

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/test_kingdom_tiers.cairo`:

```cairo
#[test]
fn test_tier_ability_slots() {
    // Tier 0 (Polis) = 1 slot, Tier 1 (Strategos) = 2, Tier 2 (Hegemonia) = 3, Tier 3 (Basileia) = 4
    assert(siege_dojo::systems::world_system::tier_ability_slots(0) == 1, 'outpost: 1 slot');
    assert(siege_dojo::systems::world_system::tier_ability_slots(1) == 2, 'fortress: 2 slots');
    assert(siege_dojo::systems::world_system::tier_ability_slots(2) == 3, 'citadel: 3 slots');
    assert(siege_dojo::systems::world_system::tier_ability_slots(3) == 4, 'empire: 4 slots');
}

#[test]
fn test_tier_parcel_cap() {
    assert(siege_dojo::systems::world_system::tier_parcel_cap(0) == 2, 'outpost: 2 parcels');
    assert(siege_dojo::systems::world_system::tier_parcel_cap(1) == 5, 'fortress: 5 parcels');
    assert(siege_dojo::systems::world_system::tier_parcel_cap(2) == 8, 'citadel: 8 parcels');
    assert(siege_dojo::systems::world_system::tier_parcel_cap(3) == 12, 'empire: 12 parcels');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sozo test -f test_tier_ability_slots`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Add tier helper functions to world_system**

Add these public functions at the top of `src/systems/world_system.cairo` (outside the `mod world_system` block, after the interface):

```cairo
pub fn tier_ability_slots(tier: u8) -> u8 {
    match tier {
        0 => 1,
        1 => 2,
        2 => 3,
        3 => 4,
        _ => 1,
    }
}

pub fn tier_parcel_cap(tier: u8) -> u32 {
    match tier {
        0 => 2,
        1 => 5,
        2 => 8,
        3 => 12,
        _ => 2,
    }
}

pub fn tier_wins_required(tier: u8) -> u32 {
    match tier {
        1 => 10,
        2 => 30,
        3 => 60,
        _ => 0,
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sozo test -f test_tier_ability_slots && sozo test -f test_tier_parcel_cap`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: add tier helper functions (ability slots, parcel cap, wins required)"
```

---

### Task 3: Add upgrade_kingdom Function

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/test_kingdom_tiers.cairo`. This test needs the full world setup. Add the necessary imports and setup helpers (mirror the pattern from `test_staked_match.cairo`):

```cairo
use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait,
};
use starknet::{contract_address_const, SyscallResultTrait};
use siege_dojo::systems::world_system::{
    world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
};
use siege_dojo::systems::actions_1v1::actions_1v1;
use siege_dojo::systems::commit_reveal_1v1::commit_reveal_1v1;
use siege_dojo::systems::resolution_1v1::resolution_1v1;
use siege_dojo::models::parcel::{Parcel, m_Parcel};
use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
use siege_dojo::models::preset_defense::m_PresetDefense;
use siege_dojo::models::match_state_1v1::m_MatchState1v1;
use siege_dojo::models::node_state::m_NodeState;
use siege_dojo::models::commitment::m_Commitment;
use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
use siege_dojo::models::match_counter::m_MatchCounter;
use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
use siege_dojo::models::events::{
    e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
};
use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
use siege_dojo::tokens::resource_token::{ResourceToken, IResourceTokenDispatcher, IResourceTokenDispatcherTrait};
```

Setup helper that deploys resource tokens + ability token + world:

```cairo
// MockVrfProvider — same as other test files
#[starknet::contract]
pub mod MockVrfProvider {
    use starknet::ContractAddress;
    #[derive(Drop, Copy, Clone, Serde)]
    pub enum Source { Nonce: ContractAddress, Salt: felt252 }
    #[storage]
    struct Storage {}
    #[constructor]
    fn constructor(ref self: ContractState) {}
    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn consume_random(ref self: ContractState, source: Source) -> felt252 { 0 }
    }
}

#[starknet::contract]
pub mod MockAccount {
    const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;
    #[storage]
    struct Storage {}
    #[constructor]
    fn constructor(ref self: ContractState) {}
    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC6_ID
        }
    }
}

#[starknet::interface]
trait IERC1155Like<T> {
    fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
    fn set_approval_for_all(ref self: T, operator: starknet::ContractAddress, approved: bool);
}

fn deploy_mock_vrf() -> starknet::ContractAddress {
    let (addr, _) = starknet::syscalls::deploy_syscall(
        MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
    ).unwrap_syscall();
    addr
}

fn deploy_resource_token() -> starknet::ContractAddress {
    let (addr, _) = starknet::syscalls::deploy_syscall(
        ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
    ).unwrap_syscall();
    addr
}

fn deploy_ability_token(admin: starknet::ContractAddress) -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher, starknet::ContractAddress) {
    let mut calldata: Array<felt252> = array![];
    admin.serialize(ref calldata);
    let (addr, _) = starknet::syscalls::deploy_syscall(
        AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
    ).unwrap_syscall();
    (
        IAbilityTokenDispatcher { contract_address: addr },
        IERC1155LikeDispatcher { contract_address: addr },
        addr,
    )
}

fn deploy_user() -> starknet::ContractAddress {
    let (addr, _) = starknet::syscalls::deploy_syscall(
        MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
    ).unwrap_syscall();
    addr
}
```

Full namespace_def and contract_defs — same as test_staked_match.cairo (include all models, contracts, events).

Setup function that creates world, tokens, and a registered player with enough resources to upgrade:

```cairo
fn setup_with_resources() -> (
    dojo::world::WorldStorage,
    IWorldSystemDispatcher,
    starknet::ContractAddress, // player
    IERC1155LikeDispatcher,
) {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
    let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

    // VRF
    let mock_vrf_addr = deploy_mock_vrf();
    let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
    let actions_sys = siege_dojo::systems::actions_1v1::IActions1v1Dispatcher { contract_address: actions_addr };
    actions_sys.set_vrf_provider(mock_vrf_addr);

    // Deploy resource tokens
    let iron = deploy_resource_token();
    let linen = deploy_resource_token();
    let stone = deploy_resource_token();
    let wood = deploy_resource_token();
    let ember = deploy_resource_token();
    let seeds = deploy_resource_token();

    // AbilityToken
    let admin = contract_address_const::<0xADAD>();
    let (ability_token, erc1155, ability_token_addr) = deploy_ability_token(admin);
    starknet::testing::set_contract_address(admin);
    ability_token.set_minter(world_sys_addr);

    // Set resource config
    world.write_model_test(@ResourceConfig {
        id: 0,
        iron, linen, stone, wood, ember, seeds,
        ability_token: ability_token_addr,
        vrf_provider: mock_vrf_addr,
    });

    // Set resource token minters to world_system so it can mint for drip
    IResourceTokenDispatcher { contract_address: iron }.set_minter(world_sys_addr);
    IResourceTokenDispatcher { contract_address: linen }.set_minter(world_sys_addr);
    IResourceTokenDispatcher { contract_address: stone }.set_minter(world_sys_addr);
    IResourceTokenDispatcher { contract_address: wood }.set_minter(world_sys_addr);
    IResourceTokenDispatcher { contract_address: ember }.set_minter(world_sys_addr);
    IResourceTokenDispatcher { contract_address: seeds }.set_minter(world_sys_addr);

    // Init world
    let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
    let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
    world_sys.initialize_world(cols, rows, types);

    // Register player
    let player = deploy_user();
    starknet::testing::set_contract_address(player);
    world_sys.register_player(array![0, 1, 2]);
    erc1155.set_approval_for_all(world_sys_addr, true);

    // Mint resources for upgrade (enough for Strategos: 20 Iron + 20 Stone + 10 Wood)
    // Resource tokens need approval from player for world_system to burn
    IResourceTokenDispatcher { contract_address: iron }.mint(player, 200);
    IResourceTokenDispatcher { contract_address: stone }.mint(player, 200);
    IResourceTokenDispatcher { contract_address: wood }.mint(player, 100);
    IResourceTokenDispatcher { contract_address: ember }.mint(player, 50);
    IResourceTokenDispatcher { contract_address: seeds }.mint(player, 30);

    (world, world_sys, player, erc1155)
}
```

Test:

```cairo
#[test]
fn test_upgrade_to_fortress() {
    let (mut world, world_sys, player, _erc1155) = setup_with_resources();

    // Set wins to 10 (requirement for Strategos)
    let mut kingdom: PlayerKingdom = world.read_model(player);
    kingdom.total_wins = 10;
    world.write_model_test(@kingdom);

    starknet::testing::set_contract_address(player);
    world_sys.upgrade_kingdom();

    let k: PlayerKingdom = world.read_model(player);
    assert(k.tier == 1, 'should be Strategos (tier 1)');
}

#[test]
#[should_panic(expected: ('Not enough wins', 'ENTRYPOINT_FAILED'))]
fn test_upgrade_fails_insufficient_wins() {
    let (mut world, world_sys, player, _erc1155) = setup_with_resources();

    // Only 5 wins — need 10 for Strategos
    let mut kingdom: PlayerKingdom = world.read_model(player);
    kingdom.total_wins = 5;
    world.write_model_test(@kingdom);

    starknet::testing::set_contract_address(player);
    world_sys.upgrade_kingdom();
}

#[test]
#[should_panic(expected: ('Already max tier', 'ENTRYPOINT_FAILED'))]
fn test_upgrade_fails_max_tier() {
    let (mut world, world_sys, player, _erc1155) = setup_with_resources();

    let mut kingdom: PlayerKingdom = world.read_model(player);
    kingdom.tier = 3; // Basileia
    kingdom.total_wins = 100;
    world.write_model_test(@kingdom);

    starknet::testing::set_contract_address(player);
    world_sys.upgrade_kingdom();
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_upgrade_to_fortress`
Expected: FAIL — `upgrade_kingdom` doesn't exist

- [ ] **Step 3: Add upgrade_kingdom to IWorldSystem interface**

In `src/systems/world_system.cairo`, add to the `IWorldSystem` trait:

```cairo
fn upgrade_kingdom(ref self: T);
```

- [ ] **Step 4: Implement upgrade_kingdom**

Add to the `WorldSystemImpl` in `src/systems/world_system.cairo`:

```cairo
fn upgrade_kingdom(ref self: ContractState) {
    let mut world = self.world_default();
    let caller = get_caller_address();
    let mut kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');

    let current = kingdom.tier;
    let next = current + 1;
    assert(next <= 3, 'Already max tier');

    // Check win requirement
    let wins_needed = super::tier_wins_required(next);
    assert(kingdom.total_wins >= wins_needed, 'Not enough wins');

    // Burn resources based on target tier
    let rc: ResourceConfig = world.read_model(0_u8);
    if next == 1 {
        // Strategos: 20 Iron + 20 Stone + 10 Wood
        super::burn_upgrade_resources(rc.iron, caller, 20);
        super::burn_upgrade_resources(rc.stone, caller, 20);
        super::burn_upgrade_resources(rc.wood, caller, 10);
    } else if next == 2 {
        // Hegemonia: 50 Iron + 50 Stone + 30 Wood + 20 Ember
        super::burn_upgrade_resources(rc.iron, caller, 50);
        super::burn_upgrade_resources(rc.stone, caller, 50);
        super::burn_upgrade_resources(rc.wood, caller, 30);
        super::burn_upgrade_resources(rc.ember, caller, 20);
    } else {
        // Basileia: 100 Iron + 100 Stone + 60 Wood + 40 Ember + 20 Seeds
        super::burn_upgrade_resources(rc.iron, caller, 100);
        super::burn_upgrade_resources(rc.stone, caller, 100);
        super::burn_upgrade_resources(rc.wood, caller, 60);
        super::burn_upgrade_resources(rc.ember, caller, 40);
        super::burn_upgrade_resources(rc.seeds, caller, 20);
    }

    kingdom.tier = next;
    world.write_model(@kingdom);
}
```

Add the resource burn helper outside the module (next to the other pub fns):

```cairo
pub fn burn_upgrade_resources(token_addr: starknet::ContractAddress, from: starknet::ContractAddress, amount: u256) {
    let token = IERC20BurnDispatcher { contract_address: token_addr };
    let balance = token.balance_of(from);
    assert(balance >= amount, 'Insufficient resources');
    let burn_addr: starknet::ContractAddress = 0x1.try_into().unwrap();
    token.transfer_from(from, burn_addr, amount);
}
```

Add the ERC20 interface near the top of the file (outside the module):

```cairo
#[starknet::interface]
pub trait IERC20Burn<T> {
    fn transfer_from(ref self: T, sender: starknet::ContractAddress, recipient: starknet::ContractAddress, amount: u256) -> bool;
    fn balance_of(self: @T, account: starknet::ContractAddress) -> u256;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `sozo test -f test_upgrade_to_fortress && sozo test -f test_upgrade_fails_insufficient_wins && sozo test -f test_upgrade_fails_max_tier`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: add upgrade_kingdom with win requirements and resource burns"
```

---

### Task 4: Enforce Ability Slot Limits in Staked Matches

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/test_kingdom_tiers.cairo`:

```cairo
#[test]
#[should_panic(expected: ('Too many abilities for tier', 'ENTRYPOINT_FAILED'))]
fn test_outpost_cannot_stake_2_abilities() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();
    // Both players are Polis (tier 0) → 1 ability slot max

    // Player A tries to stake 2 abilities — should fail
    starknet::testing::set_contract_address(player_a);
    world_sys.create_staked_match(player_b, array![1, 2]);
}

#[test]
fn test_fortress_can_stake_2_abilities() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Upgrade player A to Strategos
    let mut ka: PlayerKingdom = world.read_model(player_a);
    ka.tier = 1;
    world.write_model_test(@ka);

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1, 2]);
    assert(match_id > 0, 'match should be created');
}
```

Note: `full_setup` is the same helper from `test_staked_match.cairo` — reuse that pattern. It creates 2 registered players with abilities.

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_outpost_cannot_stake_2_abilities`
Expected: FAIL — no tier check exists, so staking 2 abilities succeeds when it shouldn't

- [ ] **Step 3: Add tier check to create_staked_match**

In `src/systems/world_system.cairo`, inside `create_staked_match`, after the `assert(count >= 1 && count <= 3, ...)` line, add:

```cairo
// Enforce ability slot limit based on tier
let max_slots: u32 = super::tier_ability_slots(kingdom.tier).into();
assert(count <= max_slots, 'Too many abilities for tier');
```

- [ ] **Step 4: Add the same check to join_staked_match**

In `join_staked_match`, after `assert(b_count >= 1 && b_count <= 3, ...)`, add:

```cairo
let max_slots: u32 = super::tier_ability_slots(kingdom.tier).into();
assert(b_count <= max_slots, 'Too many abilities for tier');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `sozo test -f test_outpost_cannot_stake_2_abilities && sozo test -f test_fortress_can_stake_2_abilities`
Expected: All PASS

- [ ] **Step 6: Run ALL existing tests to verify nothing broke**

Run: `sozo test`
Expected: All tests pass. The existing staked match tests in `test_staked_match.cairo` stake 1-3 abilities but players default to tier 0 (Polis, 1 slot). Tests that stake >1 will need their player tiers bumped. Fix any that fail by setting the player's tier appropriately via `write_model_test`.

- [ ] **Step 7: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: enforce ability slot limits per kingdom tier in staked matches"
```

---

### Task 5: Enforce Parcel Cap in claim_parcel

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/test_kingdom_tiers.cairo`:

```cairo
#[test]
#[should_panic(expected: ('Parcel cap reached', 'ENTRYPOINT_FAILED'))]
fn test_outpost_parcel_cap() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Player A is Polis (tier 0) → parcel_cap = 2 non-home parcels
    // Manually give player A 2 non-home parcels (at cap)
    let mut ka: PlayerKingdom = world.read_model(player_a);
    ka.parcel_count = 5; // 3 home + 2 non-home = at cap
    world.write_model_test(@ka);

    // Create and finish a match so player A can claim
    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    // Force win for player A
    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // Try to claim — should fail due to parcel cap
    starknet::testing::set_contract_address(player_a);
    // Find an unclaimed parcel
    let config: siege_dojo::models::world_config::WorldConfig = world.read_model(0_u8);
    let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
    let mut claim_id: u32 = 0;
    let mut p: u32 = 0;
    while p < config.total_parcels {
        let parcel: siege_dojo::models::parcel::Parcel = world.read_model(p);
        if parcel.owner == zero_addr {
            claim_id = p;
            break;
        }
        p += 1;
    };
    world_sys.claim_parcel(match_id, claim_id);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sozo test -f test_outpost_parcel_cap`
Expected: FAIL — no parcel cap check exists

- [ ] **Step 3: Add parcel cap check to claim_parcel**

In `src/systems/world_system.cairo`, inside `claim_parcel`, after the winner check and before the parcel ownership check, add:

```cairo
// Enforce parcel cap based on tier
let kingdom: PlayerKingdom = world.read_model(caller);
let non_home_parcels = kingdom.parcel_count - 3; // 3 home parcels
let cap = super::tier_parcel_cap(kingdom.tier);
assert(non_home_parcels < cap, 'Parcel cap reached');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `sozo test -f test_outpost_parcel_cap`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `sozo test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: enforce parcel cap per kingdom tier in claim_parcel"
```

---

### Task 6: Increment total_wins on Match Settlement

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/test_kingdom_tiers.cairo`:

```cairo
#[test]
fn test_settle_increments_winner_wins() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    // Player A wins
    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });

    let before: PlayerKingdom = world.read_model(player_a);
    assert(before.total_wins == 0, 'should start at 0 wins');

    world_sys.settle_match(match_id);

    let after: PlayerKingdom = world.read_model(player_a);
    assert(after.total_wins == 1, 'should have 1 win');
}

#[test]
fn test_settle_draw_no_wins() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    // Draw
    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 25, vault_b_hp: 25,
        current_round: 10,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });

    world_sys.settle_match(match_id);

    let ka: PlayerKingdom = world.read_model(player_a);
    let kb: PlayerKingdom = world.read_model(player_b);
    assert(ka.total_wins == 0, 'a should have 0 wins');
    assert(kb.total_wins == 0, 'b should have 0 wins');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `sozo test -f test_settle_increments_winner_wins`
Expected: FAIL — settle_match doesn't update total_wins

- [ ] **Step 3: Add win tracking to settle_match**

In `src/systems/world_system.cairo`, inside `settle_match`, after the ability distribution and `release_furthest_parcel` call (inside the `else` branch for non-draw), add:

```cairo
// Increment winner's total_wins
let mut winner_kingdom: PlayerKingdom = world.read_model(winner);
winner_kingdom.total_wins += 1;
world.write_model(@winner_kingdom);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sozo test -f test_settle_increments_winner_wins && sozo test -f test_settle_draw_no_wins`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `sozo test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: increment winner total_wins on match settlement"
```

---

### Task 7: Fix Existing Tests for Tier Constraints

**Files:**
- Modify: `src/tests/test_staked_match.cairo`

The existing `test_staked_match.cairo` tests stake up to 3 abilities but players are tier 0 (Polis, 1 slot). These will fail after Task 4's tier enforcement. Fix them by setting players to tier 2 (Hegemonia, 3 slots) in the test setup.

- [ ] **Step 1: Run all tests to identify failures**

Run: `sozo test`
Note which tests in `test_staked_match.cairo` fail.

- [ ] **Step 2: Fix full_setup in test_staked_match.cairo**

After registering each player, set their tier to 2 (Hegemonia) so they can stake up to 3 abilities:

After `world_sys.register_player(array![0, 1, 2]);` for player_a, add:

```cairo
// Set tier to Hegemonia (3 ability slots) for testing
let mut ka: PlayerKingdom = world.read_model(player_a);
ka.tier = 2;
world.write_model_test(@ka);
```

Same for player_b.

- [ ] **Step 3: Run all tests**

Run: `sozo test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_staked_match.cairo
git commit -m "fix: set test players to Hegemonia tier for ability slot compatibility"
```

---

### Task 8: Frontend — Display Kingdom Tier

**Files:**
- Modify: `frontend/src/lib/gameState1v1.ts`
- Modify: `frontend/src/components/KingdomSummary.tsx` (if it exists) or the relevant world page component

- [ ] **Step 1: Add tier constants to frontend**

Create or modify `frontend/src/lib/tiers.ts`:

```typescript
export const TIER_NAMES = ["Polis", "Strategos", "Hegemonia", "Basileia"] as const;
export type TierName = (typeof TIER_NAMES)[number];

export const TIER_INFO = [
  { name: "Polis",  abilitySlots: 1, parcelCap: 2,  defensePresets: 1 },
  { name: "Strategos", abilitySlots: 2, parcelCap: 5,  defensePresets: 2 },
  { name: "Hegemonia",  abilitySlots: 3, parcelCap: 8,  defensePresets: 3 },
  { name: "Basileia",   abilitySlots: 4, parcelCap: 12, defensePresets: 4 },
] as const;

export const UPGRADE_COSTS = [
  null, // Can't upgrade from nothing
  { wins: 10, iron: 20, stone: 20, wood: 10 },
  { wins: 30, iron: 50, stone: 50, wood: 30, ember: 20 },
  { wins: 60, iron: 100, stone: 100, wood: 60, ember: 40, seeds: 20 },
] as const;

export function tierName(tier: number): TierName {
  return TIER_NAMES[tier] ?? "Polis";
}
```

- [ ] **Step 2: Update Torii queries to include tier**

In `frontend/src/lib/gameState1v1.ts`, update `fetchMatchState1v1` to also query the player's `PlayerKingdom` tier if needed. Or add a separate hook:

```typescript
export function usePlayerKingdom(playerAddress: string | null) {
  const [kingdom, setKingdom] = useState<{
    tier: number;
    totalWins: number;
    parcelCount: number;
    registered: boolean;
  } | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoPlayerKingdomModels: GraphEdges<{
          tier: string;
          total_wins: string;
          parcel_count: string;
          registered: boolean;
        }>;
      }>(`
        query {
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node { tier total_wins parcel_count registered } }
          }
        }
      `);
      const node = data?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;
      if (node) {
        setKingdom({
          tier: toNum(node.tier),
          totalWins: toNum(node.total_wins),
          parcelCount: toNum(node.parcel_count),
          registered: node.registered,
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return kingdom;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/tiers.ts frontend/src/lib/gameState1v1.ts
git commit -m "feat: add tier constants and usePlayerKingdom hook"
```

---

### Task 9: Frontend — Upgrade Kingdom UI

**Files:**
- Modify: `frontend/src/lib/contracts1v1.ts`
- Create: `frontend/src/components/KingdomUpgrade.tsx`

- [ ] **Step 1: Add upgradeKingdom contract call**

In `frontend/src/lib/contracts1v1.ts`, add:

```typescript
export const CONTRACTS_WORLD = {
  WORLD_SYSTEM: process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "",
};

export async function upgradeKingdom(account: AccountInterface) {
  return account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "upgrade_kingdom",
      calldata: [],
    },
    TX_OPTS,
  );
}
```

- [ ] **Step 2: Create KingdomUpgrade component**

Create `frontend/src/components/KingdomUpgrade.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { TIER_INFO, UPGRADE_COSTS, tierName } from "@/lib/tiers";
import { upgradeKingdom } from "@/lib/contracts1v1";
import { useAccount } from "@/app/providers";

interface KingdomUpgradeProps {
  tier: number;
  totalWins: number;
}

export function KingdomUpgrade({ tier, totalWins }: KingdomUpgradeProps) {
  const { account } = useAccount();
  const [upgrading, setUpgrading] = useState(false);

  if (tier >= 3) {
    return (
      <div className="text-center text-[#daa520] font-serif text-sm font-bold tracking-wider">
        EMPIRE — Maximum Tier
      </div>
    );
  }

  const nextTier = tier + 1;
  const cost = UPGRADE_COSTS[nextTier];
  const info = TIER_INFO[nextTier];
  const hasEnoughWins = cost && totalWins >= cost.wins;

  const handleUpgrade = async () => {
    if (!account || !hasEnoughWins) return;
    setUpgrading(true);
    try {
      await upgradeKingdom(account);
    } catch (e) {
      console.error("Upgrade failed:", e);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="border border-[#3d3428] rounded-lg p-4 bg-[#1a1510]">
      <div className="text-xs text-[#7a7060] tracking-wider uppercase mb-2">
        Next: {tierName(nextTier)}
      </div>
      <div className="text-[10px] text-[#7a7060] space-y-1 mb-3">
        <div>Ability Slots: {info.abilitySlots}</div>
        <div>Parcel Cap: {info.parcelCap}</div>
        <div>Defense Presets: {info.defensePresets}</div>
      </div>
      <div className="text-[10px] text-[#7a7060] mb-2">
        <span className={hasEnoughWins ? "text-green-500" : "text-red-400"}>
          Wins: {totalWins}/{cost?.wins}
        </span>
      </div>
      {cost && (
        <div className="text-[10px] text-[#7a7060] mb-3 space-y-0.5">
          {"iron" in cost && <div>Iron: {cost.iron}</div>}
          {"stone" in cost && <div>Stone: {cost.stone}</div>}
          {"wood" in cost && <div>Wood: {cost.wood}</div>}
          {"ember" in cost && <div>Ember: {cost.ember}</div>}
          {"seeds" in cost && <div>Seeds: {cost.seeds}</div>}
        </div>
      )}
      <button
        onClick={handleUpgrade}
        disabled={!hasEnoughWins || upgrading || !account}
        className={`w-full py-2 rounded text-xs font-bold tracking-wider transition-colors ${
          hasEnoughWins && !upgrading
            ? "bg-[#daa520] text-[#0d0b0a] hover:bg-[#f0c040]"
            : "bg-[#252019] text-[#7a7060] cursor-not-allowed"
        }`}
      >
        {upgrading ? "Upgrading..." : `Upgrade to ${tierName(nextTier)}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/contracts1v1.ts frontend/src/components/KingdomUpgrade.tsx
git commit -m "feat: add KingdomUpgrade component and upgradeKingdom contract call"
```

---

### Task 10: Final Integration — Run All Tests

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All pass (should be ~60+ tests)

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All pass

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for kingdom tier system"
```
