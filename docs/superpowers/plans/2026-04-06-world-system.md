# World System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent hex-grid world where players register kingdoms, play staked matches (wagering abilities + parcels), and conquer neighbors via single-round siege.

**Architecture:** New Dojo models for parcels, player kingdoms, match stakes, and preset defenses. Two new contracts: `world_system` (world init, registration, staked match lifecycle, settlement) and `conquest` (preset defense, single-round siege). The world contract implements IERC1155Receiver to escrow ability tokens. Hex math via offset coordinates with cube-coordinate distance.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, OpenZeppelin v3.0.0 (ERC-1155), sozo v1.8.6

**Note:** Ability activation effects (Phase 2B — Siege Sword does max damage, etc.) are NOT in this plan. Abilities are staked/transferred as economic assets. Tactical effects are a follow-up plan.

**Note:** Defender preset defenses are stored in plaintext on-chain. Sophisticated players can read chain state to see defenses. The defender's budget advantage (15 vs 10) and HP advantage (75 vs 50) compensate. Encrypted/private defense is a future enhancement.

---

### Task 1: World Models

Create all new Dojo models for the world system and register them in `lib.cairo`.

**Files:**
- Create: `src/models/parcel.cairo`
- Create: `src/models/player_kingdom.cairo`
- Create: `src/models/world_config.cairo`
- Create: `src/models/match_stakes_1v1.cairo`
- Create: `src/models/preset_defense.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create Parcel model**

```cairo
// src/models/parcel.cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Parcel {
    #[key]
    pub parcel_id: u32,
    pub col: u16,
    pub row: u16,
    pub parcel_type: u8, // 0=Forge, 1=Quarry, 2=Grove
    pub owner: ContractAddress, // zero address = unclaimed
    pub is_home: bool,
}
```

- [ ] **Step 2: Create PlayerKingdom model**

```cairo
// src/models/player_kingdom.cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerKingdom {
    #[key]
    pub player: ContractAddress,
    pub home_0: u32, // parcel_id of home parcel 1
    pub home_1: u32, // parcel_id of home parcel 2
    pub home_2: u32, // parcel_id of home parcel 3
    pub parcel_count: u32, // total parcels owned (including home)
    pub registered: bool,
    pub free_craft_used: bool,
    pub last_drip_time: u64, // timestamp for passive resource drip
}
```

- [ ] **Step 3: Create WorldConfig model**

```cairo
// src/models/world_config.cairo

#[dojo::model]
#[derive(Drop, Serde)]
pub struct WorldConfig {
    #[key]
    pub id: u8, // always 0
    pub total_parcels: u32,
    pub next_parcel_id: u32,
    pub initialized: bool,
}
```

- [ ] **Step 4: Create MatchStakes1v1 model**

```cairo
// src/models/match_stakes_1v1.cairo

#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchStakes1v1 {
    #[key]
    pub match_id: u64,
    pub a_stake_1: u8, // ability type ID (1-5), 0 = empty slot
    pub a_stake_2: u8,
    pub a_stake_3: u8,
    pub b_stake_1: u8,
    pub b_stake_2: u8,
    pub b_stake_3: u8,
    pub stake_count: u8, // matched wager amount (min of both players' counts)
    pub settled: bool,
}
```

- [ ] **Step 5: Create PresetDefense model**

```cairo
// src/models/preset_defense.cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PresetDefense {
    #[key]
    pub player: ContractAddress,
    pub g0: u8,
    pub g1: u8,
    pub g2: u8,
    pub repair: u8,
    pub nc0: u8,
    pub nc1: u8,
    pub nc2: u8,
}
```

- [ ] **Step 6: Register all new models in lib.cairo**

Add the following lines to the `pub mod models` block in `src/lib.cairo`:

```cairo
    pub mod parcel;
    pub mod player_kingdom;
    pub mod world_config;
    pub mod match_stakes_1v1;
    pub mod preset_defense;
```

Also add a new `pub mod utils` block and new system modules (empty files for now — they'll be populated in later tasks):

```cairo
pub mod utils {
    pub mod hex;
}
```

And in the `pub mod systems` block:

```cairo
    pub mod world_system;
    pub mod conquest;
```

And in the `#[cfg(test)] pub mod tests` block:

```cairo
    pub mod test_hex;
    pub mod test_world;
    pub mod test_staked_match;
    pub mod test_conquest;
```

Create empty stub files for: `src/utils/hex.cairo`, `src/systems/world_system.cairo`, `src/systems/conquest.cairo`, `src/tests/test_hex.cairo`, `src/tests/test_world.cairo`, `src/tests/test_staked_match.cairo`, `src/tests/test_conquest.cairo`. Each file can just be an empty module for now (empty content or a comment).

- [ ] **Step 7: Verify build compiles**

Run: `sozo build`
Expected: Build succeeds with the new model files compiled.

- [ ] **Step 8: Commit**

```bash
git add src/models/parcel.cairo src/models/player_kingdom.cairo src/models/world_config.cairo src/models/match_stakes_1v1.cairo src/models/preset_defense.cairo src/utils/hex.cairo src/systems/world_system.cairo src/systems/conquest.cairo src/tests/test_hex.cairo src/tests/test_world.cairo src/tests/test_staked_match.cairo src/tests/test_conquest.cairo src/lib.cairo
git commit -m "feat: add world system models (Parcel, PlayerKingdom, WorldConfig, MatchStakes1v1, PresetDefense)"
```

---

### Task 2: Hex Utilities

Implement hex grid math functions for offset coordinates: neighbor lookup, distance calculation, and a helper to find a player's furthest parcel from home.

**Files:**
- Modify: `src/utils/hex.cairo`
- Modify: `src/tests/test_hex.cairo`

**Reference:** Even-row offset hex coordinates. Row 0 is even. Each hex has up to 6 neighbors. Distance uses cube coordinate conversion.

- [ ] **Step 1: Write the hex utility tests**

