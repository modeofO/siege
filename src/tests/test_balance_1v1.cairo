// Tests for the gameplay balance pass:
// - Budget escalates +1 per round above 6 (rounds 7-10).
// - Repair costs 2 budget per HP and is no longer capped at 3 during resolution.
// - Owning a node grants +1 defense at the matching gate, applied the same
//   round the node is captured.
// - Stone Cloak T2 halves gate, trap, and Ember Blast damage (no longer full
//   gate immunity).
// - Next round's gate modifiers are written during the current round's
//   resolution, so players always commit into known terrain.

// Mock VRF returning a fixed non-zero value so modifier rolls are observable:
// 678 -> rolls (8, 7, 6) -> modifiers (3=Deadlock, 2=Mirror, 1=NarrowPass).
#[starknet::contract]
pub mod MockVrfProvider678 {
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
            678
        }
    }
}

// Mock VRF returning 0 -> all Normal modifiers.
#[starknet::contract]
pub mod MockVrfProviderZero {
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
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves_1v1::{RoundMoves1v1, m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::{RoundModifiers1v1, m_RoundModifiers1v1};
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::{m_MatchCounter};
    use siege_dojo::models::resource_config::{m_ResourceConfig};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    use super::{MockVrfProvider678, MockVrfProviderZero};

    fn deploy_mock_vrf_678() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider678::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_mock_vrf_zero() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProviderZero::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        ).unwrap_syscall();
        addr
    }


    /// create_match_1v1 requires the caller to hold a registered Hold
    /// (spam guard, issue #31). Registers the current test caller.
    fn register_caller(ref world: dojo::world::WorldStorage) {
        world.write_model_test(@PlayerKingdom {
            player: starknet::get_contract_address(),
            home_0: 0, home_1: 0, home_2: 0,
            parcel_count: 0,
            registered: true,
            free_craft_used: false,
            last_drip_time: 0,
            tier: 0,
            total_wins: 0,
            faction_reinforcement_enabled: false,
        });
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
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
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

    fn hash_move(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        t0: u8, t1: u8, t2: u8,
        ability_id: u8, ability_target: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(t0.into()); h = h.update(t1.into()); h = h.update(t2.into());
        h = h.update(ability_id.into()); h = h.update(ability_target.into());
        h.finalize()
    }

    /// Spawn a world with a match at the given round, vault HP, and node owners.
    /// Uses the zero mock VRF so any next-round modifiers roll Normal.
    fn setup_match(
        round: u32,
        vault_a_hp: u8,
        vault_b_hp: u8,
        node_owners: [NodeOwner; 3],
    ) -> (dojo::world::WorldStorage, ICommitReveal1v1Dispatcher, IActions1v1Dispatcher, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let mock_vrf_addr = deploy_mock_vrf_zero();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();
        let match_id: u64 = 1;

        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp, vault_b_hp,
            current_round: round, status: MatchStatus::Active,
        });

        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState {
                match_id, node_index: i, owner: *node_owners.span()[i.into()],
            });
            i += 1;
        };

        world.write_model_test(@RoundModifiers1v1 {
            match_id, round,
            gate_0: 0, gate_1: 0, gate_2: 0,
        });

        (world, cr_sys, actions_sys, match_id)
    }

    /// Commit and reveal both players' moves for the current round.
    /// Each move is (p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, t0,t1,t2, ability_id, ability_target).
    fn play_round(
        cr_sys: ICommitReveal1v1Dispatcher,
        match_id: u64,
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) {
        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();
        let salt: felt252 = 42;

        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt) = a_move;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt) = b_move;

        let h_a = hash_move(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt);
        let h_b = hash_move(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt);

        testing::set_contract_address(pa);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(pb);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(pa);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt);
        testing::set_contract_address(pb);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt);
    }

    fn resolve(world: @dojo::world::WorldStorage, match_id: u64) {
        let (res_addr, _) = (*world).dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);
    }

    // --- Budget escalation -------------------------------------------------

    #[test]
    fn test_budget_escalates_in_round_7() {
        // Round 7 budget = 10 + 0 nodes + 1 escalation = 11. A spends exactly 11.
        let (mut world, cr_sys, _, match_id) = setup_match(
            7, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (5, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // total 11
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        let rm: RoundMoves1v1 = world.read_model((match_id, 7_u32));
        assert(rm.reveal_count == 2, 'both reveals accepted');
    }

    #[test]
    #[should_panic(expected: ('Over budget', 'ENTRYPOINT_FAILED'))]
    fn test_budget_round_6_rejects_11() {
        // Round 6 has no escalation: budget stays 10, so 11 must revert.
        let (_world, cr_sys, _, match_id) = setup_match(
            6, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (5, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // total 11
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
    }

    #[test]
    fn test_budget_round_10_is_14() {
        // Round 10 budget = 10 + 0 nodes + 4 escalation = 14.
        let (_world, _, actions_sys, match_id) = setup_match(
            10, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        assert(actions_sys.get_budget_1v1(match_id, true) == 14, 'round 10 budget is 14');
    }

    // --- Repair: 2 budget per HP, uncapped ---------------------------------

    #[test]
    #[should_panic(expected: ('Over budget', 'ENTRYPOINT_FAILED'))]
    fn test_repair_costs_2_budget_per_hp() {
        // Repair 6 costs 12 budget > 10 even with nothing else allocated.
        let (_world, cr_sys, _, match_id) = setup_match(
            1, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
    }

    #[test]
    fn test_repair_uncapped_during_resolution() {
        // A starts at 40 HP and repairs 5 (cost 10): heals the full 5, not 3.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 40, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 45, 'repair 5 heals 5');
    }

    // --- Nodes grant +1 defense at the matching gate, same round -----------

    #[test]
    fn test_node_capture_grants_defense_same_round() {
        // A captures node 0 this round; B attacks gate 0 with 3.
        // Node contests resolve before damage, so A defends gate 0 with +1.
        // Damage to A = 3 - 1 = 2 -> 48 HP (was 47 under the old rules).
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0), // A: nc0=2
            (3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // B: p0=3
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        let n0: NodeState = world.read_model((match_id, 0_u8));
        assert(n0.owner == NodeOwner::TeamA, 'A captured node 0');
        assert(state.vault_a_hp == 48, 'node 0 grants +1 def at gate 0');
    }

    #[test]
    fn test_held_node_grants_defense() {
        // A already owns node 1; B attacks gate 1 with 4 and A allocates no
        // defense there. Damage to A = 4 - 1 = 3 -> 47 HP.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 50, [NodeOwner::None, NodeOwner::TeamA, NodeOwner::None],
        );
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 47, 'held node grants +1 def');
    }

    #[test]
    fn test_node_lost_this_round_defends_for_new_owner() {
        // B takes node 2 from A this round, so the +1 defense at gate 2
        // belongs to B, not A. A attacks gate 2 with 3 -> damage 2 -> B at 48.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 50, [NodeOwner::None, NodeOwner::None, NodeOwner::TeamA],
        );
        play_round(
            cr_sys, match_id,
            (0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // A: p2=3
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0), // B: nc2=4
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        let n2: NodeState = world.read_model((match_id, 2_u8));
        assert(n2.owner == NodeOwner::TeamB, 'B captured node 2');
        assert(state.vault_b_hp == 48, 'node def follows new owner');
        assert(state.vault_a_hp == 50, 'A untouched');
    }

    // --- Stone Cloak T2: halves gate damage and negates enemy healing ------

    #[test]
    fn test_stone_cloak_t2_negates_enemy_repair() {
        // B starts at 40 HP and repairs 5; A's T2 Stone Cloak negates it.
        // B heals nothing and takes no damage -> stays at 40.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 40, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 7, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0), // A: cloak T2
            (0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0), // B: repair 5
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 40, 'T2 cloak negates enemy repair');
    }

    #[test]
    fn test_stone_cloak_t1_does_not_negate_repair() {
        // Same setup with a T1 cloak: B's repair 5 lands -> 45.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 40, [NodeOwner::None, NodeOwner::None, NodeOwner::None],
        );
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 2, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0), // A: cloak T1
            (0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0), // B: repair 5
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 45, 'T1 cloak lets repair land');
    }

    #[test]
    fn test_stone_cloak_t2_does_not_block_ember_or_traps() {
        // T2 cloak is gate damage + healing denial only: A's trapped node 0
        // still deals the full 5 to B when captured under a T2 cloak.
        let (mut world, cr_sys, _, match_id) = setup_match(
            1, 50, 50, [NodeOwner::TeamA, NodeOwner::None, NodeOwner::None],
        );
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 7, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });
        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0), // A: trap node 0
            (0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 7, 0), // B: nc0=5, cloak T2
        );
        resolve(@world, match_id);
        let state: MatchState1v1 = world.read_model(match_id);
        let n0: NodeState = world.read_model((match_id, 0_u8));
        assert(n0.owner == NodeOwner::TeamB, 'B captured node 0');
        assert(state.vault_b_hp == 45, 'trap deals full 5 thru T2');
    }

    // --- Next round's modifiers are announced at resolution ----------------

    #[test]
    fn test_next_round_modifiers_written_at_resolution() {
        // Regression guard: after round N resolves, round N+1's modifiers are
        // already on-chain, so players commit into known terrain.
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let mock_vrf_addr = deploy_mock_vrf_678();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();
        register_caller(ref world);
        let match_id = actions_sys.create_match_1v1(pa, pb);

        // Round 1 modifiers were rolled at match creation.
        let r1: RoundModifiers1v1 = world.read_model((match_id, 1_u32));
        assert(r1.gate_0 == 3 && r1.gate_1 == 2 && r1.gate_2 == 1, 'round 1 mods set at create');

        play_round(
            cr_sys, match_id,
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        resolve(@world, match_id);

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.current_round == 2, 'advanced to round 2');
        let r2: RoundModifiers1v1 = world.read_model((match_id, 2_u32));
        assert(r2.gate_0 == 3 && r2.gate_1 == 2 && r2.gate_2 == 1, 'round 2 mods known pre-commit');
    }
}
