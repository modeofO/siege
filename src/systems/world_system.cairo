use starknet::ContractAddress;

#[starknet::interface]
pub trait IWorldSystem<T> {
    fn initialize_world(ref self: T, cols: Array<u16>, rows: Array<u16>, types: Array<u8>);
    fn register_player(ref self: T, home_types: Array<u8>);
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
    fn create_staked_match(ref self: T, opponent: ContractAddress, abilities: Array<u8>) -> u64;
    fn join_staked_match(ref self: T, match_id: u64, abilities: Array<u8>);
    fn settle_match(ref self: T, match_id: u64);
    fn claim_parcel(ref self: T, match_id: u64, parcel_id: u32);
}

#[dojo::contract]
pub mod world_system {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::world::{IWorldDispatcherTrait, WorldStorageTrait};
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::tokens::ability_token::{IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use siege_dojo::systems::actions_1v1::{IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::match_stakes_1v1::MatchStakes1v1;

    // ERC-1155 dispatcher for safe_transfer_from calls
    #[starknet::interface]
    trait IERC1155<T> {
        fn safe_transfer_from(
            ref self: T,
            from: starknet::ContractAddress,
            to: starknet::ContractAddress,
            token_id: u256,
            value: u256,
            data: Span<felt252>,
        );
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
        fn is_approved_for_all(
            self: @T,
            owner: starknet::ContractAddress,
            operator: starknet::ContractAddress,
        ) -> bool;
    }

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

        fn create_staked_match(
            ref self: ContractState,
            opponent: ContractAddress,
            abilities: Array<u8>,
        ) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            // Verify abilities are valid (1-5) and count is 1-3
            let count = abilities.len();
            assert(count >= 1 && count <= 3, 'Must stake 1-3 abilities');

            // Read ability token address
            let rc: ResourceConfig = world.read_model(0_u8);
            assert(rc.ability_token.is_non_zero(), 'Ability token not set');

            // Escrow: transfer abilities from caller to this contract
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

            // Build ERC-1155 interface for safe_transfer_from
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };

            let mut i: u32 = 0;
            while i < count {
                let ability_id: u8 = *abilities.at(i);
                assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
                erc1155.safe_transfer_from(
                    caller, world_sys_addr,
                    ability_id.into(), 1_u256,
                    array![].span(),
                );
                i += 1;
            };

            // Create match via actions_1v1
            let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
            let actions = IActions1v1Dispatcher { contract_address: actions_addr };
            let match_id = actions.create_match_1v1(caller, opponent);

            // But set status to Pending (not Active) until opponent joins
            let mut state: MatchState1v1 = world.read_model(match_id);
            state.status = MatchStatus::Pending;
            world.write_model(@state);

            // Record stakes
            let a1 = if count > 0 { *abilities.at(0) } else { 0 };
            let a2 = if count > 1 { *abilities.at(1) } else { 0 };
            let a3 = if count > 2 { *abilities.at(2) } else { 0 };

            world.write_model(@MatchStakes1v1 {
                match_id,
                a_stake_1: a1, a_stake_2: a2, a_stake_3: a3,
                b_stake_1: 0, b_stake_2: 0, b_stake_3: 0,
                stake_count: 0,
                settled: false,
            });

            match_id
        }