```cairo
// src/tests/test_hex.cairo
#[cfg(test)]
mod tests {
    use siege_dojo::utils::hex;

    #[test]
    fn test_hex_distance_same_cell() {
        assert(hex::hex_distance(3, 3, 3, 3) == 0, 'same cell should be 0');
    }

    #[test]
    fn test_hex_distance_adjacent() {
        // (1,0) to (2,0) are horizontal neighbors
        assert(hex::hex_distance(1, 0, 2, 0) == 1, 'adjacent should be 1');
    }

    #[test]
    fn test_hex_distance_two_away() {
        assert(hex::hex_distance(0, 0, 2, 0) == 2, 'two apart should be 2');
    }

    #[test]
    fn test_hex_distance_diagonal() {
        // (0,0) to (0,2) on even-row offset grid
        assert(hex::hex_distance(0, 0, 0, 2) == 2, 'diagonal should be 2');
    }

    #[test]
    fn test_neighbors_even_row_center() {
        // (2, 2) is even row — should have 6 neighbors
        let n = hex::get_hex_neighbors(2, 2);
        assert(n.len() == 6, 'center should have 6 neighbors');
    }

    #[test]
    fn test_neighbors_even_row_corner() {
        // (0, 0) is corner — some neighbors have underflow, should be filtered
        let n = hex::get_hex_neighbors(0, 0);
        // (0,0) even row: NW(-1,-1)=skip, NE(0,-1)=skip, W(-1,0)=skip, E(1,0)=ok, SW(-1,1)=skip, SE(0,1)=ok
        assert(n.len() == 2, 'corner should have 2 neighbors');
    }

    #[test]
    fn test_neighbors_odd_row() {
        // (1, 1) is odd row
        let n = hex::get_hex_neighbors(1, 1);
        assert(n.len() == 6, 'odd row center should have 6');
    }

    #[test]
    fn test_is_neighbor_true() {
        assert(hex::is_neighbor(1, 0, 2, 0), 'should be neighbors');
    }

    #[test]
    fn test_is_neighbor_false() {
        assert(!hex::is_neighbor(0, 0, 3, 3), 'should not be neighbors');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_hex`
Expected: FAIL — functions not defined yet.

- [ ] **Step 3: Implement hex utilities**

```cairo
// src/utils/hex.cairo

/// Compute hex distance between two cells using offset coordinates (even-row).
/// Converts to cube coordinates internally.
pub fn hex_distance(col1: u16, row1: u16, col2: u16, row2: u16) -> u16 {
    // Convert offset to cube coordinates
    // cube_x = col - (row - (row & 1)) / 2
    // cube_z = row
    // cube_y = -cube_x - cube_z
    let c1: i64 = col1.into();
    let r1: i64 = row1.into();
    let c2: i64 = col2.into();
    let r2: i64 = row2.into();

    let x1: i64 = c1 - (r1 - (r1 & 1)) / 2;
    let z1: i64 = r1;
    let y1: i64 = -x1 - z1;

    let x2: i64 = c2 - (r2 - (r2 & 1)) / 2;
    let z2: i64 = r2;
    let y2: i64 = -x2 - z2;

    let dx = abs_i64(x1 - x2);
    let dy = abs_i64(y1 - y2);
    let dz = abs_i64(z1 - z2);

    let max_val = max_i64(dx, max_i64(dy, dz));
    max_val.try_into().unwrap()
}

fn abs_i64(v: i64) -> i64 {
    if v < 0 { -v } else { v }
}

fn max_i64(a: i64, b: i64) -> i64 {
    if a > b { a } else { b }
}

/// Return all valid hex neighbors for a cell at (col, row) using even-row offset.
/// Filters out neighbors that would underflow (negative coordinates).
pub fn get_hex_neighbors(col: u16, row: u16) -> Array<(u16, u16)> {
    let mut neighbors: Array<(u16, u16)> = ArrayTrait::new();
    let is_even_row = (row & 1) == 0;

    if is_even_row {
        // Even row: NW(col-1,row-1), NE(col,row-1), W(col-1,row), E(col+1,row), SW(col-1,row+1), SE(col,row+1)
        if col > 0 && row > 0 { neighbors.append((col - 1, row - 1)); }
        if row > 0 { neighbors.append((col, row - 1)); }
        if col > 0 { neighbors.append((col - 1, row)); }
        neighbors.append((col + 1, row));
        if col > 0 { neighbors.append((col - 1, row + 1)); }
        neighbors.append((col, row + 1));
    } else {
        // Odd row: NW(col,row-1), NE(col+1,row-1), W(col-1,row), E(col+1,row), SW(col,row+1), SE(col+1,row+1)
        if row > 0 { neighbors.append((col, row - 1)); }
        if row > 0 { neighbors.append((col + 1, row - 1)); }
        if col > 0 { neighbors.append((col - 1, row)); }
        neighbors.append((col + 1, row));
        neighbors.append((col, row + 1));
        neighbors.append((col + 1, row + 1));
    }

    neighbors
}

/// Check if two cells are hex neighbors.
pub fn is_neighbor(col1: u16, row1: u16, col2: u16, row2: u16) -> bool {
    hex_distance(col1, row1, col2, row2) == 1
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sozo test -f test_hex`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/hex.cairo src/tests/test_hex.cairo
git commit -m "feat: add hex grid utilities (distance, neighbors, adjacency)"
```

---

### Task 3: World Contract — Initialization & Player Registration

The `world_system` contract manages the hex grid and player registration. It also implements IERC1155Receiver so it can hold escrowed ability tokens (used in Task 4).

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_world.cairo`

**Dependencies:** Task 1 (models), Task 2 (hex utils)

- [ ] **Step 1: Write tests for world initialization and player registration**

