// Mock VRF provider for pillaging integration tests.
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
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::player_reputation::m_PlayerReputation;
    use siege_dojo::models::match_record::m_MatchRecord;
    use siege_dojo::models::pillage_eligibility::{PillageEligibility, m_PillageEligibility};
    use siege_dojo::models::pillage::{Pillage, m_Pillage};
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

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH),
                TestResource::Model(m_MatchRecord::TEST_CLASS_HASH),
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
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

    // Full setup: world + 10 parcels + ability token + 2 registered tier-2 players
    fn full_setup() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a
        starknet::ContractAddress, // player_b
        IERC1155LikeDispatcher,    // erc1155 reader
    ) {
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
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token_addr;
        world.write_model_test(@rc);

        // Init world with 10 parcels (2 rows of 5)
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Register player A
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.tier = 2;
        world.write_model_test(@ka);
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Register player B
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.tier = 2;
        world.write_model_test(@kb);
        erc1155.set_approval_for_all(world_sys_addr, true);

        (world, world_sys, player_a, player_b, erc1155)
    }

    #[test]
    fn test_pillage_eligibility_model() {
        let ndef = NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
            ].span()
        };
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let winner = contract_address_const::<0x1>();
        let loser = contract_address_const::<0x2>();
        world.write_model_test(@PillageEligibility {
            winner,
            match_id: 42,
            loser,
            granted_at: 100,
            expires_at: 86500,
            used: false,
        });

        let e: PillageEligibility = world.read_model((winner, 42_u64));
        assert(e.loser == loser, 'loser should match');
        assert(e.granted_at == 100, 'granted_at should be 100');
        assert(!e.used, 'should not be used');
    }

    #[test]
    fn test_pillage_model() {
        let ndef = NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
            ].span()
        };
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let pillager = contract_address_const::<0x1>();
        let target = contract_address_const::<0x2>();
        world.write_model_test(@Pillage {
            home_parcel_id: 7,
            pillager,
            target,
            start_time: 100,
            expires_at: 86500,
            last_claim_time: 100,
            active: true,
        });

        let p: Pillage = world.read_model(7_u32);
        assert(p.pillager == pillager, 'pillager should match');
        assert(p.active, 'should be active');
    }

    #[test]
    fn test_settle_match_grants_eligibility() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        // Force adjacency: assign an unclaimed parcel next to player_b's home_0 to player_a
        let kingdom_b: PlayerKingdom = world.read_model(player_b);
        let b_home_0: Parcel = world.read_model(kingdom_b.home_0);
        let config: WorldConfig = world.read_model(0_u8);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let mut forced_id: u32 = 999999;
        let mut p: u32 = 0;
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == zero_addr
                && siege_dojo::utils::hex::is_neighbor(parcel.col, parcel.row, b_home_0.col, b_home_0.row)
            {
                forced_id = p;
                break;
            }
            p += 1;
        };
        assert(forced_id != 999999, 'no adjacent parcel');
        let mut forced: Parcel = world.read_model(forced_id);
        forced.owner = player_a;
        forced.is_home = false;
        world.write_model_test(@forced);
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.parcel_count += 1;
        world.write_model_test(@ka);

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Force player A to win
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5,
            status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        let eligibility: PillageEligibility = world.read_model((player_a, match_id));
        assert(eligibility.loser == player_b, 'loser should be player_b');
        assert(!eligibility.used, 'should not be used yet');
        assert(eligibility.expires_at > eligibility.granted_at, 'expires after granted');
    }

    #[test]
    fn test_initiate_pillage_happy_path() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_block_timestamp(1000);

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5,
            status: siege_dojo::models::match_state::MatchStatus::Finished,
        });
        world_sys.settle_match(match_id);

        // Find one of B's home parcels that A borders
        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        // Iterate B's homes and find one A is adjacent to via is_adjacent_to_territory check.
        // In the default test grid, parcel 2 (A) borders parcel 3 (B.home_0).
        let home_parcel_id = kingdom_b.home_0;

        starknet::testing::set_contract_address(player_a);
        world_sys.initiate_pillage(match_id, home_parcel_id);

        let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
        assert(pillage.active, 'pillage should be active');
        assert(pillage.pillager == player_a, 'pillager should be A');
        assert(pillage.target == player_b, 'target should be B');

        let eligibility: siege_dojo::models::pillage_eligibility::PillageEligibility =
            world.read_model((player_a, match_id));
        assert(eligibility.used, 'eligibility should be used');
    }

    #[test]
    #[should_panic(expected: ('Already being pillaged', 'ENTRYPOINT_FAILED'))]
    fn test_initiate_pillage_rejects_already_pillaged() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_block_timestamp(1000);

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5,
            status: siege_dojo::models::match_state::MatchStatus::Finished,
        });
        world_sys.settle_match(match_id);

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_parcel_id = kingdom_b.home_0;

        // Pre-populate an active pillage from a third party
        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id,
            pillager: contract_address_const::<0x999>(),
            target: player_b,
            start_time: 0,
            expires_at: 999999999,
            last_claim_time: 0,
            active: true,
        });

        starknet::testing::set_contract_address(player_a);
        world_sys.initiate_pillage(match_id, home_parcel_id);
    }

    #[test]
    fn test_claim_pillage_drip_mints_resources() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_parcel_id = kingdom_b.home_0;

        starknet::testing::set_block_timestamp(1000);

        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id,
            pillager: player_a,
            target: player_b,
            start_time: 1000,
            expires_at: 1000 + 86400,
            last_claim_time: 1000,
            active: true,
        });

        // Advance 2 hours
        starknet::testing::set_block_timestamp(1000 + 7200);

        starknet::testing::set_contract_address(player_a);
        world_sys.claim_pillage_drip(home_parcel_id);

        let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
        assert(pillage.last_claim_time == 1000 + 7200, 'last_claim_time advanced');
        assert(pillage.active, 'still active');
    }

    #[test]
    fn test_claim_pillage_drip_expires_naturally() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_parcel_id = kingdom_b.home_0;

        starknet::testing::set_block_timestamp(1000);

        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id,
            pillager: player_a,
            target: player_b,
            start_time: 1000,
            expires_at: 1000 + 86400,
            last_claim_time: 1000,
            active: true,
        });

        // Advance past expiration
        starknet::testing::set_block_timestamp(1000 + 86400 + 3600);

        starknet::testing::set_contract_address(player_a);
        world_sys.claim_pillage_drip(home_parcel_id);

        let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
        assert(!pillage.active, 'should be inactive');
        assert(pillage.last_claim_time <= 1000 + 86400, 'capped at expires');
    }

    #[test]
    #[should_panic(expected: ('Not the pillager', 'ENTRYPOINT_FAILED'))]
    fn test_claim_pillage_drip_rejects_non_pillager() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_parcel_id = kingdom_b.home_0;

        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id,
            pillager: player_a,
            target: player_b,
            start_time: 0,
            expires_at: 999999999,
            last_claim_time: 0,
            active: true,
        });

        starknet::testing::set_contract_address(player_b);
        world_sys.claim_pillage_drip(home_parcel_id);
    }

    #[test]
    fn test_settle_match_draw_no_eligibility() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Draw: equal HP — no winner, no eligibility granted
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 25, vault_b_hp: 25,
            current_round: 10,
            status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        // No eligibility should be written for either player (default zero values)
        let eligibility_a: PillageEligibility = world.read_model((player_a, match_id));
        let eligibility_b: PillageEligibility = world.read_model((player_b, match_id));
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        assert(eligibility_a.loser == zero_addr, 'draw: no eligibility for a');
        assert(eligibility_b.loser == zero_addr, 'draw: no eligibility for b');
    }
}
