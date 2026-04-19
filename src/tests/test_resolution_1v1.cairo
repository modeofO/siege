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
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves_1v1::{m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::{m_MatchCounter};
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
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

    fn hash_1v1_move(salt: felt252, p0: u8, p1: u8, p2: u8, g0: u8, g1: u8, g2: u8, repair: u8, nc0: u8, nc1: u8, nc2: u8) -> felt252 {
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

    /// Play one full round of 1v1 (commit + reveal for both players).
    /// Each tuple is (p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2).
    fn setup_and_play_round(
        move_a: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        move_b: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
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

        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();

        let match_id = actions_sys.create_match_1v1(addr1, addr2);

        let salt: felt252 = 99;
        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2) = move_a;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2) = move_b;

        let h_a = hash_1v1_move(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2);
        let h_b = hash_1v1_move(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2);

        testing::set_contract_address(addr1);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(addr2);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(addr1);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, 0, 0, 0, 0, 0);
        testing::set_contract_address(addr2);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, 0, 0, 0, 0, 0);

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        (world, match_id)
    }

    #[test]
    fn test_damage_calculation_1v1() {
        // A: atk [5,3,2], def [0,0,0], repair 0, nodes [0,0,0]
        // B: atk [0,0,0], def [2,2,2], repair 4, nodes [0,0,0]
        let (mut world, match_id) = setup_and_play_round(
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 2, 2, 2, 4, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: (5-2)+(3-2)+(2-2) = 3+1+0 = 4
        // Damage to A: (0-0)+(0-0)+(0-0) = 0
        // Repair A=0, B=3 (capped). HP_A = 50+0=50, -0=50. HP_B = 50+3->50(cap), -4=46
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 46, 'vault_b should be 46');
    }

    #[test]
    fn test_repair_capped_at_3_1v1() {
        // A: atk [0,0,0], def [0,0,0], repair 0, nodes [0,0,0]
        // B: atk [0,0,0], def [0,0,0], repair 10, nodes [0,0,0]
        let (mut world, match_id) = setup_and_play_round(
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 10, 0, 0, 0),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Both take 0 damage. B repair capped at 3, but vault is already at 50, so still 50.
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 50, 'vault_b should be 50');
    }

    #[test]
    fn test_node_contest_1v1() {
        // A: atk [2,2,0], def [2,2,0], repair 0, nodes [2,0,0]  = total 10
        // B: atk [2,2,0], def [2,2,0], repair 0, nodes [0,2,0]  = total 10
        let (mut world, match_id) = setup_and_play_round(
            (2, 2, 0, 2, 2, 0, 0, 2, 0, 0),
            (2, 2, 0, 2, 2, 0, 0, 0, 2, 0),
        );

        let n0: NodeState = world.read_model((match_id, 0_u8));
        let n1: NodeState = world.read_model((match_id, 1_u8));
        let n2: NodeState = world.read_model((match_id, 2_u8));
        // Node 0: A=2, B=0 => TeamA
        // Node 1: A=0, B=2 => TeamB
        // Node 2: A=0, B=0 => tie, stays None
        assert(n0.owner == NodeOwner::TeamA, 'node 0 should be TeamA');
        assert(n1.owner == NodeOwner::TeamB, 'node 1 should be TeamB');
        assert(n2.owner == NodeOwner::None, 'node 2 should be None');
    }

    #[test]
    fn test_win_condition_vault_zero_1v1() {
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

        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();
        let match_id = actions_sys.create_match_1v1(addr1, addr2);

        // Set vault B HP low
        world.write_model_test(@MatchState1v1 {
            match_id,
            player_a: addr1,
            player_b: addr2,
            vault_a_hp: 50,
            vault_b_hp: 5,
            current_round: 1,
            status: MatchStatus::Active,
        });

        let salt: felt252 = 7;
        // A: atk [5,3,2], all else 0. Total = 10
        let h_a = hash_1v1_move(salt, 5, 3, 2, 0, 0, 0, 0, 0, 0, 0);
        // B: def [0,0,0], nodes [5,3,2]. Total = 10
        let h_b = hash_1v1_move(salt, 0, 0, 0, 0, 0, 0, 0, 5, 3, 2);

        testing::set_contract_address(addr1);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(addr2);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(addr1);
        cr_sys.reveal(match_id, salt, 5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        testing::set_contract_address(addr2);
        cr_sys.reveal(match_id, salt, 0, 0, 0, 0, 0, 0, 0, 5, 3, 2, 0, 0, 0, 0, 0);

        // Explicitly call resolve_round after both reveals
        let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
        let res_sys = IResolution1v1Dispatcher { contract_address: res_addr };
        res_sys.resolve_round(match_id);

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: 5+3+2 = 10. HP_B = 5 - 10 => 0
        assert(state.vault_b_hp == 0, 'vault B should be 0');
        assert(state.status == MatchStatus::Finished, 'match should be finished');
    }

    #[test]
    fn test_no_damage_when_defense_exceeds_attack_1v1() {
        // Symmetric mirror: both defend strongly on every gate
        // A: atk [1,1,1], def [3,2,1], repair 0, nodes [0,0,1] = total 10
        // B: atk [1,1,1], def [3,2,1], repair 0, nodes [0,0,1] = total 10
        let (mut world, match_id) = setup_and_play_round(
            (1, 1, 1, 3, 2, 1, 0, 0, 0, 1),
            (1, 1, 1, 3, 2, 1, 0, 0, 0, 1),
        );

        let state: MatchState1v1 = world.read_model(match_id);
        // Damage to B: max(0,1-3)+max(0,1-2)+max(0,1-1) = 0+0+0 = 0
        // Damage to A: max(0,1-3)+max(0,1-2)+max(0,1-1) = 0+0+0 = 0
        assert(state.vault_a_hp == 50, 'no damage to A');
        assert(state.vault_b_hp == 50, 'no damage to B');
    }
}