```cairo
// src/tests/test_world.cairo

// Reuse MockVrfProvider from test_actions_1v1
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

// Reuse MockAccount from test_ability_token
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

#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use super::{MockVrfProvider, MockAccount};

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_ability_token(admin: starknet::ContractAddress) -> (IAbilityTokenDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (IAbilityTokenDispatcher { contract_address: addr }, addr)
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn setup() -> (dojo::world::WorldStorage, IWorldSystemDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (world_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_addr };

        // Deploy and wire mock VRF
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        actions_sys.set_vrf_provider(mock_vrf_addr);

        (world, world_sys)
    }

    #[test]
    fn test_initialize_world() {
        let (mut world, world_sys) = setup();

        // Initialize with 4 parcels in a small grid
        // (col, row, type): (0,0,0), (1,0,1), (0,1,2), (1,1,0)
        let cols: Array<u16> = array![0, 1, 0, 1];
        let rows: Array<u16> = array![0, 0, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 4, 'should have 4 parcels');
        assert(config.initialized, 'should be initialized');

        let p0: Parcel = world.read_model(0_u32);
        assert(p0.col == 0, 'p0 col');
        assert(p0.row == 0, 'p0 row');
        assert(p0.parcel_type == 0, 'p0 type');
    }

    #[test]
    fn test_register_player() {
        let (mut world, world_sys) = setup();

        // Init world with 10 parcels
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Deploy AbilityToken for starter kit
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, ability_token_addr) = deploy_ability_token(admin);
        // Set world_system as minter (so it can mint starter abilities)
        starknet::testing::set_contract_address(admin);
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        ability_token.set_minter(world_sys_addr);
        // Configure ability token in world
        world_sys.set_ability_token(ability_token_addr);

        // Register as player
        let player = deploy_user();
        starknet::testing::set_contract_address(player);
        let home_types: Array<u8> = array![0, 1, 2]; // Forge, Quarry, Grove
        world_sys.register_player(home_types);

        let kingdom: PlayerKingdom = world.read_model(player);
        assert(kingdom.registered, 'should be registered');
        assert(kingdom.parcel_count == 3, 'should have 3 parcels');

        // Verify home parcels are assigned and owned
        let h0: Parcel = world.read_model(kingdom.home_0);
        assert(h0.owner == player, 'home 0 should be owned');
        assert(h0.is_home, 'home 0 should be home');
        assert(h0.parcel_type == 0, 'home 0 should be Forge');
    }

    #[test]
    #[should_panic(expected: ('Already registered',))]
    fn test_cannot_register_twice() {
        let (mut world, world_sys) = setup();
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        let admin = contract_address_const::<0xADAD>();
        let (ability_token, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        ability_token.set_minter(world_sys_addr);
        world_sys.set_ability_token(ability_token_addr);

        let player = deploy_user();
        starknet::testing::set_contract_address(player);
        let home_types: Array<u8> = array![0, 1, 2];
        world_sys.register_player(home_types.clone());
        world_sys.register_player(home_types); // should panic
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_world`
Expected: FAIL — `IWorldSystem` not defined yet.

- [ ] **Step 3: Implement world_system contract**

```cairo
// src/systems/world_system.cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait IWorldSystem<T> {
    fn initialize_world(ref self: T, cols: Array<u16>, rows: Array<u16>, types: Array<u8>);
    fn register_player(ref self: T, home_types: Array<u8>);
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
}

#[dojo::contract]
pub mod world_system {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::world::IWorldDispatcherTrait;
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::tokens::ability_token::{IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    // IERC1155Receiver — allows this contract to hold escrowed ability tokens.
    // The ERC1155 acceptance check falls back to ISRC6 if IERC1155_RECEIVER_ID
    // is not supported. We implement the receiver interface directly.
    //
    // IERC1155_RECEIVER_ID value from OpenZeppelin. If the import path doesn't
    // resolve, define inline:
    // const IERC1155_RECEIVER_ID: felt252 = <value from openzeppelin_token::erc1155::interface>;
    //
    // For the implementing agent: check openzeppelin_token::erc1155::interface
    // for the exact constant. If unavailable, use the ISRC6 fallback approach
    // from MockAccount (implement supports_interface returning true for ISRC6_ID)
    // as a workaround.

    #[abi(per_item)]
    #[generate_trait]
    impl ERC1155ReceiverImpl of ERC1155ReceiverTrait {
        #[external(v0)]
        fn on_erc1155_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        ) -> felt252 {
            // Return IERC1155_RECEIVER_ID
            // If exact constant is unavailable, use the starknet selector
            starknet::get_selector_from_name('on_erc1155_received')
        }

        #[external(v0)]
        fn on_erc1155_batch_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_ids: Span<u256>,
            values: Span<u256>,
            data: Span<felt252>,
        ) -> felt252 {
            starknet::get_selector_from_name('on_erc1155_batch_received')
        }

        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            // Support both ISRC6 (account fallback) and IERC1155Receiver
            let isrc6_id: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;
            interface_id == isrc6_id
        }
    }

    #[abi(embed_v0)]
    impl WorldSystemImpl of super::IWorldSystem<ContractState> {
        fn initialize_world(
            ref self: ContractState,
            cols: Array<u16>,
            rows: Array<u16>,
            types: Array<u8>,
        ) {
            let mut world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);
            assert(!config.initialized, 'Already initialized');
            assert(cols.len() == rows.len(), 'Array length mismatch');
            assert(cols.len() == types.len(), 'Array length mismatch');

            let total = cols.len();
            let mut i: u32 = 0;
            let zero_addr: ContractAddress = 0.try_into().unwrap();
            while i < total {
                world.write_model(@Parcel {
                    parcel_id: i,
                    col: *cols.at(i),
                    row: *rows.at(i),
                    parcel_type: *types.at(i),
                    owner: zero_addr,
                    is_home: false,
                });
                i += 1;
            };

            world.write_model(@WorldConfig {
                id: 0,
                total_parcels: total,
                next_parcel_id: total,
                initialized: true,
            });
        }

        fn register_player(ref self: ContractState, home_types: Array<u8>) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(!kingdom.registered, 'Already registered');
            assert(home_types.len() == 3, 'Must choose 3 home types');

            // Find 3 unclaimed parcels matching requested types
            let config: WorldConfig = world.read_model(0_u8);
            assert(config.initialized, 'World not initialized');

            let mut home_ids: Array<u32> = ArrayTrait::new();
            let mut assigned_types: Array<u8> = ArrayTrait::new();
            let mut type_idx: u32 = 0;
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            while type_idx < 3 {
                let wanted_type = *home_types.at(type_idx);
                assert(wanted_type <= 2, 'Invalid parcel type');
                let mut found = false;
                let mut p: u32 = 0;
                while p < config.total_parcels {
                    if !found {
                        let parcel: Parcel = world.read_model(p);
                        if parcel.owner == zero_addr && parcel.parcel_type == wanted_type {
                            // Check not already assigned in this registration
                            let mut already_used = false;
                            let mut j: u32 = 0;
                            while j < home_ids.len() {
                                if *home_ids.at(j) == p {
                                    already_used = true;
                                }
                                j += 1;
                            };
                            if !already_used {
                                home_ids.append(p);
                                assigned_types.append(wanted_type);
                                found = true;
                            }
                        }
                    }
                    p += 1;
                };
                assert(found, 'No parcel available for type');
                type_idx += 1;
            };

            // Assign home parcels
            let h0 = *home_ids.at(0);
            let h1 = *home_ids.at(1);
            let h2 = *home_ids.at(2);

            let mut i: u32 = 0;
            while i < 3 {
                let pid = *home_ids.at(i);
                let mut parcel: Parcel = world.read_model(pid);
                parcel.owner = caller;
                parcel.is_home = true;
                world.write_model(@parcel);
                i += 1;
            };

            // Mint 3 random starter abilities (deterministic for now: IDs 1, 2, 3)
            // A proper random selection would use VRF, but for initial implementation
            // we assign ability IDs 1, 2, 3 as the starter kit.
            let rc: ResourceConfig = world.read_model(0_u8);
            if rc.ability_token.is_non_zero() {
                let ability = IAbilityTokenDispatcher { contract_address: rc.ability_token };
                ability.mint(caller, 1_u256, 1_u256); // Siege Sword
                ability.mint(caller, 2_u256, 1_u256); // Stone Cloak
                ability.mint(caller, 3_u256, 1_u256); // Ember Blast
            }

            world.write_model(@PlayerKingdom {
                player: caller,
                home_0: h0,
                home_1: h1,
                home_2: h2,
                parcel_count: 3,
                registered: true,
                free_craft_used: false,
                last_drip_time: get_block_timestamp(),
            });
        }

        fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let mut config: ResourceConfig = world.read_model(0_u8);
            config.ability_token = ability_token;
            world.write_model(@config);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `sozo test -f test_world`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_world.cairo
git commit -m "feat: world contract with grid initialization and player registration"
```

