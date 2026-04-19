// Mock VRF provider that returns a deterministic value for testing.
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
            // Returns 0 so random_to_modifiers produces (0,0,0) = Normal for all gates.
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::{commit_reveal_1v1, ICommitReveal1v1Dispatcher, ICommitReveal1v1DispatcherTrait};
    use siege_dojo::systems::resolution_1v1::{resolution_1v1, IResolution1v1Dispatcher, IResolution1v1DispatcherTrait};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{m_MatchState1v1};
    use siege_dojo::models::node_state::{m_NodeState};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves_1v1::{RoundMoves1v1, m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::{m_MatchCounter};
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    use super::MockVrfProvider;

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        ).unwrap_syscall();
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
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span()
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn hash_1v1_move(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
        h = h.update(ability_id.into()); h = h.update(ability_target.into());
        h.finalize()
    }

    fn setup() -> (dojo::world::WorldStorage, IActions1v1Dispatcher, ICommitReveal1v1Dispatcher, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        // Deploy mock VRF and wire it into the world config
        let mock_vrf_addr = deploy_mock_vrf();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        let player_a = contract_address_const::<0x1>();
        let player_b = contract_address_const::<0x2>();
        let match_id = actions_sys.create_match_1v1(player_a, player_b);

        (world, actions_sys, cr_sys, match_id)
    }

    #[test]
    fn test_commit_both_players() {
        let (mut world, _, cr_sys, match_id) = setup();

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, 'hash_a');
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'hash_b');

        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.commit_count == 2, 'should have 2 commits');
    }

    #[test]
    #[should_panic]
    fn test_double_commit_fails_1v1() {
        let (_, _, cr_sys, match_id) = setup();
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, 'hash1');
        cr_sys.commit(match_id, 'hash2');
    }

    #[test]
    #[should_panic]
    fn test_commit_non_player_fails_1v1() {
        let (_, _, cr_sys, match_id) = setup();
        testing::set_contract_address(contract_address_const::<0x999>());
        cr_sys.commit(match_id, 'hash');
    }

    #[test]
    fn test_full_commit_reveal_cycle_1v1() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        // Player A: atk [3,2,1], def [2,1,0], repair 1, nodes [0,0,0] = total 10
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        // Player B: atk [2,2,2], def [2,1,0], repair 1, nodes [0,0,0] = total 10
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal(match_id, salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        let state: siege_dojo::models::match_state_1v1::MatchState1v1 = world.read_model(match_id);
        // Damage to B: max(0,3-2)+max(0,2-1)+max(0,1-0) = 1+1+1 = 3
        // Damage to A: max(0,2-2)+max(0,2-1)+max(0,2-0) = 0+1+2 = 3
        // Repair A=1, B=1. HP_A = 50+1->50(cap), -3 = 47. HP_B = 50+1->50(cap), -3 = 47
        assert(state.vault_a_hp == 47, 'vault_a should be 47');
        assert(state.vault_b_hp == 47, 'vault_b should be 47');
        assert(state.current_round == 2, 'should advance to round 2');
    }

    #[test]
    #[should_panic]
    fn test_over_budget_rejected_1v1() {
        let (_, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        // Total = 5+5+3+0+0+0+0+0+0+0 = 13 > 10
        let h = hash_1v1_move(salt, 5, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'x');

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 5, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    #[test]
    #[should_panic]
    fn test_invalid_hash_rejected_1v1() {
        let (_, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        // Commit with one set of values
        let h = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'x');

        // Reveal with different values
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 4, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    #[test]
    fn test_reveal_with_ability_stores_activation() {
        let (mut world, _, cr_sys, match_id) = setup();

        // Set up abilities for the match (player A has Siege Sword in slot 1)
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 1, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        let salt: felt252 = 42;
        // Player A activates ability 1 (Siege Sword) targeting gate 0
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);

        // Verify ability stored in RoundMoves1v1
        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.a_ability_id == 1, 'a_ability_id should be 1');
        assert(rm.a_ability_target == 0, 'a_ability_target should be 0');

        // Verify ability marked as used
        let abilities: MatchAbilities1v1 = world.read_model(match_id);
        assert(abilities.a_used_1, 'slot 1 should be used');
    }

    #[test]
    #[should_panic(expected: ('Ability not available', 'ENTRYPOINT_FAILED'))]
    fn test_reveal_ability_not_in_set() {
        let (mut world, _, cr_sys, match_id) = setup();

        // Player A has no abilities
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
    }

    #[test]
    fn test_reveal_does_not_resolve() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        // Player A: atk [3,2,1], def [2,1,0], repair 1, nodes [0,0,0] = total 10
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        // Player B: atk [2,2,2], def [2,1,0], repair 1, nodes [0,0,0] = total 10
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal(match_id, salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        // After both reveals, the round should NOT have advanced — resolve_round was not called.
        let state: siege_dojo::models::match_state_1v1::MatchState1v1 = world.read_model(match_id);
        assert(state.current_round == 1, 'round should still be 1');
    }

    #[test]
    fn test_resolve_round_advances() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal(match_id, salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        // Explicitly call resolve_round — this should advance the round.
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        let state: siege_dojo::models::match_state_1v1::MatchState1v1 = world.read_model(match_id);
        assert(state.current_round == 2, 'should advance to round 2');
    }

    #[test]
    #[should_panic(expected: ('Not all revealed', 'ENTRYPOINT_FAILED'))]
    fn test_resolve_round_before_both_reveals_reverts() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        // Only player A reveals
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        // Calling resolve_round with only one reveal should panic
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);
    }
}
