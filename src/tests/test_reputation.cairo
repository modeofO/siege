// Mock VRF provider for reputation integration tests.
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
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::models::player_reputation::{PlayerReputation, m_PlayerReputation};
    use siege_dojo::models::match_record::{MatchRecord, m_MatchRecord};
    use siege_dojo::models::pillage_eligibility::m_PillageEligibility;
    use siege_dojo::models::pillage::m_Pillage;
    use siege_dojo::models::faction::{m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::m_FactionMember;
    use siege_dojo::models::faction_invite::m_FactionInvite;
    use siege_dojo::systems::world_system::calculate_bracket;
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

    // Full setup: world + 10 parcels + ability token + 2 registered players (tier 2)
    fn full_setup() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a
        starknet::ContractAddress, // player_b
        IERC1155LikeDispatcher,    // erc1155 reader
        IAbilityTokenDispatcher,   // ability token (for minting in tests)
        starknet::ContractAddress, // ability token admin
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
        world_sys.initialize_world(cols, rows);

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

        (world, world_sys, player_a, player_b, erc1155, ability_token, admin)
    }

    // ── Unit tests (model and calculate_bracket) ──────────────────────────────

    #[test]
    fn test_player_reputation_model() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0xCAFE>();

        let rep = PlayerReputation {
            player,
            total_losses: 5,
            current_streak: 3,
            best_streak: 7,
            bracket: 2,
        };
        world.write_model_test(@rep);

        let read_back: PlayerReputation = world.read_model(player);
        assert(read_back.total_losses == 5, 'total_losses should be 5');
        assert(read_back.current_streak == 3, 'current_streak should be 3');
        assert(read_back.best_streak == 7, 'best_streak should be 7');
        assert(read_back.bracket == 2, 'bracket should be 2');
    }

    #[test]
    fn test_match_record_model() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_MatchRecord::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0x1111>();
        let opponent = contract_address_const::<0x2222>();

        let record = MatchRecord {
            player,
            opponent,
            wins: 4,
            losses: 2,
            last_match_id: 99,
        };
        world.write_model_test(@record);

        let read_back: MatchRecord = world.read_model((player, opponent));
        assert(read_back.wins == 4, 'wins should be 4');
        assert(read_back.losses == 2, 'losses should be 2');
        assert(read_back.last_match_id == 99, 'last_match_id should be 99');
    }

    #[test]
    fn test_bracket_newcomer() {
        assert(calculate_bracket(3, 2) == 0, '5 matches: newcomer');
        assert(calculate_bracket(0, 0) == 0, '0 matches: newcomer');
        assert(calculate_bracket(5, 4) == 0, '9 matches: newcomer');
    }

    #[test]
    fn test_bracket_developing() {
        assert(calculate_bracket(5, 5) == 1, '10 matches 50%: developing');
        assert(calculate_bracket(2, 8) == 1, '10 matches 20%: developing');
    }

    #[test]
    fn test_bracket_experienced() {
        assert(calculate_bracket(15, 15) == 2, '30 matches 50%: experienced');
        assert(calculate_bracket(13, 17) == 2, '30 matches 43%: experienced');
        assert(calculate_bracket(12, 18) == 1, '30 matches 40%: developing');
    }

    #[test]
    fn test_bracket_veteran() {
        assert(calculate_bracket(35, 25) == 3, '60 matches 58%: veteran');
        assert(calculate_bracket(30, 30) == 2, '60 matches 50%: experienced');
    }

    #[test]
    fn test_bracket_elite() {
        assert(calculate_bracket(60, 40) == 4, '100 matches 60%: elite');
        assert(calculate_bracket(56, 44) == 4, '100 matches 56%: elite');
        assert(calculate_bracket(55, 45) == 3, '100 matches 55%: veteran');
        assert(calculate_bracket(40, 60) == 1, '100 matches 40%: developing');
    }

    #[test]
    fn test_bracket_drop() {
        assert(calculate_bracket(90, 110) == 2, '200 matches 45%: experienced');
        assert(calculate_bracket(60, 140) == 1, '200 matches 30%: developing');
    }

    // ── Integration tests (settle_match writes reputation) ────────────────────

    #[test]
    fn test_settle_updates_reputation() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _ability_token, _admin) = full_setup();

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

        // rep_a: 0 losses, streak 1, best_streak 1
        let rep_a: PlayerReputation = world.read_model(player_a);
        assert(rep_a.total_losses == 0, 'a: no losses');
        assert(rep_a.current_streak == 1, 'a: streak 1');
        assert(rep_a.best_streak == 1, 'a: best_streak 1');

        // rep_b: 1 loss, streak -1
        let rep_b: PlayerReputation = world.read_model(player_b);
        assert(rep_b.total_losses == 1, 'b: 1 loss');
        assert(rep_b.current_streak == -1, 'b: streak -1');

        // record (a,b): wins=1, losses=0
        let record_ab: MatchRecord = world.read_model((player_a, player_b));
        assert(record_ab.wins == 1, 'record ab: 1 win');
        assert(record_ab.losses == 0, 'record ab: 0 losses');
        assert(record_ab.last_match_id == match_id, 'record ab: match_id');

        // record (b,a): wins=0, losses=1
        let record_ba: MatchRecord = world.read_model((player_b, player_a));
        assert(record_ba.wins == 0, 'record ba: 0 wins');
        assert(record_ba.losses == 1, 'record ba: 1 loss');
        assert(record_ba.last_match_id == match_id, 'record ba: match_id');
    }

    #[test]
    fn test_settle_draw_ignores_reputation() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _ability_token, _admin) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Draw: equal HP at round 10
        world.write_model_test(@MatchState1v1 {
            match_id, player_a, player_b,
            vault_a_hp: 25, vault_b_hp: 25,
            current_round: 10, status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        // No reputation changes
        let rep_a: PlayerReputation = world.read_model(player_a);
        assert(rep_a.total_losses == 0, 'draw: a no losses');
        assert(rep_a.current_streak == 0, 'draw: a no streak change');
        assert(rep_a.best_streak == 0, 'draw: a no best_streak');

        let rep_b: PlayerReputation = world.read_model(player_b);
        assert(rep_b.total_losses == 0, 'draw: b no losses');
        assert(rep_b.current_streak == 0, 'draw: b no streak change');

        // No match records created
        let record_ab: MatchRecord = world.read_model((player_a, player_b));
        assert(record_ab.wins == 0, 'draw: no record wins');
        assert(record_ab.losses == 0, 'draw: no record losses');
    }

    #[test]
    fn test_streak_tracking() {
        let (mut world, world_sys, player_a, player_b, erc1155, ability_token, admin) = full_setup();
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

        // Match 1: A wins
        // Players start with abilities 1,2,3 from registration.
        // A stakes ability 1; B stakes ability 2.
        starknet::testing::set_contract_address(player_a);
        let match_id_1 = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id_1, array![2]);
        world.write_model_test(@MatchState1v1 {
            match_id: match_id_1, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5, status: MatchStatus::Finished,
        });
        world_sys.settle_match(match_id_1);
        // After match 1: A won, B lost ability 2. B now only has abilities 1,3.
        // Re-mint ability 2 to B so they can keep staking.
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(admin);
        ability_token.mint(player_b, 2_u256, 1_u256);
        ability_token.set_minter(world_sys_addr);

        // Match 2: A wins
        starknet::testing::set_contract_address(player_a);
        let match_id_2 = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id_2, array![2]);
        world.write_model_test(@MatchState1v1 {
            match_id: match_id_2, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5, status: MatchStatus::Finished,
        });
        world_sys.settle_match(match_id_2);
        // Re-mint ability 2 to B for match 3.
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(admin);
        ability_token.mint(player_b, 2_u256, 1_u256);
        ability_token.set_minter(world_sys_addr);

        // Match 3: A wins
        starknet::testing::set_contract_address(player_a);
        let match_id_3 = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id_3, array![2]);
        world.write_model_test(@MatchState1v1 {
            match_id: match_id_3, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5, status: MatchStatus::Finished,
        });
        world_sys.settle_match(match_id_3);

        // a: streak=3, best_streak=3
        let rep_a: PlayerReputation = world.read_model(player_a);
        assert(rep_a.current_streak == 3, 'a: streak 3');
        assert(rep_a.best_streak == 3, 'a: best_streak 3');
        assert(rep_a.total_losses == 0, 'a: 0 losses');

        // b: streak=-3, losses=3
        let rep_b: PlayerReputation = world.read_model(player_b);
        assert(rep_b.current_streak == -3, 'b: streak -3');
        assert(rep_b.total_losses == 3, 'b: 3 losses');
    }
}