---

### Task 4: Staked Match — Create, Join, Settle

Add staked match lifecycle to the world contract: create a match with ability escrow, join the match, and settle after completion (transfer abilities, handle parcel claim/loss).

**Files:**
- Modify: `src/systems/world_system.cairo` (add new functions to IWorldSystem)
- Modify: `src/tests/test_staked_match.cairo`

**Dependencies:** Task 3

**Key design decisions:**
- Two-step match creation: Player A creates → Player B joins. Abilities escrowed at each step.
- Matched wager: `min(a_count, b_count)`, excess refunded at join time.
- Settlement is a separate call after the match finishes (status == Finished).
- Winner: gets all wagered abilities from both sides.
- Loser: loses wagered abilities + their furthest-from-home parcel becomes unclaimed.
- Winner can claim an adjacent unclaimed parcel via a separate call.
- Draw: all abilities returned, no parcel changes.

- [ ] **Step 1: Write staked match tests**

```cairo
// src/tests/test_staked_match.cairo

// (Reuse MockVrfProvider and MockAccount from test_world.cairo — or define locally)
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

#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::commit_reveal_1v1;
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::match_stakes_1v1::{MatchStakes1v1, m_MatchStakes1v1};
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use super::{MockVrfProvider, MockAccount};

    // ERC-1155 read interface for balance checks
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

    // Full setup: world + 10 parcels + ability token + 2 registered players
    fn full_setup() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a
        starknet::ContractAddress, // player_b
        IERC1155LikeDispatcher,    // erc1155 reader
    ) {
        // Setup mirrors test_world setup but adds players
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

        // VRF
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        actions_sys.set_vrf_provider(mock_vrf_addr);

        // AbilityToken
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, erc1155, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);
        world_sys.set_ability_token(ability_token_addr);

        // Init world with 10 parcels (2 rows of 5)
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Register player A
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        // Approve world_system to transfer abilities
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Register player B
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        erc1155.set_approval_for_all(world_sys_addr, true);

        (world, world_sys, player_a, player_b, erc1155)
    }

    // Namespace/contract defs — include all contracts needed
    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    #[test]
    fn test_create_staked_match() {
        let (mut world, world_sys, player_a, player_b, erc1155) = full_setup();

        // Player A creates staked match with abilities [1, 2, 3]
        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1, 2, 3]);

        // Abilities should be escrowed (transferred from player_a)
        assert(erc1155.balance_of(player_a, 1_u256) == 0_u256, 'a should have 0 of id 1');
        assert(erc1155.balance_of(player_a, 2_u256) == 0_u256, 'a should have 0 of id 2');
        assert(erc1155.balance_of(player_a, 3_u256) == 0_u256, 'a should have 0 of id 3');

        let stakes: MatchStakes1v1 = world.read_model(match_id);
        assert(stakes.a_stake_1 == 1, 'a_stake_1 should be 1');
        assert(stakes.a_stake_2 == 2, 'a_stake_2 should be 2');
        assert(stakes.a_stake_3 == 3, 'a_stake_3 should be 3');
    }

    #[test]
    fn test_join_staked_match_matched_wager() {
        let (mut world, world_sys, player_a, player_b, erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1, 2, 3]);

        // Player B joins with only 1 ability
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![1]);

        let stakes: MatchStakes1v1 = world.read_model(match_id);
        assert(stakes.stake_count == 1, 'wager should be 1');

        // Player A's excess 2 abilities should be refunded
        assert(erc1155.balance_of(player_a, 2_u256) == 1_u256, 'a should get id 2 back');
        assert(erc1155.balance_of(player_a, 3_u256) == 1_u256, 'a should get id 3 back');
    }

    #[test]
    fn test_settle_match_winner_gets_abilities() {
        let (mut world, world_sys, player_a, player_b, erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Simulate match finish: player A wins (force via model write)
        world.write_model_test(@MatchState1v1 {
            match_id,
            player_a,
            player_b,
            vault_a_hp: 30,
            vault_b_hp: 0,
            current_round: 5,
            status: MatchStatus::Finished,
        });

        // Settle
        world_sys.settle_match(match_id);

        // Player A (winner) should have their ability back + B's wagered ability
        assert(erc1155.balance_of(player_a, 1_u256) == 1_u256, 'a should have id 1 back');
        assert(erc1155.balance_of(player_a, 2_u256) == 1_u256, 'a should get b id 2');
    }

    #[test]
    fn test_settle_match_loser_loses_parcel() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Player B loses
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5, status: MatchStatus::Finished,
        });

        // Get B's initial parcel count
        let kingdom_b_before: PlayerKingdom = world.read_model(player_b);
        let before_count = kingdom_b_before.parcel_count;

        world_sys.settle_match(match_id);

        // B should lose a parcel (furthest from home becomes unclaimed)
        let kingdom_b_after: PlayerKingdom = world.read_model(player_b);
        assert(kingdom_b_after.parcel_count == before_count - 1, 'b should lose a parcel');
    }

    #[test]
    fn test_settle_draw_returns_abilities() {
        let (mut world, world_sys, player_a, player_b, erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Draw
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 25, vault_b_hp: 25,
            current_round: 10, status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        // Both should get their abilities back
        assert(erc1155.balance_of(player_a, 1_u256) == 1_u256, 'a should get id 1 back');
        assert(erc1155.balance_of(player_b, 2_u256) == 1_u256, 'b should get id 2 back');
    }

    #[test]
    fn test_claim_parcel_after_win() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Player A wins
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5, status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        // Player A claims an adjacent unclaimed parcel
        // Find an unclaimed parcel adjacent to A's territory
        // (depends on grid layout — the test should find one)
        starknet::testing::set_contract_address(player_a);
        let kingdom_a_before: PlayerKingdom = world.read_model(player_a);
        let before_count = kingdom_a_before.parcel_count;

        // Find an adjacent unclaimed parcel to claim
        let config: WorldConfig = world.read_model(0_u8);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let mut claim_id: u32 = 0;
        let mut p: u32 = 0;
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == zero_addr {
                claim_id = p;
                break;
            }
            p += 1;
        };
        world_sys.claim_parcel(match_id, claim_id);

        let kingdom_a_after: PlayerKingdom = world.read_model(player_a);
        assert(kingdom_a_after.parcel_count == before_count + 1, 'a should gain a parcel');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_staked_match`
