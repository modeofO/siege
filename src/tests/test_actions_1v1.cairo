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
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::commit_reveal_1v1;
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::{m_Commitment};
    use siege_dojo::models::round_moves_1v1::{m_RoundMoves1v1};
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::{MatchCounter, m_MatchCounter};
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
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
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
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

    fn setup() -> (dojo::world::WorldStorage, IActions1v1Dispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };

        // Deploy mock VRF and wire it into the world config
        let mock_vrf_addr = deploy_mock_vrf();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        (world, actions_sys)
    }

    #[test]
    fn test_create_match_1v1() {
        let (mut world, actions_sys) = setup();
        let player_a = contract_address_const::<0x1>();
        let player_b = contract_address_const::<0x2>();

        let match_id = actions_sys.create_match_1v1(player_a, player_b);
        assert(match_id == 1, 'match_id should be 1');

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 50, 'vault_a should be 50');
        assert(state.vault_b_hp == 50, 'vault_b should be 50');
        assert(state.current_round == 1, 'round should be 1');
        assert(state.status == MatchStatus::Active, 'status should be Active');
        assert(state.player_a == player_a, 'wrong player_a');
        assert(state.player_b == player_b, 'wrong player_b');
    }

    #[test]
    fn test_match_counter_increments_1v1() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();

        let id1 = actions_sys.create_match_1v1(a, b);
        let id2 = actions_sys.create_match_1v1(a, b);
        assert(id1 == 1, 'first should be 1');
        assert(id2 == 2, 'second should be 2');

        let counter: MatchCounter = world.read_model(0_u8);
        assert(counter.count == 2, 'counter should be 2');
    }

    #[test]
    fn test_nodes_initialized_none_1v1() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();

        let match_id = actions_sys.create_match_1v1(a, b);

        let n0: NodeState = world.read_model((match_id, 0_u8));
        let n1: NodeState = world.read_model((match_id, 1_u8));
        let n2: NodeState = world.read_model((match_id, 2_u8));
        assert(n0.owner == NodeOwner::None, 'node 0 should be None');
        assert(n1.owner == NodeOwner::None, 'node 1 should be None');
        assert(n2.owner == NodeOwner::None, 'node 2 should be None');
    }

    #[test]
    fn test_base_budget_is_10_1v1() {
        let (_, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();

        let match_id = actions_sys.create_match_1v1(a, b);
        let budget_a = actions_sys.get_budget_1v1(match_id, true);
        let budget_b = actions_sys.get_budget_1v1(match_id, false);
        assert(budget_a == 10, 'player A budget should be 10');
        assert(budget_b == 10, 'player B budget should be 10');
    }

    #[test]
    fn test_budget_with_node_bonus_1v1() {
        let (mut world, actions_sys) = setup();
        let a = contract_address_const::<0x1>();
        let b = contract_address_const::<0x2>();

        let match_id = actions_sys.create_match_1v1(a, b);

        world.write_model_test(@NodeState { match_id, node_index: 0, owner: NodeOwner::TeamA });
        world.write_model_test(@NodeState { match_id, node_index: 1, owner: NodeOwner::TeamA });

        let budget_a = actions_sys.get_budget_1v1(match_id, true);
        let budget_b = actions_sys.get_budget_1v1(match_id, false);
        assert(budget_a == 12, 'player A should be 12');
        assert(budget_b == 10, 'player B should be 10');
    }
}