        fn join_staked_match(ref self: ContractState, match_id: u64, abilities: Array<u8>) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Pending, 'Match not pending');
            assert(state.player_b == caller, 'Not the opponent');

            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let b_count = abilities.len();
            assert(b_count >= 1 && b_count <= 3, 'Must stake 1-3 abilities');

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);

            // Count A's stakes
            let mut a_count: u32 = 0;
            if stakes.a_stake_1 > 0 { a_count += 1; }
            if stakes.a_stake_2 > 0 { a_count += 1; }
            if stakes.a_stake_3 > 0 { a_count += 1; }

            // Matched wager
            let wager = if a_count < b_count { a_count } else { b_count };

            let rc: ResourceConfig = world.read_model(0_u8);
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

            // Escrow B's wager amount
            let mut i: u32 = 0;
            while i < wager {
                let ability_id: u8 = *abilities.at(i);
                assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
                erc1155.safe_transfer_from(
                    caller, world_sys_addr,
                    ability_id.into(), 1_u256,
                    array![].span(),
                );
                i += 1;
            };

            // Record B's stakes
            let b1 = if b_count > 0 { *abilities.at(0) } else { 0 };
            let b2 = if b_count > 1 { *abilities.at(1) } else { 0 };
            let b3 = if b_count > 2 { *abilities.at(2) } else { 0 };
            stakes.b_stake_1 = b1;
            stakes.b_stake_2 = b2;
            stakes.b_stake_3 = b3;
            stakes.stake_count = wager.try_into().unwrap();

            // Refund A's excess (abilities beyond wager count)
            if a_count > wager {
                let a_stakes: Array<u8> = array![stakes.a_stake_1, stakes.a_stake_2, stakes.a_stake_3];
                let mut j: u32 = wager;
                while j < a_count {
                    let refund_id = *a_stakes.at(j);
                    if refund_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_a,
                            refund_id.into(), 1_u256,
                            array![].span(),
                        );
                    }
                    j += 1;
                };
                // Clear refunded slots
                if wager < 3 { stakes.a_stake_3 = 0; }
                if wager < 2 { stakes.a_stake_2 = 0; }
                if wager < 1 { stakes.a_stake_1 = 0; }
            }

            world.write_model(@stakes);

            // Activate the match
            let mut state_mut: MatchState1v1 = world.read_model(match_id);
            state_mut.status = MatchStatus::Active;
            world.write_model(@state_mut);
        }

        fn settle_match(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(!stakes.settled, 'Already settled');
            stakes.settled = true;

            let rc: ResourceConfig = world.read_model(0_u8);
            let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();

            // Determine winner: team 1 = player_a, team 2 = player_b, 0 = draw
            let winner_team: u8 = if state.vault_a_hp > state.vault_b_hp {
                1
            } else if state.vault_b_hp > state.vault_a_hp {
                2
            } else {
                0
            };

            let a_stakes: Array<u8> = array![stakes.a_stake_1, stakes.a_stake_2, stakes.a_stake_3];
            let b_stakes: Array<u8> = array![stakes.b_stake_1, stakes.b_stake_2, stakes.b_stake_3];
            let wager: u32 = stakes.stake_count.into();

            if winner_team == 0 {
                // Draw: return all escrowed abilities to their owners
                let mut i: u32 = 0;
                while i < wager {
                    let a_id = *a_stakes.at(i);
                    if a_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_a,
                            a_id.into(), 1_u256, array![].span(),
                        );
                    }
                    let b_id = *b_stakes.at(i);
                    if b_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, state.player_b,
                            b_id.into(), 1_u256, array![].span(),
                        );
                    }
                    i += 1;
                };
            } else {
                let (winner, loser) = if winner_team == 1 {
                    (state.player_a, state.player_b)
                } else {
                    (state.player_b, state.player_a)
                };

                // Transfer ALL escrowed abilities to winner
                let mut i: u32 = 0;
                while i < wager {
                    let a_id = *a_stakes.at(i);
                    if a_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, winner,
                            a_id.into(), 1_u256, array![].span(),
                        );
                    }
                    let b_id = *b_stakes.at(i);
                    if b_id > 0 {
                        erc1155.safe_transfer_from(
                            world_sys_addr, winner,
                            b_id.into(), 1_u256, array![].span(),
                        );
                    }
                    i += 1;
                };

                // Loser loses their furthest-from-home parcel
                self.release_furthest_parcel(loser);
            }

            world.write_model(@stakes);
        }

        fn claim_parcel(ref self: ContractState, match_id: u64, parcel_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            let stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(stakes.settled, 'Not settled yet');

            // Verify caller is the winner
            let winner = if state.vault_a_hp > state.vault_b_hp {
                state.player_a
            } else if state.vault_b_hp > state.vault_a_hp {
                state.player_b
            } else {
                panic!("Draw: no parcel to claim")
            };
            assert(caller == winner, 'Not the winner');

            // Verify target parcel is unclaimed and adjacent to winner's territory
            let zero_addr: ContractAddress = 0.try_into().unwrap();
            let parcel: Parcel = world.read_model(parcel_id);
            assert(parcel.owner == zero_addr, 'Parcel not unclaimed');
            assert(
                self.is_adjacent_to_territory(caller, parcel.col, parcel.row),
                'Not adjacent to territory',
            );

            let mut claim = parcel;
            claim.owner = caller;
            world.write_model(@claim);

            let mut kingdom: PlayerKingdom = world.read_model(caller);
            kingdom.parcel_count += 1;
            world.write_model(@kingdom);
        }
    }

    #[generate_trait]
    impl SettlementHelpers of SettlementHelpersTrait {
        /// Find and release the loser's furthest-from-home parcel (becomes unclaimed).
        /// If the player only has home parcels, no parcel is released.
        fn release_furthest_parcel(ref self: ContractState, player: ContractAddress) {
            let mut world = self.world_default();
            let mut kingdom: PlayerKingdom = world.read_model(player);
            let config: WorldConfig = world.read_model(0_u8);

            // Get home parcel coordinates
            let h0: Parcel = world.read_model(kingdom.home_0);
            let h1: Parcel = world.read_model(kingdom.home_1);
            let h2: Parcel = world.read_model(kingdom.home_2);

            let mut max_dist: u16 = 0;
            let mut furthest_id: u32 = 0;
            let mut found = false;
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.owner == player && !parcel.is_home {
                    // Min distance to any home parcel
                    let d0 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h0.col, h0.row);
                    let d1 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h1.col, h1.row);
                    let d2 = siege_dojo::utils::hex::hex_distance(parcel.col, parcel.row, h2.col, h2.row);
                    let min_d = if d0 < d1 { if d0 < d2 { d0 } else { d2 } } else { if d1 < d2 { d1 } else { d2 } };

                    if min_d > max_dist || !found {
                        max_dist = min_d;
                        furthest_id = p;
                        found = true;
                    }
                }
                p += 1;
            };

            if found {
                let mut parcel: Parcel = world.read_model(furthest_id);
                parcel.owner = zero_addr;
                world.write_model(@parcel);
                kingdom.parcel_count -= 1;
                world.write_model(@kingdom);
            }
        }

        fn is_adjacent_to_territory(
            self: @ContractState, player: ContractAddress, col: u16, row: u16,
        ) -> bool {
            let world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);

            let mut p: u32 = 0;
            let mut adjacent = false;
            while p < config.total_parcels {
                if !adjacent {
                    let parcel: Parcel = world.read_model(p);
                    if parcel.owner == player {
                        if siege_dojo::utils::hex::is_neighbor(parcel.col, parcel.row, col, row) {
                            adjacent = true;
                        }
                    }
                }
                p += 1;
            };
            adjacent
        }
    }
}