Expected: FAIL — functions not defined yet.

- [ ] **Step 3: Add staked match functions to IWorldSystem trait**

Add to the `IWorldSystem` trait in `src/systems/world_system.cairo`:

```cairo
    fn create_staked_match(ref self: T, opponent: ContractAddress, abilities: Array<u8>) -> u64;
    fn join_staked_match(ref self: T, match_id: u64, abilities: Array<u8>);
    fn settle_match(ref self: T, match_id: u64);
    fn claim_parcel(ref self: T, match_id: u64, parcel_id: u32);
```

- [ ] **Step 4: Implement create_staked_match**

Add to the `WorldSystemImpl` block:

```cairo
        fn create_staked_match(
            ref self: ContractState,
            opponent: ContractAddress,
            abilities: Array<u8>,
        ) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            // Verify abilities are valid (1-5) and count is 1-3
            let count = abilities.len();
            assert(count >= 1 && count <= 3, 'Must stake 1-3 abilities');

            // Read ability token address
            let rc: ResourceConfig = world.read_model(0_u8);
            assert(rc.ability_token.is_non_zero(), 'Ability token not set');

            // Escrow: transfer abilities from caller to this contract
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
            let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };

            // Build ERC-1155 interface for safe_transfer_from
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };

            let mut i: u32 = 0;
            while i < count {
                let ability_id: u8 = *abilities.at(i);
                assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
                erc1155.safe_transfer_from(
                    caller, world_sys_addr,
                    ability_id.into(), 1_u256,
                    array![].span(),
                );
                i += 1;
            };

            // Create match via actions_1v1
            let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
            let actions = IActions1v1Dispatcher { contract_address: actions_addr };
            let match_id = actions.create_match_1v1(caller, opponent);

            // But set status to Pending (not Active) until opponent joins
            let mut state: MatchState1v1 = world.read_model(match_id);
            state.status = MatchStatus::Pending;
            world.write_model(@state);

            // Record stakes
            let a1 = if count > 0 { *abilities.at(0) } else { 0 };
            let a2 = if count > 1 { *abilities.at(1) } else { 0 };
            let a3 = if count > 2 { *abilities.at(2) } else { 0 };

            world.write_model(@MatchStakes1v1 {
                match_id,
                a_stake_1: a1, a_stake_2: a2, a_stake_3: a3,
                b_stake_1: 0, b_stake_2: 0, b_stake_3: 0,
                stake_count: 0,
                settled: false,
            });

            match_id
        }
```

Note: This requires adding dispatcher interfaces for ERC-1155 and IActions1v1 at the top of the module. Add:

```cairo
    use siege_dojo::systems::actions_1v1::{IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::match_stakes_1v1::MatchStakes1v1;

    // ERC-1155 dispatcher for safe_transfer_from calls
    #[starknet::interface]
    trait IERC1155<T> {
        fn safe_transfer_from(
            ref self: T,
            from: starknet::ContractAddress,
            to: starknet::ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        );
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
        fn is_approved_for_all(
            self: @T,
            owner: starknet::ContractAddress,
            operator: starknet::ContractAddress,
        ) -> bool;
    }
```

- [ ] **Step 5: Implement join_staked_match**

```cairo
        fn join_staked_match(ref self: ContractState, match_id: u64, abilities: Array<u8>) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Pending, 'Match not pending');
            assert(state.player_b == caller, 'Not the opponent');

            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let b_count = abilities.len();
            assert(b_count >= 1 && b_count <= 3, 'Must stake 1-3 abilities');

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);

            // Count A's stakes
            let mut a_count: u32 = 0;
            if stakes.a_stake_1 > 0 { a_count += 1; }
            if stakes.a_stake_2 > 0 { a_count += 1; }
            if stakes.a_stake_3 > 0 { a_count += 1; }

            // Matched wager
            let wager = if a_count < b_count { a_count } else { b_count };

            let rc: ResourceConfig = world.read_model(0_u8);
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

            // Escrow B's wager amount
            let mut i: u32 = 0;
            while i < wager {
                let ability_id: u8 = *abilities.at(i);
                assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
                erc1155.safe_transfer_from(
                    caller, world_sys_addr,
                    ability_id.into(), 1_u256,
                    array![].span(),
                );
                i += 1;
            };

            // Record B's stakes
            let b1 = if b_count > 0 { *abilities.at(0) } else { 0 };
            let b2 = if b_count > 1 { *abilities.at(1) } else { 0 };
            let b3 = if b_count > 2 { *abilities.at(2) } else { 0 };
            stakes.b_stake_1 = b1;
            stakes.b_stake_2 = b2;
            stakes.b_stake_3 = b3;
            stakes.stake_count = wager.try_into().unwrap();

            // Refund A's excess (abilities beyond wager count)
            if a_count > wager {
                let a_stakes: Array<u8> = array![stakes.a_stake_1, stakes.a_stake_2, stakes.a_stake_3];
                let mut j: u32 = wager;
                while j < a_count {
                    let refund_id = *a_stakes.at(j);
                    if refund_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_a,
                            refund_id.into(), 1_u256,
                            array![].span(),
                        );
                    }
                    j += 1;
                };
                // Clear refunded slots
                if wager < 3 { stakes.a_stake_3 = 0; }
                if wager < 2 { stakes.a_stake_2 = 0; }
                if wager < 1 { stakes.a_stake_1 = 0; }
            }

            world.write_model(@stakes);

            // Activate the match
            let mut state_mut: MatchState1v1 = world.read_model(match_id);
            state_mut.status = MatchStatus::Active;
            world.write_model(@state_mut);
        }
```

