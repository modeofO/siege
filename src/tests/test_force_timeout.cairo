// Mock VRF provider for force_timeout tests (resolve_round consumes randomness).
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
            // 0 => Normal modifiers at every gate.
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
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::{RoundMoves1v1, m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    use super::MockVrfProvider;

    const COMMIT_TIMEOUT: u64 = 300;
    const REVEAL_TIMEOUT: u64 = 300;

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

    fn setup() -> (dojo::world::WorldStorage, ICommitReveal1v1Dispatcher, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let mock_vrf_addr = deploy_mock_vrf();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        let player_a = contract_address_const::<0x1>();
        let player_b = contract_address_const::<0x2>();
        let match_id = actions_sys.create_match_1v1(player_a, player_b);

        (world, cr_sys, match_id)
    }

    // -------- Commit-phase timeout (#43 bug 1) --------

    #[test]
    fn test_commit_phase_timeout_advances_to_reveal_phase() {
        let (mut world, cr_sys, match_id) = setup();

        // A commits at t=0; commit_deadline armed at 300. B walks away.
        testing::set_block_timestamp(0);
        testing::set_contract_address(contract_address_const::<0x1>());
        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        cr_sys.commit(match_id, h_a);

        testing::set_block_timestamp(COMMIT_TIMEOUT);
        cr_sys.force_timeout(match_id);

        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.commit_count == 2, 'commits should be forced to 2');
        assert(rm.reveal_count == 0, 'no reveals yet');
        assert(rm.reveal_deadline == COMMIT_TIMEOUT + REVEAL_TIMEOUT, 'reveal deadline armed');
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Active, 'match still active');
    }

    #[test]
    #[should_panic]
    fn test_commit_phase_timeout_before_deadline_panics() {
        let (_, cr_sys, match_id) = setup();

        testing::set_block_timestamp(0);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, 'hash_a');

        testing::set_block_timestamp(COMMIT_TIMEOUT - 1);
        cr_sys.force_timeout(match_id);
    }

    #[test]
    fn test_commit_phase_timeout_then_reveal_and_resolve() {
        let (mut world, cr_sys, match_id) = setup();

        // A commits, B deserts. Force the commit phase, A reveals, then force
        // the reveal phase to resolve the round with B zeroed.
        testing::set_block_timestamp(0);
        testing::set_contract_address(contract_address_const::<0x1>());
        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        cr_sys.commit(match_id, h_a);

        testing::set_block_timestamp(COMMIT_TIMEOUT);
        cr_sys.force_timeout(match_id);

        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_block_timestamp(COMMIT_TIMEOUT + REVEAL_TIMEOUT);
        cr_sys.force_timeout(match_id);

        let state: MatchState1v1 = world.read_model(match_id);
        // A: atk 3+2+1=6 vs B zero defense -> B takes 6 (50-6=44).
        // B zeroed: A takes 0.
        assert(state.vault_a_hp == 50, 'a vault untouched');
        assert(state.vault_b_hp == 44, 'b vault takes full attack');
        assert(state.current_round == 2, 'round advanced');
    }

    // -------- Zero-commit abandon (#43 bug 2) --------

    #[test]
    fn test_zero_commit_first_call_arms_deadline() {
        let (mut world, cr_sys, match_id) = setup();

        testing::set_block_timestamp(1000);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.force_timeout(match_id);

        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.commit_count == 0, 'still zero commits');
        assert(rm.commit_deadline == 1000 + COMMIT_TIMEOUT, 'deadline armed');
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Active, 'match still active');
    }

    #[test]
    fn test_zero_commit_second_call_after_deadline_draws() {
        let (mut world, cr_sys, match_id) = setup();

        // Simulate a mid-match abandon where one player is ahead: the draw
        // must equalize vaults so settle_match refunds both sides.
        let mut state: MatchState1v1 = world.read_model(match_id);
        state.vault_a_hp = 40;
        state.vault_b_hp = 27;
        world.write_model_test(@state);

        testing::set_block_timestamp(1000);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.force_timeout(match_id);

        testing::set_block_timestamp(1000 + COMMIT_TIMEOUT);
        cr_sys.force_timeout(match_id);

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Finished, 'match finished');
        assert(state.vault_a_hp == state.vault_b_hp, 'draw: equal vaults');
    }

    #[test]
    #[should_panic]
    fn test_zero_commit_second_call_before_deadline_panics() {
        let (_, cr_sys, match_id) = setup();

        testing::set_block_timestamp(1000);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.force_timeout(match_id);

        testing::set_block_timestamp(1000 + COMMIT_TIMEOUT - 1);
        cr_sys.force_timeout(match_id);
    }

    #[test]
    fn test_commit_after_armed_zero_deadline_closes_draw_path() {
        let (mut world, cr_sys, match_id) = setup();

        // Arm the zero-commit deadline, then B commits before it elapses.
        testing::set_block_timestamp(1000);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.force_timeout(match_id);

        testing::set_block_timestamp(1100);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'hash_b');

        // Past the original zero-commit deadline: the round is now on the
        // normal commit-phase track (deadline re-armed by the commit at 1100).
        testing::set_block_timestamp(1100 + COMMIT_TIMEOUT);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.force_timeout(match_id);

        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.commit_count == 2, 'forced into reveal phase');
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Active, 'no draw once someone commits');
    }

    // -------- Deserter ability forfeiture (#26) --------

    #[test]
    fn test_reveal_phase_timeout_marks_deserter_abilities_used() {
        let (mut world, cr_sys, match_id) = setup();

        // Wire abilities for both players as a staked match would.
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 1, a_ability_2: 2, a_ability_3: 0,
            b_ability_1: 3, b_ability_2: 4, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        testing::set_block_timestamp(0);
        let salt: felt252 = 42;
        // A reveals honestly with ability 1; B commits but never reveals.
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0);
        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, 'hash_b');

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0);

        testing::set_block_timestamp(REVEAL_TIMEOUT);
        cr_sys.force_timeout(match_id);

        let abilities: MatchAbilities1v1 = world.read_model(match_id);
        // Deserter B forfeits the whole loadout.
        assert(abilities.b_used_1, 'b slot 1 forfeited');
        assert(abilities.b_used_2, 'b slot 2 forfeited');
        assert(abilities.b_used_3, 'b slot 3 forfeited');
        // A used ability 1 in the reveal; slot 2 stays available.
        assert(abilities.a_used_1, 'a slot 1 consumed by reveal');
        assert(!abilities.a_used_2, 'a slot 2 untouched');
    }
}
