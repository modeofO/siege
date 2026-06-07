use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions1v1<T> {
    fn create_match_1v1(
        ref self: T,
        player_a: ContractAddress,
        player_b: ContractAddress,
    ) -> u64;
    fn create_match_1v1_delegated(
        ref self: T,
        player_a: ContractAddress,
        player_b: ContractAddress,
        random_value: felt252,
    ) -> u64;
    fn get_budget_1v1(self: @T, match_id: u64, is_player_a: bool) -> u8;
    fn set_resource_config(
        ref self: T,
        iron: ContractAddress, linen: ContractAddress,
        stone: ContractAddress, wood: ContractAddress,
        ember: ContractAddress, seeds: ContractAddress,
    );
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
    fn set_vrf_provider(ref self: T, vrf_provider: ContractAddress);
}

#[starknet::interface]
pub trait IVrfProvider<T> {
    fn consume_random(ref self: T, source: Source) -> felt252;
}

#[derive(Drop, Copy, Clone, Serde)]
pub enum Source {
    Nonce: ContractAddress,
    Salt: felt252,
}

#[dojo::contract]
pub mod actions_1v1 {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_contract_address, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::match_counter::MatchCounter;
    use siege_dojo::models::round_modifiers_1v1::RoundModifiers1v1;
    use siege_dojo::models::events::MatchCreated1v1;
    use siege_dojo::models::resource_config::ResourceConfig;
    use dojo::event::EventStorage;
    use dojo::world::{IWorldDispatcherTrait, WorldStorageTrait};
    use super::{IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source};

    const VRF_PROVIDER_ADDRESS: felt252 =
        0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn random_to_modifiers(random_value: felt252) -> (u8, u8, u8) {
        let r: u256 = random_value.into();
        let roll_0: u8 = (r % 10).try_into().unwrap();
        let roll_1: u8 = ((r / 10) % 10).try_into().unwrap();
        let roll_2: u8 = ((r / 100) % 10).try_into().unwrap();

        let to_modifier = |roll: u8| -> u8 {
            if roll <= 5 { 0 }       // Normal (60%)
            else if roll == 6 { 1 }   // Narrow Pass (10%)
            else if roll == 7 { 2 }   // Mirror Gate (10%)
            else if roll == 8 { 3 }   // Deadlock (10%)
            else { 4 }                // Overflow (10%)
        };

        (to_modifier(roll_0), to_modifier(roll_1), to_modifier(roll_2))
    }

    fn setup_match(
        ref world: dojo::world::WorldStorage,
        player_a: ContractAddress,
        player_b: ContractAddress,
        random_value: felt252,
    ) -> u64 {
        let mut counter: MatchCounter = world.read_model(0_u8);
        let match_id = counter.count + 1;
        counter.count = match_id;
        world.write_model(@counter);

        world.write_model(@MatchState1v1 {
            match_id,
            player_a,
            player_b,
            vault_a_hp: 50,
            vault_b_hp: 50,
            current_round: 1,
            status: MatchStatus::Active,
        });

        let mut i: u8 = 0;
        while i < 3 {
            world.write_model(@NodeState {
                match_id,
                node_index: i,
                owner: NodeOwner::None,
            });
            i += 1;
        };

        let (g0, g1, g2) = random_to_modifiers(random_value);
        world.write_model(@RoundModifiers1v1 {
            match_id,
            round: 1,
            gate_0: g0,
            gate_1: g1,
            gate_2: g2,
        });

        world.emit_event(@MatchCreated1v1 {
            match_id,
            player_a,
            player_b,
        });

        match_id
    }

    #[abi(embed_v0)]
    impl Actions1v1Impl of super::IActions1v1<ContractState> {
        fn create_match_1v1(
            ref self: ContractState,
            player_a: ContractAddress,
            player_b: ContractAddress,
        ) -> u64 {
            let mut world = self.world_default();

            let config: ResourceConfig = world.read_model(0_u8);
            let vrf_addr = if config.vrf_provider.is_non_zero() {
                config.vrf_provider
            } else {
                VRF_PROVIDER_ADDRESS.try_into().unwrap()
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value = vrf.consume_random(Source::Nonce(get_contract_address()));

            setup_match(ref world, player_a, player_b, random_value)
        }

        fn create_match_1v1_delegated(
            ref self: ContractState,
            player_a: ContractAddress,
            player_b: ContractAddress,
            random_value: felt252,
        ) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
            assert(caller == world_sys_addr, 'Only world_system');

            setup_match(ref world, player_a, player_b, random_value)
        }

        fn get_budget_1v1(self: @ContractState, match_id: u64, is_player_a: bool) -> u8 {
            let world = self.world_default();
            let target = if is_player_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
            let mut bonus: u8 = 0;
            let mut i: u8 = 0;
            while i < 3 {
                let node: NodeState = world.read_model((match_id, i));
                if node.owner == target {
                    bonus += 1;
                }
                i += 1;
            };
            10 + bonus
        }

        fn set_resource_config(
            ref self: ContractState,
            iron: ContractAddress, linen: ContractAddress,
            stone: ContractAddress, wood: ContractAddress,
            ember: ContractAddress, seeds: ContractAddress,
        ) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            // Preserve an already-set ability_token so this method stays single-purpose
            let existing: ResourceConfig = world.read_model(0_u8);
            world.write_model(@ResourceConfig {
                id: 0,
                iron, linen, stone, wood, ember, seeds,
                ability_token: existing.ability_token,
                vrf_provider: existing.vrf_provider,
            });
        }

        fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let mut config: ResourceConfig = world.read_model(0_u8);
            config.ability_token = ability_token;
            world.write_model(@config);
        }

        fn set_vrf_provider(ref self: ContractState, vrf_provider: ContractAddress) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let mut config: ResourceConfig = world.read_model(0_u8);
            config.vrf_provider = vrf_provider;
            world.write_model(@config);
        }
    }
}