- [ ] **Step 6: Implement settle_match**

This is the core post-match settlement. Requires hex distance calculation.

```cairo
        fn settle_match(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(!stakes.settled, 'Already settled');
            stakes.settled = true;

            let rc: ResourceConfig = world.read_model(0_u8);
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

            // Determine winner: team 1 = player_a, team 2 = player_b, 0 = draw
            let winner_team: u8 = if state.vault_a_hp > state.vault_b_hp {
                1
            } else if state.vault_b_hp > state.vault_a_hp {
                2
            } else {
                0
            };

            let a_stakes: Array<u8> = array![stakes.a_stake_1, stakes.a_stake_2, stakes.a_stake_3];
            let b_stakes: Array<u8> = array![stakes.b_stake_1, stakes.b_stake_2, stakes.b_stake_3];
            let wager: u32 = stakes.stake_count.into();

            if winner_team == 0 {
                // Draw: return all escrowed abilities to their owners
                let mut i: u32 = 0;
                while i < wager {
                    let a_id = *a_stakes.at(i);
                    if a_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_a,
                            a_id.into(), 1_u256, array![].span(),
                        );
                    }
                    let b_id = *b_stakes.at(i);
                    if b_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_b,
                            b_id.into(), 1_u256, array![].span(),
                        );
                    }
                    i += 1;
                };
            } else {
                let (winner, loser) = if winner_team == 1 {
                    (state.player_a, state.player_b)
                } else {
                    (state.player_b, state.player_a)
                };

                // Transfer ALL escrowed abilities to winner
                let mut i: u32 = 0;
                while i < wager {
                    let a_id = *a_stakes.at(i);
                    if a_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, winner,
                            a_id.into(), 1_u256, array![].span(),
                        );
                    }
                    let b_id = *b_stakes.at(i);
                    if b_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, winner,
                            b_id.into(), 1_u256, array![].span(),
                        );
                    }
                    i += 1;
                };

                // Loser loses their furthest-from-home parcel
                self.release_furthest_parcel(loser);
            }

            world.write_model(@stakes);
        }
```

- [ ] **Step 7: Implement release_furthest_parcel helper**

Add as an internal function in the world_system module:

```cairo
    #[generate_trait]
    impl SettlementHelpers of SettlementHelpersTrait {
        /// Find and release the loser's furthest-from-home parcel (becomes unclaimed).
        /// If the player only has home parcels, no parcel is released.
        fn release_furthest_parcel(ref self: ContractState, player: ContractAddress) {
            let mut world = self.world_default();
            let mut kingdom: PlayerKingdom = world.read_model(player);
            let config: WorldConfig = world.read_model(0_u8);

            // Get home parcel coordinates
            let h0: Parcel = world.read_model(kingdom.home_0);
            let h1: Parcel = world.read_model(kingdom.home_1);
            let h2: Parcel = world.read_model(kingdom.home_2);

            let mut max_dist: u16 = 0;
            let mut furthest_id: u32 = 0;
            let mut found = false;
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.owner == player && !parcel.is_home {
                    // Min distance to any home parcel
                    let d0 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h0.col, h0.row);
                    let d1 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h1.col, h1.row);
                    let d2 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h2.col, h2.row);
                    let min_d = if d0 < d1 { if d0 < d2 { d0 } else { d2 } } else { if d1 < d2 { d1 } else { d2 } };

                    if min_d > max_dist || !found {
                        max_dist = min_d;
                        furthest_id = p;
                        found = true;
                    }
                }
                p += 1;
            };

            if found {
                let mut parcel: Parcel = world.read_model(furthest_id);
                parcel.owner = zero_addr;
                world.write_model(@parcel);
                kingdom.parcel_count -= 1;
                world.write_model(@kingdom);
            }
        }
    }
```

- [ ] **Step 8: Implement claim_parcel**

```cairo
        fn claim_parcel(ref self: ContractState, match_id: u64, parcel_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            let stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(stakes.settled, 'Not settled yet');

            // Verify caller is the winner
            let winner = if state.vault_a_hp > state.vault_b_hp {
                state.player_a
            } else if state.vault_b_hp > state.vault_a_hp {
                state.player_b
            } else {
                panic!("Draw: no parcel to claim")
            };
            assert(caller == winner, 'Not the winner');

            // Verify target parcel is unclaimed and adjacent to winner's territory
            let zero_addr: ContractAddress = 0.try_into().unwrap();
            let parcel: Parcel = world.read_model(parcel_id);
            assert(parcel.owner == zero_addr, 'Parcel not unclaimed');
            assert(
                self.is_adjacent_to_territory(caller, parcel.col, parcel.row),
                'Not adjacent to territory',
            );

            let mut claim = parcel;
            claim.owner = caller;
            world.write_model(@claim);

            let mut kingdom: PlayerKingdom = world.read_model(caller);
            kingdom.parcel_count += 1;
            world.write_model(@kingdom);
        }
```

Add `is_adjacent_to_territory` helper:

```cairo
        fn is_adjacent_to_territory(
            self: @ContractState, player: ContractAddress, col: u16, row: u16,
        ) -> bool {
            let world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);

            let mut p: u32 = 0;
            let mut adjacent = false;
            while p < config.total_parcels {
                if !adjacent {
                    let parcel: Parcel = world.read_model(p);
                    if parcel.owner == player {
                        if siege_dojo::utils::hex::is_neighbor(parcel.col, parcel.row, col, row) {
                            adjacent = true;
                        }
                    }
                }
                p += 1;
            };
            adjacent
        }
```

- [ ] **Step 9: Run tests**

