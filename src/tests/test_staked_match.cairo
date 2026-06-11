// Mock VRF provider for staked match tests.
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
    use siege_dojo::models::player_reputation::m_PlayerReputation;
    use siege_dojo::models::match_record::m_MatchRecord;
    use siege_dojo::models::pillage_eligibility::m_PillageEligibility;
    use siege_dojo::models::pillage::m_Pillage;
    use siege_dojo::models::faction::{m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::m_FactionMember;
    use siege_dojo::models::faction_invite::m_FactionInvite;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::models::resource_config::ResourceConfig;
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
        // Use write_model_test to set ResourceConfig (avoids world owner check)
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token_addr;
        world.write_model_test(@rc);

        // Reset to world owner before initialize_world (requires is_owner)
        starknet::testing::set_contract_address(contract_address_const::<0>());

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
        // Approve world_system to transfer abilities
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

    // Namespace/contract defs — include all contracts needed
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

        // After create: A's ability 1 should be escrowed
        assert(erc1155.balance_of(player_a, 1_u256) == 0_u256, 'a id 1 should be escrowed');

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // After join: B's ability 2 should be escrowed
        assert(erc1155.balance_of(player_b, 2_u256) == 0_u256, 'b id 2 should be escrowed');

        // Check escrow balances
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        assert(erc1155.balance_of(world_sys_addr, 1_u256) == 1_u256, 'escrow should have id 1');
        assert(erc1155.balance_of(world_sys_addr, 2_u256) == 1_u256, 'escrow should have id 2');

        // Check stakes model
        let stakes: MatchStakes1v1 = world.read_model(match_id);
        assert(stakes.a_stake_1 == 1, 'a_stake_1 should be 1');
        assert(stakes.b_stake_1 == 2, 'b_stake_1 should be 2');
        assert(stakes.stake_count == 1, 'stake_count should be 1');

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
        // A started with abilities 1,2,3. Escrowed ability 1. So after settle:
        // - ability 1: was 0 (escrowed) + 1 (returned) = 1
        // - ability 2: was 1 (kept) + 1 (won from B) = 2
        assert(erc1155.balance_of(player_a, 1_u256) == 1_u256, 'a should have id 1 back');
        assert(erc1155.balance_of(player_a, 2_u256) == 2_u256, 'a should get b id 2');
    }

    #[test]
    fn test_settle_match_loser_loses_parcel() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        // Give player B an extra non-home parcel so release_furthest_parcel has something to release
        // Find an unclaimed parcel and assign it to player_b
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let config: WorldConfig = world.read_model(0_u8);
        let mut extra_parcel_id: u32 = 0;
        let mut p: u32 = 0;
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == zero_addr {
                extra_parcel_id = p;
                break;
            }
            p += 1;
        };
        // Assign it to player_b (non-home)
        let mut extra: Parcel = world.read_model(extra_parcel_id);
        extra.owner = player_b;
        extra.is_home = false;
        world.write_model_test(@extra);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count = kb.parcel_count + 1;
        world.write_model_test(@kb);

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
        world_sys.claim_parcel(match_id, claim_id, 0);

        let kingdom_a_after: PlayerKingdom = world.read_model(player_a);
        assert(kingdom_a_after.parcel_count == before_count + 1, 'a should gain a parcel');
    }

    #[test]
    fn test_join_staked_match_wires_abilities() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1, 2, 3]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![1, 2, 3]);

        // Verify MatchAbilities1v1 is populated
        let abilities: MatchAbilities1v1 = world.read_model(match_id);
        assert(abilities.a_ability_1 == 1, 'a should have ability 1');
        assert(abilities.a_ability_2 == 2, 'a should have ability 2');
        assert(abilities.a_ability_3 == 3, 'a should have ability 3');
        assert(abilities.b_ability_1 == 1, 'b should have ability 1');
        assert(abilities.b_ability_2 == 2, 'b should have ability 2');
        assert(abilities.b_ability_3 == 3, 'b should have ability 3');
        assert(!abilities.a_used_1, 'a_used_1 should be false');
        assert(!abilities.b_used_1, 'b_used_1 should be false');
    }

    #[test]
    fn test_matched_wager_abilities_reflect_in_match_abilities() {
        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

        // A stakes 3, B stakes 1 → matched wager = 1
        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1, 2, 3]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![1]);

        let abilities: MatchAbilities1v1 = world.read_model(match_id);
        // A should only have 1 ability (excess refunded)
        assert(abilities.a_ability_1 == 1, 'a should have ability 1');
        assert(abilities.a_ability_2 == 0, 'a slot 2 should be empty');
        assert(abilities.a_ability_3 == 0, 'a slot 3 should be empty');
        // B has 1 ability
        assert(abilities.b_ability_1 == 1, 'b should have ability 1');
    }

    // -------- cancel_staked_match (#46) --------

    #[test]
    fn test_cancel_unjoined_staked_match_refunds_creator() {
        let (mut world, world_sys, player_a, player_b, erc1155) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1, 2]);
        assert(erc1155.balance_of(player_a, 1_u256) == 0_u256, 'id 1 escrowed');
        assert(erc1155.balance_of(player_a, 2_u256) == 0_u256, 'id 2 escrowed');

        world_sys.cancel_staked_match(match_id);

        assert(erc1155.balance_of(player_a, 1_u256) == 1_u256, 'id 1 refunded');
        assert(erc1155.balance_of(player_a, 2_u256) == 1_u256, 'id 2 refunded');

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Finished, 'match terminal');
        let stakes: MatchStakes1v1 = world.read_model(match_id);
        assert(stakes.settled, 'stakes settled');
    }

    #[test]
    #[should_panic]
    fn test_cancel_by_non_creator_panics() {
        let (_, world_sys, player_a, player_b, _) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.cancel_staked_match(match_id);
    }

    #[test]
    #[should_panic]
    fn test_cancel_after_join_panics() {
        let (_, world_sys, player_a, player_b, _) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        starknet::testing::set_contract_address(player_a);
        world_sys.cancel_staked_match(match_id);
    }

    #[test]
    #[should_panic]
    fn test_join_after_cancel_panics() {
        let (_, world_sys, player_a, player_b, _) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        world_sys.cancel_staked_match(match_id);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);
    }

    #[test]
    #[should_panic]
    fn test_settle_after_cancel_panics() {
        let (_, world_sys, player_a, player_b, _) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        world_sys.cancel_staked_match(match_id);

        world_sys.settle_match(match_id);
    }

    #[test]
    #[should_panic]
    fn test_double_cancel_panics() {
        let (_, world_sys, player_a, player_b, _) = full_setup();

        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);
        world_sys.cancel_staked_match(match_id);
        world_sys.cancel_staked_match(match_id);
    }
}
