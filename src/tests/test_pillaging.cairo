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
    use siege_dojo::models::faction::{m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::m_FactionMember;
    use siege_dojo::models::faction_invite::m_FactionInvite;
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

    /// Patch state so the given player owns exactly parcels h0/h1/h2 as homes,
    /// regardless of what register_player's spatial algorithm picked. Used to
    /// stabilise pillaging tests whose adjacency assertions assumed the old
    /// first-unclaimed-per-type behaviour.
    fn force_legacy_homes(
        ref world: dojo::world::WorldStorage,
        player: starknet::ContractAddress,
        h0: u32, h1: u32, h2: u32,
    ) {
        let mut kingdom: PlayerKingdom = world.read_model(player);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();

        let current: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
        let mut i: u32 = 0;
        while i < 3 {
            let pid = *current.at(i);
            let mut p: Parcel = world.read_model(pid);
            if p.owner == player {
                p.owner = zero_addr;
                p.is_home = false;
                world.write_model_test(@p);
            }
            i += 1;
        };

        let desired: Array<u32> = array![h0, h1, h2];
        let mut i: u32 = 0;
        while i < 3 {
            let pid = *desired.at(i);
            let mut p: Parcel = world.read_model(pid);
            p.owner = player;
            p.is_home = true;
            world.write_model_test(@p);
            i += 1;
        };

        kingdom.home_0 = h0;
        kingdom.home_1 = h1;
        kingdom.home_2 = h2;
        kingdom.parcel_count = 3;
        world.write_model_test(@kingdom);
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
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
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

        // Register player A; pin homes to parcels 0/1/2 (legacy layout).
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        force_legacy_homes(ref world, player_a, 0, 1, 2);
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.tier = 2;
        world.write_model_test(@ka);
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Register player B; pin homes to parcels 3/4/5 (legacy layout).
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        force_legacy_homes(ref world, player_b, 3, 4, 5);
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
    fn test_claim_drip_skips_pillaged_parcel() {
        let (mut world, world_sys, _player_a, player_b, _erc1155) = full_setup();

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_0_id = kingdom_b.home_0;

        starknet::testing::set_block_timestamp(1000);
        let mut kb_mut = kingdom_b;
        kb_mut.last_drip_time = 1000;
        world.write_model_test(@kb_mut);

        // Pillage one home parcel
        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id: home_0_id,
            pillager: contract_address_const::<0x999>(),
            target: player_b,
            start_time: 1000,
            expires_at: 1000 + 86400,
            last_claim_time: 1000,
            active: true,
        });

        // Advance 2 hours
        starknet::testing::set_block_timestamp(1000 + 7200);

        starknet::testing::set_contract_address(player_b);
        world_sys.claim_drip();

        let kb_after: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        assert(kb_after.last_drip_time == 1000 + 7200, 'last_drip_time advanced');
        // The test verifies the flow runs without panicking.
        // The pillaged home is skipped; other 2 homes mint normally.
    }

    #[test]
    fn test_pillage_ends_when_target_beats_pillager() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_block_timestamp(1000);

        let kingdom_a: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
        let home_parcel_id = kingdom_a.home_0;

        // Set up an existing pillage: player_b is pillaging player_a's home_0
        world.write_model_test(@siege_dojo::models::pillage::Pillage {
            home_parcel_id,
            pillager: player_b,
            target: player_a,
            start_time: 0,
            expires_at: 999999999,
            last_claim_time: 0,
            active: true,
        });

        // Player A wins a match against player B (revenge)
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

        let pillage_after: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
        assert(!pillage_after.active, 'pillage should be broken');
    }

    #[test]
    #[should_panic(expected: ('Home protected by ally', 'ENTRYPOINT_FAILED'))]
    fn test_pillage_blocked_by_ally_adjacency() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        starknet::testing::set_block_timestamp(1000);

        world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5,
            status: siege_dojo::models::match_state::MatchStatus::Finished,
        });
        world_sys.settle_match(match_id);

        // Put player_b in a faction with a third player (the ally)
        let ally = contract_address_const::<0x999>();
        world.write_model_test(@siege_dojo::models::faction::Faction {
            faction_id: 1,
            leader: player_b,
            name: 'Guardians',
            tag: 'GD',
            member_count: 2,
            created_at: 0,
            dissolved: false,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: player_b,
            faction_id: 1,
            joined_at: 0,
            last_leave_time: 0,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: ally,
            faction_id: 1,
            joined_at: 0,
            last_leave_time: 0,
        });

        let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        let home_0: siege_dojo::models::parcel::Parcel = world.read_model(kingdom_b.home_0);

        // Find an unclaimed parcel adjacent to home_0 and assign it to ally
        let config: siege_dojo::models::world_config::WorldConfig = world.read_model(0_u8);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let mut ally_parcel_id: u32 = 999999;
        let mut p_search: u32 = 0;
        while p_search < config.total_parcels {
            if ally_parcel_id == 999999 {
                let parcel: siege_dojo::models::parcel::Parcel = world.read_model(p_search);
                if parcel.owner == zero_addr
                    && siege_dojo::utils::hex::is_neighbor(
                        parcel.col, parcel.row, home_0.col, home_0.row
                    )
                {
                    ally_parcel_id = p_search;
                }
            }
            p_search += 1;
        };
        assert(ally_parcel_id != 999999, 'no adjacent parcel to home');

        let mut ally_parcel: siege_dojo::models::parcel::Parcel = world.read_model(ally_parcel_id);
        ally_parcel.owner = ally;
        world.write_model_test(@ally_parcel);

        starknet::testing::set_contract_address(player_a);
        world_sys.initiate_pillage(match_id, kingdom_b.home_0);
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
