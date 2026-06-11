// src/tests/test_traps_1v1.cairo
#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};

    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::systems::commit_reveal_1v1::{commit_reveal_1v1, ICommitReveal1v1Dispatcher, ICommitReveal1v1DispatcherTrait};
    use siege_dojo::systems::resolution_1v1::{resolution_1v1, IResolution1v1Dispatcher, IResolution1v1DispatcherTrait};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::{RoundModifiers1v1, m_RoundModifiers1v1};
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    fn hash_1v1_with_traps(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
        h = h.update(0); h = h.update(0);
        h.finalize()
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

    /// Setup helper: creates a match at round 10, writes node ownership and modifiers,
    /// then plays a round with trap values via commit-reveal.
    fn setup_with_traps(
        node_owners: [NodeOwner; 3],
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();

        let match_id: u64 = 1;
        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp: 50, vault_b_hp: 50,
            current_round: 10, status: MatchStatus::Active,
        });

        // Write node ownership
        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState {
                match_id, node_index: i, owner: *node_owners.span()[i.into()],
            });
            i += 1;
        };

        // Write modifiers for round 10 (all normal)
        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 10,
            gate_0: 0, gate_1: 0, gate_2: 0,
        });

        // Play round
        let salt: felt252 = 99;
        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2) = a_move;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2) = b_move;

        let h_a = hash_1v1_with_traps(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2);
        let h_b = hash_1v1_with_traps(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2);

        testing::set_contract_address(pa);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(pb);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(pa);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, 0, 0);
        testing::set_contract_address(pb);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, 0, 0);

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        (world, match_id)
    }

    #[test]
    fn test_trap_deals_5_damage() {
        // Player A owns node 0 (budget = 10 + 1 = 11)
        // A: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0] = 0+2 = 2 <= 11
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,0,0], traps [0,0,0] = 5 <= 10
        // B contests node 0 with 5 vs A's 0 -> B wins node 0
        // Trap triggers: ownership changed from TeamA -> TeamB, A had trap0=1 -> B takes 5 damage
        // Expected: HP_A=50, HP_B=45
        let (mut world, match_id) = setup_with_traps(
            [NodeOwner::TeamA, NodeOwner::None, NodeOwner::None],
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 45, 'vault_b should be 45');
    }

    #[test]
    fn test_trap_not_triggered_if_not_contested() {
        // Player A owns node 0, traps it. B doesn't contest.
        // A: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0] = 2 <= 11
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [0,0,0] = 0 <= 10
        // Tie at 0 keeps owner = TeamA. No ownership change -> no trap damage.
        // Expected: HP_A=50, HP_B=50
        let (mut world, match_id) = setup_with_traps(
            [NodeOwner::TeamA, NodeOwner::None, NodeOwner::None],
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 50, 'vault_b should be 50');
    }

    #[test]
    #[should_panic]
    fn test_trap_only_on_owned_nodes() {
        // All nodes neutral. Player A tries trap0=1. Should panic.
        // A: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0]
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [0,0,0]
        let (_world, _match_id) = setup_with_traps(
            [NodeOwner::None, NodeOwner::None, NodeOwner::None],
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
    }

    #[test]
    fn test_trap_costs_2_budget() {
        // Player A owns node 0 (budget = 11). A: atk [3,3,0], traps [1,0,0] = 6+2=8 <= 11. Should succeed.
        // B: atk [0,0,0], nodes [5,3,2] = 10 <= 10
        let (mut world, match_id) = setup_with_traps(
            [NodeOwner::TeamA, NodeOwner::None, NodeOwner::None],
            (3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 5, 3, 2, 0, 0, 0),
        );

        // Verify match state exists and resolved (doesn't panic)
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.status == MatchStatus::Finished, 'match should be finished');
    }

    #[test]
    #[should_panic]
    fn test_trap_over_budget_rejected() {
        // Round 10 budget = 10 + 1 node + 4 escalation = 15.
        // A: atk [5,5,4], def [0,0,0], repair 0, nodes [0,0,0], traps [1,0,0]
        // Total = 5+5+4 + (1*2) = 16 > 15. Should panic.
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0], traps [0,0,0]
        let (_world, _match_id) = setup_with_traps(
            [NodeOwner::TeamA, NodeOwner::None, NodeOwner::None],
            (5, 5, 4, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
    }
}
