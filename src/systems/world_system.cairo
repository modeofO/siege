use starknet::ContractAddress;

#[starknet::interface]
pub trait IWorldSystem<T> {
    fn initialize_world(ref self: T, cols: Array<u16>, rows: Array<u16>, types: Array<u8>);
    fn register_player(ref self: T, home_types: Array<u8>);
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
}

#[dojo::contract]
pub mod world_system {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::world::IWorldDispatcherTrait;
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::tokens::ability_token::{IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    #[abi(per_item)]
    #[generate_trait]
    impl ERC1155ReceiverImpl of ERC1155ReceiverTrait {
        #[external(v0)]
        fn on_erc1155_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        ) -> felt252 {
            0x4e2312e0
        }

        #[external(v0)]
        fn on_erc1155_batch_received(
            self: @ContractState,
            operator: ContractAddress,
            from: ContractAddress,
            token_ids: Span<u256>,
            values: Span<u256>,
            data: Span<felt252>,
        ) -> felt252 {
            0x4e2312e0
        }

        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            let isrc6_id: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;
            interface_id == isrc6_id
        }
    }

    #[abi(embed_v0)]
    impl WorldSystemImpl of super::IWorldSystem<ContractState> {
        fn initialize_world(
            ref self: ContractState,
            cols: Array<u16>,
            rows: Array<u16>,
            types: Array<u8>,
        ) {
            let mut world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);
            assert(!config.initialized, 'Already initialized');
            let n = cols.len();
            assert(rows.len() == n, 'Array length mismatch');
            assert(types.len() == n, 'Array length mismatch');

            let mut i: u32 = 0;
            while i < n {
                world.write_model(@Parcel {
                    parcel_id: i,
                    col: *cols.at(i),
                    row: *rows.at(i),
                    parcel_type: *types.at(i),
                    owner: 0.try_into().unwrap(),
                    is_home: false,
                });
                i += 1;
            };

            world.write_model(@WorldConfig {
                id: 0,
                total_parcels: n,
                next_parcel_id: n,
                initialized: true,
            });
        }

        fn register_player(ref self: ContractState, home_types: Array<u8>) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(!kingdom.registered, 'Already registered');
            assert(home_types.len() == 3, 'Must choose 3 home types');

            let config: WorldConfig = world.read_model(0_u8);
            assert(config.initialized, 'World not initialized');

            let mut home_ids: Array<u32> = ArrayTrait::new();
            let mut type_idx: u32 = 0;
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            while type_idx < 3 {
                let wanted_type = *home_types.at(type_idx);
                assert(wanted_type <= 2, 'Invalid parcel type');
                let mut found = false;
                let mut p: u32 = 0;
                while p < config.total_parcels {
                    if !found {
                        let parcel: Parcel = world.read_model(p);
                        if parcel.owner == zero_addr && parcel.parcel_type == wanted_type {
                            // Check not already assigned in this registration
                            let mut already_used = false;
                            let mut j: u32 = 0;
                            while j < home_ids.len() {
                                if *home_ids.at(j) == p {
                                    already_used = true;
                                }
                                j += 1;
                            };
                            if !already_used {
                                home_ids.append(p);
                                found = true;
                            }
                        }
                    }
                    p += 1;
                };
                assert(found, 'No parcel available for type');
                type_idx += 1;
            };

            // Assign home parcels
            let h0 = *home_ids.at(0);
            let h1 = *home_ids.at(1);
            let h2 = *home_ids.at(2);

            let mut i: u32 = 0;
            while i < 3 {
                let pid = *home_ids.at(i);
                let mut parcel: Parcel = world.read_model(pid);
                parcel.owner = caller;
                parcel.is_home = true;
                world.write_model(@parcel);
                i += 1;
            };

            // Mint 3 starter abilities (IDs 1, 2, 3)
            let rc: ResourceConfig = world.read_model(0_u8);
            if rc.ability_token.is_non_zero() {
                let ability = IAbilityTokenDispatcher { contract_address: rc.ability_token };
                ability.mint(caller, 1_u256, 1_u256);
                ability.mint(caller, 2_u256, 1_u256);
                ability.mint(caller, 3_u256, 1_u256);
            }

            world.write_model(@PlayerKingdom {
                player: caller,
                home_0: h0,
                home_1: h1,
                home_2: h2,
                parcel_count: 3,
                registered: true,
                free_craft_used: false,
                last_drip_time: get_block_timestamp(),
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
    }
}
