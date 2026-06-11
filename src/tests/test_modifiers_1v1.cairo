// src/tests/test_modifiers_1v1.cairo
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

    fn hash_1v1(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(0); h = h.update(0); h = h.update(0);
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

    // Setup: create match, inject modifiers, play round via direct model writes
    // (bypasses vRNG since it's an external contract not available in tests)
    // Uses current_round=10 so resolution finishes the match instead of calling vRNG for next round
    fn setup_with_modifiers(
        gate_0: u8, gate_1: u8, gate_2: u8,
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();

        // Create match manually (bypasses vRNG in actions_1v1)
        // Use round 10 so resolution finishes the match (avoids vRNG call for next round)
        let match_id: u64 = 1;
        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp: 50, vault_b_hp: 50,
            current_round: 10, status: MatchStatus::Active,
        });
        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState { match_id, node_index: i, owner: NodeOwner::None });
            i += 1;
        };

        // Write modifiers for round 10
        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 10,
            gate_0, gate_1, gate_2,
        });

        // Play round
        let salt: felt252 = 99;
        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2) = a_move;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2) = b_move;

        let h_a = hash_1v1(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2);
        let h_b = hash_1v1(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2);

        testing::set_contract_address(pa);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(pb);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(pa);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, 0, 0, 0, 0, 0);
        testing::set_contract_address(pb);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, 0, 0, 0, 0, 0);

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        (world, match_id)
    }

    #[test]
    fn test_normal_modifiers_no_change() {
        // All gates Normal (0) — should behave exactly like before
        // A: atk [5,3,0], def [0,0,0], repair 0, nodes [1,1,0] = 10
        // B: atk [0,0,0], def [2,2,2], repair 2, nodes [1,1,0] = 10
        let (mut world, match_id) = setup_with_modifiers(
            0, 0, 0,
            (5, 3, 0, 0, 0, 0, 0, 1, 1, 0),
            (0, 0, 0, 2, 2, 2, 2, 1, 1, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: max(0,5-2)+max(0,3-2)+max(0,0-2) = 3+1+0 = 4
        // Damage to A: 0
        // Repair B = 2. HP_B = 50+2=52->50, then -4 = 46
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 46, 'vault_b should be 46');
    }

    #[test]
    fn test_narrow_pass_caps_at_3() {
        // Gate 0 has Narrow Pass (1), others Normal
        // A: atk [8,0,0], def [0,0,0], repair 0, nodes [1,1,0] = 10
        // B: atk [0,0,0], def [5,0,0], repair 0, nodes [2,2,1] = 10
        // Without modifier: damage at gate 0 = max(0, 8-5) = 3
        // With Narrow Pass: atk capped to 3, def capped to 3, damage = max(0, 3-3) = 0
        let (mut world, match_id) = setup_with_modifiers(
            1, 0, 0,
            (8, 0, 0, 0, 0, 0, 0, 1, 1, 0),
            (0, 0, 0, 5, 0, 0, 0, 2, 2, 1),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'narrow pass should cap damage');
    }

    #[test]
    fn test_mirror_gate_swaps_values() {
        // Gate 0 has Mirror (2), others Normal
        // A: atk [0,0,0], def [5,0,0], repair 0, nodes [2,2,1] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0] = 0
        // (B contests no nodes so A's captures, not B's, decide node defense;
        //  B owns nothing, so no +1 node defense interferes with the swap)
        // At gate 0 with Mirror: A's attack(0) becomes defense, A's defense(5) becomes attack
        // B's attack(0) becomes defense, B's defense(0) becomes attack
        // Damage to B at gate 0: max(0, 5-0) = 5 (A's defense became attack, B's attack became defense)
        // Damage to A at gate 0: max(0, 0-0) = 0
        let (mut world, match_id) = setup_with_modifiers(
            2, 0, 0,
            (0, 0, 0, 5, 0, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // A's defense of 5 becomes attack at mirror gate, dealing 5 damage to B
        assert(state.vault_b_hp == 45, 'mirror should swap: B takes 5');
        assert(state.vault_a_hp == 50, 'A takes 0');
    }

    #[test]
    fn test_deadlock_no_damage() {
        // Gate 0 has Deadlock (3), others Normal
        // A: atk [10,0,0], def [0,0,0], repair 0, nodes [0,0,0] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [5,3,2] = 10
        // Gate 0 is deadlocked: no damage despite 10 attack
        let (mut world, match_id) = setup_with_modifiers(
            3, 0, 0,
            (10, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 5, 3, 2),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'deadlock should prevent damage');
    }

    #[test]
    fn test_overflow_splits_damage() {
        // Gate 0 has Overflow (4), others Normal
        // A: atk [6,0,0], def [0,2,2], repair 0, nodes [0,0,0] = 10
        // B: atk [0,2,2], def [0,0,0], repair 0, nodes [0,0,0] = 4
        // (no node contests: captured nodes would grant +1 defense and
        //  absorb the overflow being asserted here)
        // Gate 0 overflow: A attacks 6, B defends 0 -> overflow = 6
        // 6/2 = 3 per gate -> gates 1 and 2 each get +3 bonus damage
        // Gate 1 normal: A atk 0 vs B def 0 = 0 + 3 overflow = 3
        // Gate 2 normal: A atk 0 vs B def 0 = 0 + 3 overflow = 3
        // Total damage to B: 3 + 3 = 6
        let (mut world, match_id) = setup_with_modifiers(
            4, 0, 0,
            (6, 0, 0, 0, 2, 2, 0, 0, 0, 0),
            (0, 2, 2, 0, 0, 0, 0, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: overflow 6, splits 3+3 to gates 1 and 2
        // Gate 1: 0 base + 3 overflow = 3
        // Gate 2: 0 base + 3 overflow = 3
        // Total: 6. HP_B = 50 - 6 = 44
        assert(state.vault_b_hp == 44, 'overflow should split damage');
    }

    #[test]
    fn test_overflow_odd_rounds_down() {
        // Gate 0 has Overflow (4), others Normal
        // A: atk [5,0,0], def [0,0,0], repair 0, nodes [2,2,1] = 10
        // B: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0] = 0
        // (A captures all nodes; B never attacks, so A's node defense is
        //  irrelevant and B has no node defense to blunt the overflow)
        // Overflow at gate 0: 5 - 0 = 5. 5/2 = 2 per gate (rounded down)
        // Total damage to B: 2 + 2 = 4
        let (mut world, match_id) = setup_with_modifiers(
            4, 0, 0,
            (5, 0, 0, 0, 0, 0, 0, 2, 2, 1),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 46, 'overflow odd rounds down');
    }
}
