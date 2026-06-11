// src/tests/test_ability_tiers.cairo
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
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    fn hash_move(
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

    fn setup(
        a_abilities: (u8, u8, u8),
        b_abilities: (u8, u8, u8),
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
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

        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState { match_id, node_index: i, owner: NodeOwner::None });
            i += 1;
        };

        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 10,
            gate_0: 0, gate_1: 0, gate_2: 0,
        });

        let (aa1, aa2, aa3) = a_abilities;
        let (ba1, ba2, ba3) = b_abilities;
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: aa1, a_ability_2: aa2, a_ability_3: aa3,
            b_ability_1: ba1, b_ability_2: ba2, b_ability_3: ba3,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

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

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        (world, match_id)
    }

    #[test]
    fn test_t2_siege_sword_attack_10() {
        // Player A has T2 Siege Sword (token ID 6), targets gate 0
        // A: atk [1,0,0], ability=6 target=0, budget=1
        // B: def [5,5,0], budget=10
        // T2 Siege Sword overrides to 10. Damage: 10-5 = 5
        // B HP: 45
        let (mut world, match_id) = setup(
            (6, 0, 0),
            (0, 0, 0),
            (1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0),
            (0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 45, 'T2 siege: B should be 45');
    }

    #[test]
    fn test_t2_stone_cloak_halves_damage() {
        // Player B has T2 Stone Cloak (token ID 7)
        // A: atk [5,3,2], budget=10
        // B: ability=7, budget=0
        // T2 cloak halves gate damage: 5/2 + 3/2 + 2/2 = 2+1+1 = 4. B HP: 46
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (7, 0, 0),
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 46, 'T2 cloak: B should be 46');
    }

    #[test]
    fn test_t2_ember_blast_6_damage() {
        // Player A has T2 Ember Blast (token ID 8)
        // A: ability=8, budget=0
        // B: def [0,0,0], budget=0
        // T2 Ember Blast deals 6 direct damage. B HP: 44
        let (mut world, match_id) = setup(
            (8, 0, 0),
            (0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 44, 'T2 ember: B should be 44');
    }

    #[test]
    fn test_t2_hex_reduces_by_8() {
        // Player B has T2 Hex (token ID 9)
        // A: atk [5,3,2], budget=10
        // B: ability=9, budget=0
        // Without Hex: B takes 10 damage. With T2 Hex (-8): 10 - 8 = 2
        // B HP: 48
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (9, 0, 0),
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 48, 'T2 hex: B should be 48');
    }

    #[test]
    fn test_t2_fortify_doubles_defense() {
        // Player B has T2 Fortify (token ID 10)
        // A: atk [4,3,3], budget=10
        // B: def [3,3,4], ability=10, budget=10
        // T2 Fortify doubles: [6,6,8]
        // Damage: max(0,4-6) + max(0,3-6) + max(0,3-8) = 0
        // B HP: 50
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (10, 0, 0),
            (4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 3, 3, 4, 0, 0, 0, 0, 0, 0, 0, 10, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'T2 fortify: B should be 50');
    }
}