Run: `sozo test -f test_staked_match`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_staked_match.cairo
git commit -m "feat: staked match lifecycle (create, join, settle, claim parcel)"
```

---

### Task 5: Preset Defense & Conquest

Implement the conquest system: players set a preset defense for their territory, and attackers initiate single-round sieges against neighbor parcels.

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

**Dependencies:** Tasks 1-4

**Key mechanics:**
- Defender sets preset defense (budget 15, stored on-chain).
- Attacker initiates conquest targeting a specific neighbor parcel.
- Single-round resolution: attacker blind, defender static.
- Defender has 15 budget and 75 vault HP. Attacker has 10 budget and 50 vault HP.
- Attacker wins → takes the parcel. Attacker loses → loses their closest parcel to defender (goes to defender). Draw → no changes.
- Last stand: attackers with only home parcels risk nothing.

- [ ] **Step 1: Write conquest tests**

```cairo
// src/tests/test_conquest.cairo

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

#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::conquest::{
        conquest, IConquestDispatcher, IConquestDispatcherTrait,
    };
    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::{PresetDefense, m_PresetDefense};
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use super::{MockVrfProvider, MockAccount};

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_ability_token(admin: starknet::ContractAddress) -> (IAbilityTokenDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (IAbilityTokenDispatcher { contract_address: addr }, addr)
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(conquest::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"conquest")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    // Setup: world + 2 players + give player_a an extra non-home parcel adjacent to player_b
    fn conquest_setup() -> (
        dojo::world::WorldStorage,
        IConquestDispatcher,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a (attacker)
        starknet::ContractAddress, // player_b (defender)
    ) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (conquest_addr, _) = world.dns(@"conquest").unwrap();
        let conquest_sys = IConquestDispatcher { contract_address: conquest_addr };

        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

        // VRF
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        IActions1v1Dispatcher { contract_address: actions_addr }.set_vrf_provider(mock_vrf_addr);

        // AbilityToken
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);
        world_sys.set_ability_token(ability_token_addr);

        // Grid: 2 rows, 5 cols each (10 parcels)
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Register players
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);

        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);

        // Give player_a a non-home parcel adjacent to player_b's territory
        // (manually assign via write_model_test)
        // Find an unclaimed parcel adjacent to both players' territory
        // For testing, just assign a specific parcel to player_a
        let mut extra_parcel: Parcel = world.read_model(4_u32); // arbitrary unclaimed parcel
        if extra_parcel.owner == 0.try_into().unwrap() {
            extra_parcel.owner = player_a;
            world.write_model_test(@extra_parcel);
            let mut ka: PlayerKingdom = world.read_model(player_a);
            ka.parcel_count += 1;
            world.write_model_test(@ka);
        }

        (world, conquest_sys, world_sys, player_a, player_b)
    }

    #[test]
    fn test_set_preset_defense() {
        let (mut world, conquest_sys, _, _, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(5, 4, 3, 2, 1, 0, 0);

        let defense: PresetDefense = world.read_model(player_b);
        assert(defense.g0 == 5, 'g0 should be 5');
        assert(defense.g1 == 4, 'g1 should be 4');
        assert(defense.repair == 2, 'repair should be 2');
    }

    #[test]
    #[should_panic(expected: ('Budget exceeds 15',))]
    fn test_preset_defense_over_budget() {
        let (_, conquest_sys, _, _, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(5, 5, 5, 3, 0, 0, 0); // total = 18 > 15
    }

    #[test]
    fn test_conquest_attacker_wins() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender sets weak defense
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(1, 1, 1, 0, 0, 0, 0);

        // Find a defender parcel to target (non-home, owned by player_b)
        let mut target_id: u32 = 0;
        let mut found = false;
        let config: WorldConfig = world.read_model(0_u8);
        let mut p: u32 = 0;
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == player_b && !parcel.is_home && !found {
                target_id = p;
                found = true;
            }
            p += 1;
        };

        // If no non-home B parcel, give B one for testing
        if !found {
            // Assign parcel 9 to player_b
            let mut tp: Parcel = world.read_model(9_u32);
            tp.owner = player_b;
            world.write_model_test(@tp);
            target_id = 9;
            let mut kb: PlayerKingdom = world.read_model(player_b);
            kb.parcel_count += 1;
            world.write_model_test(@kb);
        }

        // Attacker launches conquest with overwhelming attack
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(
            target_id,
            10, 0, 0, // attack: all on gate 0
            0, 0, 0,  // defense: none
            0,         // repair: 0
            0, 0, 0,   // nodes: none
        );

        // Verify target parcel is now owned by attacker
        let target: Parcel = world.read_model(target_id);
        assert(target.owner == player_a, 'attacker should own target');
    }

    #[test]
    fn test_conquest_attacker_loses_parcel_to_defender() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender sets strong defense (budget 15)
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(5, 5, 5, 0, 0, 0, 0);

        // Give B a non-home parcel to target
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        let ka_before: PlayerKingdom = world.read_model(player_a);

        // Attacker launches weak attack
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(
            9,          // target
            1, 1, 1,    // weak attack
            0, 0, 0,    // no defense
            0, 0, 0, 0, // no repair/nodes
        );

        // Attacker should lose a parcel (goes to defender)
        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.parcel_count < ka_before.parcel_count, 'attacker should lose parcel');
    }

    #[test]
    fn test_last_stand_no_parcel_loss() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Remove player_a's non-home parcels (leave only home)
        let config: WorldConfig = world.read_model(0_u8);
        let mut p: u32 = 0;
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == player_a && !parcel.is_home {
                let mut release = parcel;
                release.owner = zero_addr;
                world.write_model_test(@release);
            }
            p += 1;
        };
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.parcel_count = 3; // only home parcels
        world.write_model_test(@ka);

        // Defender sets strong defense
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(5, 5, 5, 0, 0, 0, 0);

        // Give B a non-home parcel to target
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker (home-only) launches weak attack and loses
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0);

        // Player A should still have 3 parcels (last stand — no loss)
        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.parcel_count == 3, 'last stand: no parcel loss');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_conquest`
Expected: FAIL — conquest contract not implemented.

- [ ] **Step 3: Implement conquest contract**

```cairo
// src/systems/conquest.cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait IConquest<T> {
    fn set_preset_defense(ref self: T, g0: u8, g1: u8, g2: u8, repair: u8, nc0: u8, nc1: u8, nc2: u8);
    fn initiate_conquest(
        ref self: T,
        target_parcel: u32,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
    );
}

#[dojo::contract]
pub mod conquest {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::preset_defense::PresetDefense;
    use siege_dojo::utils::hex;

