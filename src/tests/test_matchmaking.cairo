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
    use siege_dojo::systems::world_system::world_system;
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
    use siege_dojo::models::match_stakes_1v1::{MatchStakes1v1, m_MatchStakes1v1};
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::events::e_MatchCreated1v1;
    use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use siege_dojo::tokens::resource_token::{ResourceToken, IResourceTokenDispatcher, IResourceTokenDispatcherTrait};
    use siege_dojo::tests::test_staked_match::{MockVrfProvider, MockAccount};

    const T0: u64 = 1000;
    const BUY_IN: u256 = 1000000;

    // Standard ERC-20 surface for approvals/balance checks in tests.
    #[starknet::interface]
    trait IERC20Test<T> {
        fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
        fn balance_of(self: @T, account: starknet::ContractAddress) -> u256;
    }

    // ERC-1155 surface for operator approval / balance checks in tests.
    #[starknet::interface]
    trait IERC1155Test<T> {
        fn set_approval_for_all(ref self: T, operator: starknet::ContractAddress, approved: bool);
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
    }

    fn free_token() -> starknet::ContractAddress {
        contract_address_const::<0xF4EE>()
    }

    fn treasury() -> starknet::ContractAddress {
        contract_address_const::<0x77EA>()
    }

    fn admin() -> starknet::ContractAddress {
        contract_address_const::<0xADAD>()
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
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(matchmaking::TEST_CLASS_HASH),
                // Ability-wager escrow destination (dns lookup at pairing).
                TestResource::Contract(world_system::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"matchmaking")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    #[derive(Copy, Drop)]
    struct Env {
        world: dojo::world::WorldStorage,
        mm: IMatchmakingDispatcher,
        ability: IAbilityTokenDispatcher,
        ability_1155: IERC1155TestDispatcher,
        ability_addr: starknet::ContractAddress,
        world_sys_addr: starknet::ContractAddress,
    }

    fn setup() -> Env {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let mock_vrf = deploy_mock_vrf();

        // AbilityToken minted/administered by `admin`.
        let mut calldata: Array<felt252> = array![];
        admin().serialize(ref calldata);
        let (ability_addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        let ability = IAbilityTokenDispatcher { contract_address: ability_addr };
        starknet::testing::set_contract_address(admin());
        ability.set_minter(admin());

        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.vrf_provider = mock_vrf;
        rc.ability_token = ability_addr;
        world.write_model_test(@rc);

        // Free entry token so wager tests don't need ERC-20 plumbing.
        world.write_model_test(@EntryToken { token: free_token(), amount: 0, enabled: true });
        world.write_model_test(@EntryConfig {
            config_id: 0, winner_bps: 6500, treasury: treasury(),
        });

        let (mm_addr, _) = world.dns(@"matchmaking").unwrap();
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_block_timestamp(T0);
        Env {
            world,
            mm: IMatchmakingDispatcher { contract_address: mm_addr },
            ability,
            ability_1155: IERC1155TestDispatcher { contract_address: ability_addr },
            ability_addr,
            world_sys_addr,
        }
    }

    // Registered (tier 3) player owning `abilities`, matchmaking approved as
    // ability operator.
    fn make_player(env: @Env, abilities: Span<u8>) -> starknet::ContractAddress {
        let mut world = *env.world;
        let player = deploy_user();
        let mut k: PlayerKingdom = world.read_model(player);
        k.registered = true;
        k.tier = 3;
        world.write_model_test(@k);

        starknet::testing::set_contract_address(admin());
        let mut i: u32 = 0;
        while i < abilities.len() {
            (*env.ability).mint(player, (*abilities.at(i)).into(), 1_u256);
            i += 1;
        };

        starknet::testing::set_contract_address(player);
        let mut erc1155 = *env.ability_1155;
        erc1155.set_approval_for_all((*env.mm).contract_address, true);
        player
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

    // ── queue mechanics (free entry token, 1-ability wagers) ───────────────

    #[test]
    fn test_enqueue_into_empty_slot() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        let result = env.mm.queue_for_match(free_token(), array![1]);
        assert(result == 0, 'should enqueue, not match');

        let slot: QueueSlot = world.read_model(1_u8);
        assert(slot.player == a, 'a should be head of slot 1');
        assert(slot.queued_at == T0, 'queued_at = now');
        assert(slot.ability_1 == 1, 'wager recorded');

        let status: QueueStatus = world.read_model(a);
        assert(status.state == 1, 'status queued');
    }

    #[test]
    fn test_same_wager_size_pairs_full_staked_wiring() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let b = make_player(@env, array![3].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1]);

        starknet::testing::set_contract_address(b);
        let match_id = env.mm.queue_for_match(free_token(), array![3]);
        assert(match_id != 0, 'should create match');

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.player_a == a, 'waiting player is a');
        assert(state.player_b == b, 'joiner is b');
        assert(state.status == MatchStatus::Active, 'match active');

        // Ability wagers escrowed at world_system.
        assert(env.ability_1155.balance_of(a, 1_u256) == 0_u256, 'a ability escrowed');
        assert(env.ability_1155.balance_of(b, 3_u256) == 0_u256, 'b ability escrowed');
        assert(env.ability_1155.balance_of(env.world_sys_addr, 1_u256) == 1_u256, 'escrow holds a1');
        assert(env.ability_1155.balance_of(env.world_sys_addr, 3_u256) == 1_u256, 'escrow holds b3');

        // Staked-match models mirror the manual flow.
        let stakes: MatchStakes1v1 = world.read_model(match_id);
        assert(stakes.a_stake_1 == 1, 'a stake');
        assert(stakes.b_stake_1 == 3, 'b stake');
        assert(stakes.stake_count == 1, 'stake count');
        assert(stakes.staked, 'flagged staked');
        assert(!stakes.settled, 'unsettled');

        let ma: MatchAbilities1v1 = world.read_model(match_id);
        assert(ma.a_ability_1 == 1, 'a battle ability');
        assert(ma.b_ability_1 == 3, 'b battle ability');

        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 2, 'a matched');
        assert(sa.matched_match_id == match_id, 'a match id');

        let slot: QueueSlot = world.read_model(1_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');
    }

    #[test]
    fn test_different_wager_sizes_do_not_pair() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let b = make_player(@env, array![2, 3].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1]);

        starknet::testing::set_contract_address(b);
        let result = env.mm.queue_for_match(free_token(), array![2, 3]);
        assert(result == 0, 'sizes differ: no match');

        let slot1: QueueSlot = world.read_model(1_u8);
        let slot2: QueueSlot = world.read_model(2_u8);
        assert(slot1.player == a, 'a still heads slot 1');
        assert(slot2.player == b, 'b heads slot 2');
    }

    #[test]
    fn test_wager_switch_clears_old_slot() {
        let env = setup();
        let a = make_player(@env, array![1, 2].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1]);
        env.mm.queue_for_match(free_token(), array![1, 2]);

        let slot1: QueueSlot = world.read_model(1_u8);
        let slot2: QueueSlot = world.read_model(2_u8);
        assert(slot1.player == contract_address_const::<0>(), 'old slot cleared');
        assert(slot2.player == a, 'a moved to slot 2');
        assert(slot2.ability_2 == 2, 'new wager recorded');
    }

    #[test]
    fn test_stale_head_replaced() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let b = make_player(@env, array![2].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1]);

        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS + 1);
        starknet::testing::set_contract_address(b);
        let result = env.mm.queue_for_match(free_token(), array![2]);
        assert(result == 0, 'stale head not matched');

        let slot: QueueSlot = world.read_model(1_u8);
        assert(slot.player == b, 'b replaced stale head');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'stale a idled');
    }

    #[test]
    fn test_leave_queue() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let mut world = env.world;

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1]);
        env.mm.leave_queue();

        let slot: QueueSlot = world.read_model(1_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'status idle');

        // Idempotent when not queued.
        env.mm.leave_queue();
    }

    #[test]
    #[should_panic(expected: ('Not registered', 'ENTRYPOINT_FAILED'))]
    fn test_unregistered_caller_reverts() {
        let env = setup();
        starknet::testing::set_contract_address(deploy_user());
        env.mm.queue_for_match(free_token(), array![1]);
    }

    #[test]
    #[should_panic(expected: ('Must stake 1-3 abilities', 'ENTRYPOINT_FAILED'))]
    fn test_zero_wager_reverts() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![]);
    }

    #[test]
    #[should_panic(expected: ('Too many abilities for tier', 'ENTRYPOINT_FAILED'))]
    fn test_tier_cap_enforced() {
        let env = setup();
        let a = make_player(@env, array![1, 2].span());
        let mut world = env.world;
        let mut k: PlayerKingdom = world.read_model(a);
        k.tier = 0; // Polis: 1 slot
        world.write_model_test(@k);

        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![1, 2]);
    }

    #[test]
    #[should_panic(expected: ('Ability not owned', 'ENTRYPOINT_FAILED'))]
    fn test_unowned_ability_reverts() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(free_token(), array![2]);
    }

    #[test]
    #[should_panic(expected: ('Approve ability operator', 'ENTRYPOINT_FAILED'))]
    fn test_missing_operator_approval_reverts() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        starknet::testing::set_contract_address(a);
        env.ability_1155.set_approval_for_all(env.mm.contract_address, false);
        env.mm.queue_for_match(free_token(), array![1]);
    }

    #[test]
    #[should_panic(expected: ('Entry token not enabled', 'ENTRYPOINT_FAILED'))]
    fn test_unknown_entry_token_reverts() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        starknet::testing::set_contract_address(a);
        env.mm.queue_for_match(contract_address_const::<0xDEAD>(), array![1]);
    }

    #[test]
    #[should_panic(expected: ('Unauthorized delegate', 'ENTRYPOINT_FAILED'))]
    fn test_delegated_guard_rejects_direct_caller() {
        let env = setup();
        let mut world = env.world;
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions = IActions1v1Dispatcher { contract_address: actions_addr };
        starknet::testing::set_contract_address(deploy_user());
        actions.create_match_1v1_delegated(
            contract_address_const::<0xA1>(), contract_address_const::<0xB2>(), 0,
        );
    }

    // ── paid entries + pot ─────────────────────────────────────────────────

    fn setup_paid_token(
        env: @Env,
        a: starknet::ContractAddress,
        b: starknet::ContractAddress,
    ) -> (starknet::ContractAddress, IERC20TestDispatcher) {
        let mut world = *env.world;
        let mut calldata: Array<felt252> = array![];
        let name: ByteArray = "Gold";
        let symbol: ByteArray = "GLD";
        name.serialize(ref calldata);
        symbol.serialize(ref calldata);
        admin().serialize(ref calldata);
        let (token_addr, _) = starknet::syscalls::deploy_syscall(
            ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        let minter = IResourceTokenDispatcher { contract_address: token_addr };
        let erc20 = IERC20TestDispatcher { contract_address: token_addr };

        starknet::testing::set_contract_address(admin());
        minter.mint(a, BUY_IN * 10);
        minter.mint(b, BUY_IN * 10);

        starknet::testing::set_contract_address(a);
        erc20.approve((*env.mm).contract_address, BUY_IN * 10);
        starknet::testing::set_contract_address(b);
        erc20.approve((*env.mm).contract_address, BUY_IN * 10);

        world.write_model_test(@EntryToken { token: token_addr, amount: BUY_IN, enabled: true });
        (token_addr, erc20)
    }

    fn paired_paid_match(env: @Env) -> (u64, IERC20TestDispatcher, starknet::ContractAddress, starknet::ContractAddress) {
        let a = make_player(env, array![1].span());
        let b = make_player(env, array![2].span());
        let (token, erc20) = setup_paid_token(env, a, b);

        starknet::testing::set_contract_address(a);
        (*env.mm).queue_for_match(token, array![1]);
        // Nothing charged at queue time.
        assert(erc20.balance_of(a) == BUY_IN * 10, 'no charge at queue');

        starknet::testing::set_contract_address(b);
        let match_id = (*env.mm).queue_for_match(token, array![2]);
        (match_id, erc20, a, b)
    }

    #[test]
    fn test_paid_pairing_escrows_both_buy_ins() {
        let env = setup();
        let (match_id, erc20, a, b) = paired_paid_match(@env);
        let mut world = env.world;

        assert(erc20.balance_of(a) == BUY_IN * 9, 'a paid buy-in');
        assert(erc20.balance_of(b) == BUY_IN * 9, 'b paid buy-in');
        assert(erc20.balance_of(env.mm.contract_address) == BUY_IN * 2, 'pot escrowed');

        let pot: MatchPot = world.read_model(match_id);
        assert(pot.amount_a == BUY_IN, 'pot amount a');
        assert(pot.amount_b == BUY_IN, 'pot amount b');
        assert(!pot.claimed, 'unclaimed');
    }

    #[test]
    fn test_claim_pays_winner_and_treasury() {
        let env = setup();
        let (match_id, erc20, a, _b) = paired_paid_match(@env);
        let world = env.world;

        // a wins.
        finish_match(world, match_id, 30, 0);
        env.mm.claim_winnings(match_id);

        let winner_cut = BUY_IN * 6500 / 10000;
        assert(erc20.balance_of(a) == BUY_IN * 9 + winner_cut * 2, 'winner paid 65% of pot');
        assert(erc20.balance_of(treasury()) == (BUY_IN - winner_cut) * 2, 'treasury paid 35%');
        assert(erc20.balance_of(env.mm.contract_address) == 0, 'escrow emptied');
    }

    #[test]
    fn test_claim_draw_refunds_both() {
        let env = setup();
        let (match_id, erc20, a, b) = paired_paid_match(@env);
        let world = env.world;

        finish_match(world, match_id, 10, 10);
        env.mm.claim_winnings(match_id);

        assert(erc20.balance_of(a) == BUY_IN * 10, 'a refunded');
        assert(erc20.balance_of(b) == BUY_IN * 10, 'b refunded');
        assert(erc20.balance_of(treasury()) == 0, 'treasury empty on draw');
    }

    #[test]
    #[should_panic(expected: ('Pot already claimed', 'ENTRYPOINT_FAILED'))]
    fn test_double_claim_reverts() {
        let env = setup();
        let (match_id, _erc20, _a, _b) = paired_paid_match(@env);
        let world = env.world;

        finish_match(world, match_id, 30, 0);
        env.mm.claim_winnings(match_id);
        env.mm.claim_winnings(match_id);
    }

    #[test]
    #[should_panic(expected: ('Match not finished', 'ENTRYPOINT_FAILED'))]
    fn test_claim_before_finish_reverts() {
        let env = setup();
        let (match_id, _erc20, _a, _b) = paired_paid_match(@env);
        env.mm.claim_winnings(match_id);
    }

    #[test]
    #[should_panic(expected: ('Entry not funded', 'ENTRYPOINT_FAILED'))]
    fn test_unfunded_entry_reverts() {
        let env = setup();
        let a = make_player(@env, array![1].span());
        let b = make_player(@env, array![2].span());
        let broke = make_player(@env, array![3].span());
        let (token, _erc20) = setup_paid_token(@env, a, b);

        // broke owns an ability but has no ERC-20 balance/allowance.
        starknet::testing::set_contract_address(broke);
        env.mm.queue_for_match(token, array![3]);
    }
}
