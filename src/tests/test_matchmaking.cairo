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
    use siege_dojo::models::match_queue::{
        QueueSlot, m_QueueSlot, QueueStatus, m_QueueStatus,
        EntryToken, m_EntryToken, EntryConfig, m_EntryConfig, MatchPot, m_MatchPot,
    };
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::events::e_MatchCreated1v1;
    use siege_dojo::tokens::resource_token::{ResourceToken, IResourceTokenDispatcher, IResourceTokenDispatcherTrait};
    use siege_dojo::tests::test_staked_match::MockVrfProvider;

    const T0: u64 = 1000;
    const BUY_IN: u256 = 1000000;

    // Standard ERC-20 surface for approvals/balance checks in tests.
    #[starknet::interface]
    trait IERC20Test<T> {
        fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
        fn balance_of(self: @T, account: starknet::ContractAddress) -> u256;
    }

    fn free_token() -> starknet::ContractAddress {
        contract_address_const::<0xF4EE>()
    }

    fn treasury() -> starknet::ContractAddress {
        contract_address_const::<0x77EA>()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_QueueSlot::TEST_CLASS_HASH),
                TestResource::Model(m_QueueStatus::TEST_CLASS_HASH),
                TestResource::Model(m_EntryToken::TEST_CLASS_HASH),
                TestResource::Model(m_EntryConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchPot::TEST_CLASS_HASH),
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

    // World + matchmaking with a FREE entry token enabled (amount 0).
    fn setup() -> (dojo::world::WorldStorage, IMatchmakingDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        // Point ResourceConfig.vrf_provider at the mock so consume_random works.
        let mock_vrf = deploy_mock_vrf();
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.vrf_provider = mock_vrf;
        world.write_model_test(@rc);

        // Free entry token for the unpaid-path tests.
        world.write_model_test(@EntryToken { token: free_token(), amount: 0, enabled: true });
        world.write_model_test(@EntryConfig {
            config_id: 0, winner_bps: 6500, treasury: treasury(),
        });

        let (mm_addr, _) = world.dns(@"matchmaking").unwrap();
        starknet::testing::set_block_timestamp(T0);
        (world, IMatchmakingDispatcher { contract_address: mm_addr })
    }

    // Adds a paid ERC-20 entry token: mints BUY_IN*10 to both players and
    // approves matchmaking. Returns the token address + ERC-20 reader.
    fn setup_paid_token(
        mut world: dojo::world::WorldStorage,
        mm: IMatchmakingDispatcher,
        a: starknet::ContractAddress,
        b: starknet::ContractAddress,
    ) -> (starknet::ContractAddress, IERC20TestDispatcher) {
        let admin = contract_address_const::<0xADAD>();
        let mut calldata: Array<felt252> = array![];
        let name: ByteArray = "Gold";
        let symbol: ByteArray = "GLD";
        name.serialize(ref calldata);
        symbol.serialize(ref calldata);
        admin.serialize(ref calldata);
        let (token_addr, _) = starknet::syscalls::deploy_syscall(
            ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        let minter = IResourceTokenDispatcher { contract_address: token_addr };
        let erc20 = IERC20TestDispatcher { contract_address: token_addr };

        starknet::testing::set_contract_address(admin);
        minter.mint(a, BUY_IN * 10);
        minter.mint(b, BUY_IN * 10);

        starknet::testing::set_contract_address(a);
        erc20.approve(mm.contract_address, BUY_IN * 10);
        starknet::testing::set_contract_address(b);
        erc20.approve(mm.contract_address, BUY_IN * 10);

        world.write_model_test(@EntryToken { token: token_addr, amount: BUY_IN, enabled: true });
        (token_addr, erc20)
    }

    fn player(n: felt252) -> starknet::ContractAddress {
        match n {
            0 => contract_address_const::<0xA1>(),
            1 => contract_address_const::<0xB2>(),
            _ => contract_address_const::<0xC3>(),
        }
    }

    fn finish_match(
        mut world: dojo::world::WorldStorage, match_id: u64, hp_a: u8, hp_b: u8,
    ) {
        let mut state: MatchState1v1 = world.read_model(match_id);
        state.vault_a_hp = hp_a;
        state.vault_b_hp = hp_b;
        state.status = MatchStatus::Finished;
        world.write_model_test(@state);
    }

    // ── free-entry queue mechanics ─────────────────────────────────────────

    #[test]
    fn test_enqueue_into_empty_slot() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        let result = mm.queue_for_match(free_token());
        assert(result == 0, 'should enqueue, not match');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'a should be head');
        assert(slot.queued_at == T0, 'queued_at = now');
        assert(slot.token == free_token(), 'token recorded');

        let status: QueueStatus = world.read_model(a);
        assert(status.state == 1, 'status queued');
    }

    #[test]
    fn test_second_player_pairs() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(free_token());

        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(free_token());
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

        // Free entries produce a zero pot.
        let pot: MatchPot = world.read_model(match_id);
        assert(pot.player_a == a, 'pot player a');
        assert(pot.amount_a == 0, 'free pot a');
        assert(pot.amount_b == 0, 'free pot b');
    }

    #[test]
    fn test_requeue_refreshes_without_self_match() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(free_token());

        starknet::testing::set_block_timestamp(T0 + 60);
        let result = mm.queue_for_match(free_token());
        assert(result == 0, 'requeue never matches self');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'still head');
        assert(slot.queued_at == T0 + 60, 'window restarted');
    }

    #[test]
    fn test_stale_head_replaced() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(free_token());

        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS + 1);
        starknet::testing::set_contract_address(b);
        let result = mm.queue_for_match(free_token());
        assert(result == 0, 'stale head not matched');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == b, 'b replaced stale head');

        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'stale a idled');
    }

    #[test]
    fn test_leave_queue() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(free_token());
        mm.leave_queue();

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'status idle');

        // Idempotent when not queued.
        mm.leave_queue();
    }

    #[test]
    #[should_panic(expected: ('Not registered', 'ENTRYPOINT_FAILED'))]
    fn test_unregistered_caller_reverts() {
        let (_world, mm) = setup();
        starknet::testing::set_contract_address(player(2));
        mm.queue_for_match(free_token());
    }

    #[test]
    #[should_panic(expected: ('Entry token not enabled', 'ENTRYPOINT_FAILED'))]
    fn test_unknown_entry_token_reverts() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);
        starknet::testing::set_contract_address(a);
        mm.queue_for_match(contract_address_const::<0xDEAD>());
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

    // ── paid entries + pot ─────────────────────────────────────────────────

    #[test]
    fn test_paid_pairing_escrows_both_buy_ins() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);
        let (token, erc20) = setup_paid_token(world, mm, a, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(token);
        // Nothing charged at queue time.
        assert(erc20.balance_of(a) == BUY_IN * 10, 'no charge at queue');

        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(token);

        assert(erc20.balance_of(a) == BUY_IN * 9, 'a paid buy-in');
        assert(erc20.balance_of(b) == BUY_IN * 9, 'b paid buy-in');
        assert(erc20.balance_of(mm.contract_address) == BUY_IN * 2, 'pot escrowed');

        let pot: MatchPot = world.read_model(match_id);
        assert(pot.token_a == token, 'pot token a');
        assert(pot.amount_a == BUY_IN, 'pot amount a');
        assert(pot.amount_b == BUY_IN, 'pot amount b');
        assert(!pot.claimed, 'unclaimed');
    }

    #[test]
    fn test_claim_pays_winner_and_treasury() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);
        let (token, erc20) = setup_paid_token(world, mm, a, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(token);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(token);

        // a wins.
        finish_match(world, match_id, 30, 0);
        mm.claim_winnings(match_id);

        // Winner: 65% of each buy-in = 1.3 * BUY_IN on top of 9 * BUY_IN.
        let winner_cut = BUY_IN * 6500 / 10000;
        assert(erc20.balance_of(a) == BUY_IN * 9 + winner_cut * 2, 'winner paid 65% of pot');
        assert(erc20.balance_of(treasury()) == (BUY_IN - winner_cut) * 2, 'treasury paid 35%');
        assert(erc20.balance_of(mm.contract_address) == 0, 'escrow emptied');

        let pot: MatchPot = world.read_model(match_id);
        assert(pot.claimed, 'pot claimed');
    }

    #[test]
    fn test_claim_draw_refunds_both() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);
        let (token, erc20) = setup_paid_token(world, mm, a, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(token);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(token);

        finish_match(world, match_id, 10, 10);
        mm.claim_winnings(match_id);

        assert(erc20.balance_of(a) == BUY_IN * 10, 'a refunded');
        assert(erc20.balance_of(b) == BUY_IN * 10, 'b refunded');
        assert(erc20.balance_of(treasury()) == 0, 'treasury empty on draw');
    }

    #[test]
    #[should_panic(expected: ('Pot already claimed', 'ENTRYPOINT_FAILED'))]
    fn test_double_claim_reverts() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);
        let (token, _erc20) = setup_paid_token(world, mm, a, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(token);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(token);

        finish_match(world, match_id, 30, 0);
        mm.claim_winnings(match_id);
        mm.claim_winnings(match_id);
    }

    #[test]
    #[should_panic(expected: ('Match not finished', 'ENTRYPOINT_FAILED'))]
    fn test_claim_before_finish_reverts() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);
        let (token, _erc20) = setup_paid_token(world, mm, a, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match(token);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match(token);
        mm.claim_winnings(match_id);
    }

    #[test]
    #[should_panic(expected: ('Entry not funded', 'ENTRYPOINT_FAILED'))]
    fn test_unfunded_entry_reverts() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        let broke = player(2);
        register(world, a);
        register(world, b);
        register(world, broke);
        let (token, _erc20) = setup_paid_token(world, mm, a, b);

        // broke has no balance and no allowance.
        starknet::testing::set_contract_address(broke);
        mm.queue_for_match(token);
    }
}