    const DEFENDER_BUDGET: u8 = 15;
    const ATTACKER_BUDGET: u8 = 10;
    const DEFENDER_HP: u8 = 75;
    const ATTACKER_HP: u8 = 50;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn min_u8(a: u8, b: u8) -> u8 {
        if a < b { a } else { b }
    }

    #[abi(embed_v0)]
    impl ConquestImpl of super::IConquest<ContractState> {
        fn set_preset_defense(
            ref self: ContractState,
            g0: u8, g1: u8, g2: u8, repair: u8, nc0: u8, nc1: u8, nc2: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let total = g0 + g1 + g2 + repair + nc0 + nc1 + nc2;
            assert(total <= DEFENDER_BUDGET, 'Budget exceeds 15');

            world.write_model(@PresetDefense {
                player: caller,
                g0, g1, g2, repair, nc0, nc1, nc2,
            });
        }

        fn initiate_conquest(
            ref self: ContractState,
            target_parcel: u32,
            p0: u8, p1: u8, p2: u8,
            g0: u8, g1: u8, g2: u8,
            repair: u8,
            nc0: u8, nc1: u8, nc2: u8,
        ) {
            let mut world = self.world_default();
            let attacker = get_caller_address();

            // Validate attacker budget
            let atk_total = p0 + p1 + p2 + g0 + g1 + g2 + repair + nc0 + nc1 + nc2;
            assert(atk_total <= ATTACKER_BUDGET, 'Budget exceeds 10');

            // Validate target parcel
            let target: Parcel = world.read_model(target_parcel);
            let defender = target.owner;
            assert(defender.is_non_zero(), 'Target is unclaimed');
            assert(defender != attacker, 'Cannot attack own parcel');
            assert(!target.is_home, 'Cannot attack home parcel');

            // Attacker must have a parcel adjacent to target
            let atk_kingdom: PlayerKingdom = world.read_model(attacker);
            assert(atk_kingdom.registered, 'Not registered');
            let config: WorldConfig = world.read_model(0_u8);
            let mut has_adjacent = false;
            let mut p: u32 = 0;
            while p < config.total_parcels {
                if !has_adjacent {
                    let parcel: Parcel = world.read_model(p);
                    if parcel.owner == attacker {
                        if hex::is_neighbor(parcel.col, parcel.row, target.col, target.row) {
                            has_adjacent = true;
                        }
                    }
                }
                p += 1;
            };
            assert(has_adjacent, 'No adjacent parcel');

            // Get defender's preset defense
            let defense: PresetDefense = world.read_model(defender);

            // Single-round resolution (no modifiers — conquest is pure allocation)
            // Damage to defender vault (attacker's attack vs defender's defense)
            let dmg_g0 = if p0 > defense.g0 { p0 - defense.g0 } else { 0 };
            let dmg_g1 = if p1 > defense.g1 { p1 - defense.g1 } else { 0 };
            let dmg_g2 = if p2 > defense.g2 { p2 - defense.g2 } else { 0 };
            let total_dmg_to_defender: u16 = dmg_g0.into() + dmg_g1.into() + dmg_g2.into();

            // For the defender's "attack" in conquest, we don't have an explicit
            // defender attack phase. The defender only defends.
            // The attacker's vault HP is only relevant if we add defender counterattack.
            // For now: attacker wins if they deal enough damage to breach the defender's vault.

            // Apply defender repair
            let def_repair = min_u8(defense.repair, 3);
            let mut def_hp: u16 = DEFENDER_HP.into();
            def_hp = if def_hp + def_repair.into() > DEFENDER_HP.into() {
                DEFENDER_HP.into()
            } else {
                def_hp + def_repair.into()
            };

            // Apply damage
            if total_dmg_to_defender >= def_hp {
                def_hp = 0;
            } else {
                def_hp = def_hp - total_dmg_to_defender;
            }

            let attacker_wins = def_hp == 0;

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
            } else {
                // Attacker loses — find their parcel closest to the target
                // and transfer it to the defender.
                // Exception: last stand (attacker has only home parcels) → no loss.
                let mut has_non_home = false;
                let mut closest_id: u32 = 0;
                let mut min_dist: u16 = 65535;

                let mut p2: u32 = 0;
                while p2 < config.total_parcels {
                    let parcel: Parcel = world.read_model(p2);
                    if parcel.owner == attacker && !parcel.is_home {
                        has_non_home = true;
                        let dist = hex::hex_distance(parcel.col, parcel.row, target.col, target.row);
                        if dist < min_dist {
                            min_dist = dist;
                            closest_id = p2;
                        }
                    }
                    p2 += 1;
                };

                if has_non_home {
                    let mut lost_parcel: Parcel = world.read_model(closest_id);
                    lost_parcel.owner = defender;
                    world.write_model(@lost_parcel);

                    let mut ak: PlayerKingdom = world.read_model(attacker);
                    ak.parcel_count -= 1;
                    world.write_model(@ak);

                    let mut dk: PlayerKingdom = world.read_model(defender);
                    dk.parcel_count += 1;
                    world.write_model(@dk);
                }
                // If !has_non_home: last stand — no parcel loss for attacker
            }
        }
    }
}
```

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_conquest`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `sozo test`
Expected: All tests pass (existing 59 + new tests).

- [ ] **Step 6: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: conquest system (preset defense, single-round siege, last stand)"
```

---

## Open Items (Post-Plan)

These items are noted in the spec as future work and are NOT included in this plan:

1. **Ability activation effects (Phase 2B)** — Siege Sword, Stone Cloak, etc. doing actual in-game effects during rounds. Requires a separate plan.
2. **Passive resource drip from home parcels** — time-based resource accumulation. Simple but requires a `claim_drip()` entrypoint and timestamp math.
3. **Free first craft** — modify `crafting_1v1` to check `PlayerKingdom.free_craft_used` and skip resource burn.
4. **Parcel resource generation per match** — award resources based on parcels owned when a match completes (separate from in-match node resources).
5. **Matchmaking queue** — automatic pairing. Currently players create matches by specifying opponents directly.
6. **IERC1155Receiver robustness** — the ERC-1155 receiver implementation may need adjustment based on OpenZeppelin's exact acceptance check behavior. The ISRC6 fallback (supports_interface for account ID) is the safest approach if the receiver interface constant is unavailable.
7. **Conquest with ability effects** — attackers using abilities during conquest. Currently conquest is pure budget allocation.
8. **Encrypted preset defense** — prevent chain-state reading of defense allocations.
