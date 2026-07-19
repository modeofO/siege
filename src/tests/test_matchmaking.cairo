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

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::matchmaking::{
        matchmaking, IMatchmakingDispatcher, IMatchmakingDispatcherTrait,
    };
    use siege_dojo::models::match_queue::{QueueSlot, m_QueueSlot, QueueStatus, m_QueueStatus};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::events::e_MatchCreated1v1;
    use siege_dojo::tests::test_staked_match::MockVrfProvider;

    const T0: u64 = 1000;

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_QueueSlot::TEST_CLASS_HASH),
                TestResource::Model(m_QueueStatus::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(matchmaking::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"matchmaking")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn register(mut world: dojo::world::WorldStorage, player: starknet::ContractAddress) {
        let mut k: PlayerKingdom = world.read_model(player);
        k.registered = true;
        world.write_model_test(@k);
    }

    fn setup() -> (dojo::world::WorldStorage, IMatchmakingDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        // Point ResourceConfig.vrf_provider at the mock so consume_random works.
        let mock_vrf = deploy_mock_vrf();
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.vrf_provider = mock_vrf;
        world.write_model_test(@rc);

        let (mm_addr, _) = world.dns(@"matchmaking").unwrap();
        starknet::testing::set_block_timestamp(T0);
        (world, IMatchmakingDispatcher { contract_address: mm_addr })
    }

    fn player(n: felt252) -> starknet::ContractAddress {
        match n {
            0 => contract_address_const::<0xA1>(),
            1 => contract_address_const::<0xB2>(),
            _ => contract_address_const::<0xC3>(),
        }
    }

    #[test]
    fn test_enqueue_into_empty_slot() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        let result = mm.queue_for_match();
        assert(result == 0, 'should enqueue, not match');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'a should be head');
        assert(slot.queued_at == T0, 'queued_at = now');

        let status: QueueStatus = world.read_model(a);
        assert(status.state == 1, 'status queued');
        assert(status.queued_at == T0, 'status queued_at');
    }

    #[test]
    fn test_second_player_pairs() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();
        assert(match_id != 0, 'should create match');

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.player_a == a, 'waiting player is a');
        assert(state.player_b == b, 'joiner is b');
        assert(state.status == MatchStatus::Active, 'match active');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');

        let sa: QueueStatus = world.read_model(a);
        let sb: QueueStatus = world.read_model(b);
        assert(sa.state == 2, 'a matched');
        assert(sb.state == 2, 'b matched');
        assert(sa.matched_match_id == match_id, 'a match id');
        assert(sb.matched_match_id == match_id, 'b match id');
    }

    #[test]
    fn test_poke_refreshes_without_self_match() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        starknet::testing::set_block_timestamp(T0 + 60);
        let result = mm.queue_for_match();
        assert(result == 0, 'poke never matches self');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'still head');
        assert(slot.queued_at == T0 + 60, 'heartbeat refreshed');
    }

    #[test]
    fn test_stale_head_replaced() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        // Past STALE_SECONDS — b must NOT be matched with the dead head.
        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS + 1);
        starknet::testing::set_contract_address(b);
        let result = mm.queue_for_match();
        assert(result == 0, 'stale head not matched');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == b, 'b replaced stale head');

        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'stale a idled');
    }

    #[test]
    fn test_exactly_at_threshold_still_fresh() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        // now == queued_at + STALE_SECONDS is still fresh (strict >).
        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();
        assert(match_id != 0, 'boundary entry still fresh');
    }

    #[test]
    fn test_leave_queue() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        mm.leave_queue();

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'status idle');

        // Idempotent when not queued.
        mm.leave_queue();
    }

    #[test]
    fn test_leave_queue_preserves_matched_status() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();

        // a raced a cancel against b's pairing tx and lost — matched status
        // must survive so a's client still finds the game.
        starknet::testing::set_contract_address(a);
        mm.leave_queue();
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 2, 'matched survives leave');
        assert(sa.matched_match_id == match_id, 'match id kept');
    }

    #[test]
    fn test_requeue_after_match() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        starknet::testing::set_contract_address(b);
        let first_id = mm.queue_for_match();

        // Both queue again — new match, ids differ, statuses overwritten.
        starknet::testing::set_contract_address(a);
        let r = mm.queue_for_match();
        assert(r == 0, 'a enqueued again');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 1, 'a back to queued');

        starknet::testing::set_contract_address(b);
        let second_id = mm.queue_for_match();
        assert(second_id != 0, 'second match created');
        assert(second_id != first_id, 'new match id');
    }

    #[test]
    #[should_panic(expected: ('Not registered', 'ENTRYPOINT_FAILED'))]
    fn test_unregistered_caller_reverts() {
        let (_world, mm) = setup();
        starknet::testing::set_contract_address(player(2));
        mm.queue_for_match();
    }

    #[test]
    #[should_panic(expected: ('Unauthorized delegate', 'ENTRYPOINT_FAILED'))]
    fn test_delegated_guard_rejects_direct_caller() {
        let (mut world, _mm) = setup();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions = IActions1v1Dispatcher { contract_address: actions_addr };
        starknet::testing::set_contract_address(player(2));
        actions.create_match_1v1_delegated(player(0), player(1), 0);
    }
}
