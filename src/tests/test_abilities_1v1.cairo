// src/tests/test_abilities_1v1.cairo
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
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
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

    /// Hash all 16 elements: salt + p0..p2 + g0..g2 + repair + nc0..nc2 + trap0..trap2 + ability_id + ability_target
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

    /// Setup: create world + match at round 10, seed abilities, play one round.
    /// a_abilities: (ability_1, ability_2, ability_3) for player A (ability type IDs, 0 = empty)
    /// b_abilities: same for player B
    /// a_move: (p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, trap0,trap1,trap2, ability_id, ability_target)
    /// b_move: same for player B
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

        // Create match at round 10 so resolution finishes (avoids vRNG call)
        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp: 50, vault_b_hp: 50,
            current_round: 10, status: MatchStatus::Active,
        });

        // All nodes unowned
        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState { match_id, node_index: i, owner: NodeOwner::None });
            i += 1;
        };

        // Write modifiers for round 10 (all normal)
        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 10,
            gate_0: 0, gate_1: 0, gate_2: 0,
        });

        // Seed ability inventory
        let (aa1, aa2, aa3) = a_abilities;
        let (ba1, ba2, ba3) = b_abilities;
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: aa1, a_ability_2: aa2, a_ability_3: aa3,
            b_ability_1: ba1, b_ability_2: ba2, b_ability_3: ba3,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // Commit + reveal for both players
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

        (world, match_id)
    }

    #[test]
    fn test_siege_sword_overrides_attack() {
        // Player A has Siege Sword (ID 1), targets gate 0
        // A allocations: atk [1,0,0], def [0,0,0], repair 0, nodes [0,0,0], ability=1 target=0, budget=1
        // B allocations: atk [0,0,0], def [5,5,0], repair 0, nodes [0,0,0], budget=10
        // Siege Sword overrides A's p0 from 1 to 10
        // Damage to B: max(0, 10-5) + 0 + 0 = 5
        // B HP: 50 - 5 = 45, A HP: 50
        let (mut world, match_id) = setup(
            (1, 0, 0), // A has Siege Sword (ability ID 1)
            (0, 0, 0), // B has no abilities
            (1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0), // A: atk [1,0,0], ability=1 target=0
            (0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // B: def [5,5,0]
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 45, 'siege sword: B should be 45');
        assert(state.vault_a_hp == 50, 'siege sword: A should be 50');
    }

    #[test]
    fn test_stone_cloak_blocks_gate_damage() {
        // Player B has Stone Cloak (ID 2)
        // A: atk [5,3,2], def [0,0,0], budget=10
        // B: atk [0,0,0], def [0,0,0], Stone Cloak, budget=0
        // Without cloak B would take 10 damage. With cloak: 0.
        // B HP: 50, A HP: 50
        let (mut world, match_id) = setup(
            (0, 0, 0), // A has no abilities
            (2, 0, 0), // B has Stone Cloak (ability ID 2)
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // A: atk [5,3,2]
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0), // B: ability=2
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'stone cloak: B should be 50');
        assert(state.vault_a_hp == 50, 'stone cloak: A should be 50');
    }

    #[test]
    fn test_ember_blast_bypasses_gates() {
        // Player A has Ember Blast (ID 3), Player B has Stone Cloak (ID 2)
        // A: all zeros except ability=3
        // B: def [5,5,0] + ability=2
        // Stone Cloak blocks gate damage but NOT Ember Blast
        // B takes 5 direct damage -> HP 45
        let (mut world, match_id) = setup(
            (3, 0, 0), // A has Ember Blast (ability ID 3)
            (2, 0, 0), // B has Stone Cloak (ability ID 2)
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0), // A: ability=3
            (0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0), // B: def [5,5,0], ability=2
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Stone Cloak blocks A's gate attacks, but Ember Blast bypasses it
        assert(state.vault_b_hp == 45, 'ember blast: B should be 45');
        assert(state.vault_a_hp == 50, 'ember blast: A should be 50');
    }

    #[test]
    fn test_hex_reduces_damage() {
        // Player B has Hex (ID 4)
        // A: atk [5,3,2], def [0,0,0], budget=10
        // B: atk [0,0,0], def [0,0,0], Hex, budget=0
        // Without Hex: B takes 10 damage. With Hex: max(0, 10-7) = 3
        // B HP: 47
        let (mut world, match_id) = setup(
            (0, 0, 0), // A has no abilities
            (4, 0, 0), // B has Hex (ability ID 4)
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // A: atk [5,3,2]
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0), // B: ability=4
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 47, 'hex: B should be 47');
        assert(state.vault_a_hp == 50, 'hex: A should be 50');
    }

    #[test]
    fn test_fortify_doubles_defense() {
        // Player B has Fortify (ID 5)
        // A: atk [4,3,3], def [0,0,0], budget=10
        // B: atk [0,0,0], def [3,3,4], Fortify, budget=10
        // Fortify doubles B's defense: [6,6,8]
        // Damage to B: max(0,4-6) + max(0,3-6) + max(0,3-8) = 0
        // B HP: 50
        let (mut world, match_id) = setup(
            (0, 0, 0), // A has no abilities
            (5, 0, 0), // B has Fortify (ability ID 5)
            (4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), // A: atk [4,3,3]
            (0, 0, 0, 3, 3, 4, 0, 0, 0, 0, 0, 0, 0, 5, 0), // B: def [3,3,4], ability=5
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'fortify: B should be 50');
        assert(state.vault_a_hp == 50, 'fortify: A should be 50');
    }
}
