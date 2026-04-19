// Mock VRF provider for world tests.
#[starknet::contract]
pub mod MockVrfProvider {
    use starknet::ContractAddress;

    #[derive(Drop, Copy, Clone, Serde)]
    pub enum Source {
        Nonce: ContractAddress,
        Salt: felt252,
    }

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn consume_random(ref self: ContractState, source: Source) -> felt252 {
            0
        }
    }
}

// Mock account contract — supports ISRC6 interface for ERC-1155 acceptance.
#[starknet::contract]
pub mod MockAccount {
    const ISRC6_ID: felt252 =
        0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

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

    use starknet::SyscallResultTrait;

    use siege_dojo::systems::world_system::{world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait};
    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::tokens::ability_token::{
        AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait,
    };

    use super::MockVrfProvider;
    use super::MockAccount;

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        )
            .unwrap_syscall();
        addr
    }

    fn deploy_ability_token(admin: starknet::ContractAddress) -> IAbilityTokenDispatcher {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            calldata.span(),
            false,
        )
            .unwrap_syscall();
        IAbilityTokenDispatcher { contract_address: addr }
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        )
            .unwrap_syscall();
        addr
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ]
            .span()
    }

    fn setup() -> (dojo::world::WorldStorage, IWorldSystemDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        let ws = IWorldSystemDispatcher { contract_address: ws_addr };

        // Deploy mock VRF (wired later when needed)
        let _mock_vrf_addr = deploy_mock_vrf();

        (world, ws)
    }

    #[test]
    fn test_initialize_world() {
        let (mut world, ws) = setup();

        // Init with 4 parcels: (col, row) — all untyped (255)
        ws.initialize_world(
            array![0_u16, 1_u16, 0_u16, 1_u16],
            array![0_u16, 0_u16, 1_u16, 1_u16],
        );

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 4, 'total_parcels should be 4');
        assert(config.initialized, 'should be initialized');

        let parcel_0: Parcel = world.read_model(0_u32);
        assert(parcel_0.col == 0, 'parcel 0 col wrong');
        assert(parcel_0.row == 0, 'parcel 0 row wrong');
        assert(parcel_0.parcel_type == 255, 'parcel 0 should be untyped');
    }

    #[test]
    fn test_register_player() {
        let (mut world, ws) = setup();

        // Init world with 10 parcels (2 rows of 5, all untyped)
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        ws.initialize_world(cols, rows);

        // Deploy AbilityToken
        let admin: starknet::ContractAddress = 0xADAD.try_into().unwrap();
        let ability_token = deploy_ability_token(admin);

        // Get world_system address to use as minter
        let (ws_addr, _) = world.dns(@"world_system").unwrap();

        // Set world_system as minter on the AbilityToken
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(ws_addr);

        // Configure ability_token in ResourceConfig via world_system
        // world_system.set_ability_token checks world owner — we need to be the world owner
        // In test environment the world owner is the test contract address (zero by default)
        // Use write_model_test to directly set the ResourceConfig
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token.contract_address;
        world.write_model_test(@rc);

        // Deploy a mock user account
        let player = deploy_user();

        // Register from the player's address — player chooses types 0, 1, 2
        starknet::testing::set_contract_address(player);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        // Verify PlayerKingdom
        let kingdom: PlayerKingdom = world.read_model(player);
        assert(kingdom.registered, 'Player should be registered');
        assert(kingdom.parcel_count == 3, 'parcel_count should be 3');

        // Verify the first home parcel is owned, is_home, and typed by the player's choice
        let home_parcel: Parcel = world.read_model(kingdom.home_0);
        assert(home_parcel.owner == player, 'home_0 owner wrong');
        assert(home_parcel.is_home, 'home_0 should be home');
        assert(home_parcel.parcel_type == 0, 'home_0 type should be 0');
    }

    #[test]
    fn test_register_player_spatial_separation() {
        // Two sequential registrations on the same 2x5 grid should end up in
        // separated corners — not adjacent. Reproduces the bug from issue #1
        // where sequential picks put new players directly on top of existing.
        let (mut world, ws) = setup();

        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        ws.initialize_world(cols, rows);

        let admin: starknet::ContractAddress = 0xADAD.try_into().unwrap();
        let ability_token = deploy_ability_token(admin);
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(ws_addr);

        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token.contract_address;
        world.write_model_test(@rc);

        // Two distinct player addresses — use different deploy salts so both
        // contracts can coexist.
        let (player_a, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            1,
            array![].span(),
            false,
        ).unwrap_syscall();
        let (player_b, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            2,
            array![].span(),
            false,
        ).unwrap_syscall();

        starknet::testing::set_contract_address(player_a);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        starknet::testing::set_contract_address(player_b);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        let kingdom_a: PlayerKingdom = world.read_model(player_a);
        let kingdom_b: PlayerKingdom = world.read_model(player_b);

        // Players must have distinct homes.
        assert(kingdom_a.home_0 != kingdom_b.home_0, 'home_0 collision');
        assert(kingdom_a.home_0 != kingdom_b.home_1, 'A-home_0 vs B-home_1');
        assert(kingdom_a.home_0 != kingdom_b.home_2, 'A-home_0 vs B-home_2');
        assert(kingdom_a.home_1 != kingdom_b.home_0, 'A-home_1 vs B-home_0');
        assert(kingdom_a.home_1 != kingdom_b.home_1, 'home_1 collision');
        assert(kingdom_a.home_1 != kingdom_b.home_2, 'A-home_1 vs B-home_2');
        assert(kingdom_a.home_2 != kingdom_b.home_0, 'A-home_2 vs B-home_0');
        assert(kingdom_a.home_2 != kingdom_b.home_1, 'A-home_2 vs B-home_1');
        assert(kingdom_a.home_2 != kingdom_b.home_2, 'home_2 collision');

        // Minimum distance between any A-home and any B-home must be >= 2
        // (no adjacency between newly-registered players on a fresh world).
        let a_ids: Array<u32> = array![kingdom_a.home_0, kingdom_a.home_1, kingdom_a.home_2];
        let b_ids: Array<u32> = array![kingdom_b.home_0, kingdom_b.home_1, kingdom_b.home_2];

        let mut min_cross: u16 = 65535_u16;
        let mut i: u32 = 0;
        while i < 3 {
            let ap: Parcel = world.read_model(*a_ids.at(i));
            let mut j: u32 = 0;
            while j < 3 {
                let bp: Parcel = world.read_model(*b_ids.at(j));
                let d = siege_dojo::utils::hex::hex_distance(ap.col, ap.row, bp.col, bp.row);
                if d < min_cross { min_cross = d; }
                j += 1;
            };
            i += 1;
        };
        assert(min_cross >= 2, 'players too close');
    }

    #[test]
    #[should_panic(expected: ('Already registered', 'ENTRYPOINT_FAILED'))]
    fn test_cannot_register_twice() {
        let (mut world, ws) = setup();

        // Init world with 10 parcels
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        ws.initialize_world(cols, rows);

        // Deploy AbilityToken
        let admin: starknet::ContractAddress = 0xADAD.try_into().unwrap();
        let ability_token = deploy_ability_token(admin);
        let (ws_addr, _) = world.dns(@"world_system").unwrap();

        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(ws_addr);

        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token.contract_address;
        world.write_model_test(@rc);

        // Deploy a mock user account
        let player = deploy_user();
        starknet::testing::set_contract_address(player);

        // First registration — should succeed
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        // Second registration — should panic
        ws.register_player(array![0_u8, 1_u8, 2_u8]);
    }
}
