use starknet::ContractAddress;

#[starknet::interface]
pub trait IWorldSystem<T> {
    fn initialize_world(
        ref self: T,
        tile_shapes: Array<u8>,
        sector_ids: Array<u8>,
        zones: Array<u8>,
        adj_tile_ids: Array<u32>,
    );
    fn expand_world(
        ref self: T,
        tile_shapes: Array<u8>,
        sector_ids: Array<u8>,
        zones: Array<u8>,
        adj_tile_ids: Array<u32>,
    );
    fn register_player(ref self: T, home_types: Array<u8>);
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
    fn create_staked_match(ref self: T, opponent: ContractAddress, abilities: Array<u8>) -> u64;
    fn join_staked_match(ref self: T, match_id: u64, abilities: Array<u8>);
    fn settle_match(ref self: T, match_id: u64);
    fn claim_parcel(ref self: T, match_id: u64, parcel_id: u32, parcel_type: u8);
    fn claim_drip(ref self: T);
    fn upgrade_kingdom(ref self: T);
    fn initiate_pillage(ref self: T, match_id: u64, home_parcel_id: u32);
    fn claim_pillage_drip(ref self: T, home_parcel_id: u32);
    fn create_faction(ref self: T, name: felt252, tag: felt252) -> u32;
    fn invite_member(ref self: T, target: ContractAddress);
    fn accept_invite(ref self: T, faction_id: u32);
    fn leave_faction(ref self: T);
    fn kick_member(ref self: T, target: ContractAddress);
    fn set_faction_reinforcement(ref self: T, enabled: bool);
    fn set_cosmetic(ref self: T, cosmetic_type: felt252, circuit_key: felt252);
}

pub fn tier_ability_slots(tier: u8) -> u8 {
    match tier {
        0 => 1,
        1 => 2,
        2 => 3,
        3 => 3,
        _ => 1,
    }
}

pub fn tier_wins_required(tier: u8) -> u32 {
    match tier {
        1 => 10,
        2 => 30,
        3 => 60,
        _ => 0,
    }
}

pub fn tier_preset_count(tier: u8) -> u8 {
    match tier {
        0 => 1,  // Polis
        1 => 2,  // Strategos
        2 => 3,  // Hegemonia
        3 => 4,  // Basileia
        _ => 1,
    }
}

pub fn calculate_bracket(total_wins: u32, total_losses: u32) -> u8 {
    let total = total_wins + total_losses;
    if total < 10 {
        return 0;
    }
    let win_rate_pct = (total_wins * 100) / total;
    if total >= 100 && win_rate_pct > 55 {
        return 4;
    }
    if total >= 60 && win_rate_pct > 50 {
        return 3;
    }
    if total >= 30 && win_rate_pct > 40 {
        return 2;
    }
    1
}

#[starknet::interface]
pub trait IResourceTokenBurn<T> {
    fn burn(ref self: T, from: starknet::ContractAddress, amount: u256);
}

pub fn burn_upgrade_resources(token_addr: starknet::ContractAddress, from: starknet::ContractAddress, amount: u256) {
    let token = IResourceTokenBurnDispatcher { contract_address: token_addr };
    token.burn(from, amount);
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
    use siege_dojo::models::match_abilities_1v1::MatchAbilities1v1;
    use siege_dojo::models::player_reputation::PlayerReputation;
    use siege_dojo::models::match_record::MatchRecord;
    use siege_dojo::models::pillage_eligibility::PillageEligibility;
    use siege_dojo::models::pillage::Pillage;
    use siege_dojo::models::faction::{Faction, FactionCounter};
    use siege_dojo::models::faction_member::FactionMember;
    use siege_dojo::models::faction_invite::FactionInvite;
    use siege_dojo::models::player_cosmetics::PlayerCosmetics;
    use siege_dojo::models::tile_adjacency::TileAdjacency;
    use siege_dojo::utils::tile_graph;
    use siege_dojo::models::fold_event::FoldEvent;
    use siege_dojo::models::sector_environment::SectorEnvironment;

    const DRIP_INTERVAL: u64 = 3600; // 1 hour in seconds
    const PILLAGE_WINDOW: u64 = 86400; // 24 hours in seconds

    const FOLD_THRESHOLD_NONE: u8 = 90;   // 0-89 = nothing (90% chance)
    const FOLD_THRESHOLD_SECTOR: u8 = 97; // 90-96 = sector fold (7% chance)
    // 97-99 = world fold toggle (3% chance)

    #[starknet::interface]
    trait IVrfProvider<T> {
        fn consume_random(ref self: T, source: Source) -> felt252;
    }

    #[derive(Drop, Copy, Clone, Serde)]
    enum Source {
        Nonce: ContractAddress,
        Salt: felt252,
    }

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

    // Resource token mint interface
    #[starknet::interface]
    trait IResourceMint<T> {
        fn mint(ref self: T, to: starknet::ContractAddress, amount: u256);
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
            tile_shapes: Array<u8>,
            sector_ids: Array<u8>,
            zones: Array<u8>,
            adj_tile_ids: Array<u32>,
        ) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let config: WorldConfig = world.read_model(0_u8);
            assert(!config.initialized, 'Already initialized');

            let n = tile_shapes.len();
            assert(sector_ids.len() == n, 'sector_ids length mismatch');
            assert(zones.len() == n, 'zones length mismatch');
            assert(adj_tile_ids.len() % 3 == 0, 'adj_tile_ids must be triples');

            let mut i: u32 = 0;
            while i < n {
                world.write_model(@Parcel {
                    tile_id: i,
                    sector_id: *sector_ids.at(i),
                    tile_shape: *tile_shapes.at(i),
                    zone: *zones.at(i),
                    parcel_type: 255,
                    owner: 0.try_into().unwrap(),
                    is_home: false,
                    is_stranded: false,
                });
                i += 1;
            };

            let adj_count = adj_tile_ids.len() / 3;
            let mut j: u32 = 0;
            while j < adj_count {
                let base = j * 3;
                world.write_model(@TileAdjacency {
                    tile_id: *adj_tile_ids.at(base),
                    edge_index: (*adj_tile_ids.at(base + 1)).try_into().unwrap(),
                    neighbor_tile_id: *adj_tile_ids.at(base + 2),
                });
                j += 1;
            };

            world.write_model(@WorldConfig {
                id: 0,
                total_parcels: n,
                next_parcel_id: n,
                initialized: true,
                is_world_folded: false,
                fold_epoch: 0,
                total_folds: 0,
            });
        }

        fn expand_world(
            ref self: ContractState,
            tile_shapes: Array<u8>,
            sector_ids: Array<u8>,
            zones: Array<u8>,
            adj_tile_ids: Array<u32>,
        ) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let mut config: WorldConfig = world.read_model(0_u8);
            assert(config.initialized, 'World not initialized');

            let n = tile_shapes.len();
            assert(sector_ids.len() == n, 'sector_ids length mismatch');
            assert(zones.len() == n, 'zones length mismatch');
            assert(adj_tile_ids.len() % 3 == 0, 'adj_tile_ids must be triples');

            let start_id = config.next_parcel_id;
            let mut i: u32 = 0;
            while i < n {
                let tid = start_id + i;
                world.write_model(@Parcel {
                    tile_id: tid,
                    sector_id: *sector_ids.at(i),
                    tile_shape: *tile_shapes.at(i),
                    zone: *zones.at(i),
                    parcel_type: 255,
                    owner: 0.try_into().unwrap(),
                    is_home: false,
                    is_stranded: false,
                });
                i += 1;
            };

            let adj_count = adj_tile_ids.len() / 3;
            let mut j: u32 = 0;
            while j < adj_count {
                let base = j * 3;
                world.write_model(@TileAdjacency {
                    tile_id: *adj_tile_ids.at(base),
                    edge_index: (*adj_tile_ids.at(base + 1)).try_into().unwrap(),
                    neighbor_tile_id: *adj_tile_ids.at(base + 2),
                });
                j += 1;
            };

            config.total_parcels += n;
            config.next_parcel_id = start_id + n;
            world.write_model(@config);
        }

        fn register_player(ref self: ContractState, home_types: Array<u8>) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(!kingdom.registered, 'Already registered');
            assert(home_types.len() == 3, 'Must choose 3 home types');

            let config: WorldConfig = world.read_model(0_u8);
            assert(config.initialized, 'World not initialized');
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            // Find the sector with the most unclaimed frontier tiles
            let mut sector_counts: Array<u32> = array![0, 0, 0, 0, 0, 0, 0, 0];
            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.owner == zero_addr && parcel.zone == 2 {
                    let sid: u32 = parcel.sector_id.into();
                    let mut new_counts: Array<u32> = ArrayTrait::new();
                    let mut s: u32 = 0;
                    while s < 8 {
                        if s == sid {
                            new_counts.append(*sector_counts.at(s) + 1);
                        } else {
                            new_counts.append(*sector_counts.at(s));
                        }
                        s += 1;
                    };
                    sector_counts = new_counts;
                }
                p += 1;
            };

            let mut best_sector: u8 = 0;
            let mut best_count: u32 = 0;
            let mut s: u32 = 0;
            while s < 8 {
                if *sector_counts.at(s) > best_count {
                    best_count = *sector_counts.at(s);
                    best_sector = s.try_into().unwrap();
                }
                s += 1;
            };
            assert(best_count >= 3, 'Not enough frontier tiles');

            // Pick 3 unclaimed frontier tiles in that sector
            let mut home_ids: Array<u32> = ArrayTrait::new();
            let mut type_idx: u32 = 0;
            while type_idx < 3 {
                let wanted_type = *home_types.at(type_idx);
                assert(wanted_type <= 2, 'Invalid parcel type');

                let mut found = false;
                let mut p2: u32 = 0;
                while p2 < config.total_parcels {
                    if !found {
                        let parcel: Parcel = world.read_model(p2);
                        if parcel.owner == zero_addr && parcel.zone == 2
                            && parcel.sector_id == best_sector {
                            let mut already_used = false;
                            let mut j: u32 = 0;
                            while j < home_ids.len() {
                                if *home_ids.at(j) == p2 {
                                    already_used = true;
                                }
                                j += 1;
                            };
                            if !already_used {
                                home_ids.append(p2);
                                found = true;
                            }
                        }
                    }
                    p2 += 1;
                };
                assert(found, 'No tile available');
                type_idx += 1;
            };

            let h0 = *home_ids.at(0);
            let h1 = *home_ids.at(1);
            let h2 = *home_ids.at(2);

            let mut i: u32 = 0;
            while i < 3 {
                let pid = *home_ids.at(i);
                let mut parcel: Parcel = world.read_model(pid);
                parcel.owner = caller;
                parcel.is_home = true;
                parcel.parcel_type = *home_types.at(i);
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
                tier: 0,
                total_wins: 0,
                faction_reinforcement_enabled: false,
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
            let max_slots: u32 = super::tier_ability_slots(kingdom.tier).into();
            assert(count <= max_slots, 'Too many abilities for tier');

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
                assert(ability_id >= 1 && ability_id <= 10, 'Invalid ability ID');
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
                staked: true,
                settled: false,
                parcel_claimed: false,
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
            let max_slots: u32 = super::tier_ability_slots(kingdom.tier).into();
            assert(b_count <= max_slots, 'Too many abilities for tier');

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
                assert(ability_id >= 1 && ability_id <= 10, 'Invalid ability ID');
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

            // Wire abilities for battle activation (Phase 2B)
            world.write_model(@MatchAbilities1v1 {
                match_id,
                a_ability_1: stakes.a_stake_1,
                a_ability_2: stakes.a_stake_2,
                a_ability_3: stakes.a_stake_3,
                b_ability_1: stakes.b_stake_1,
                b_ability_2: stakes.b_stake_2,
                b_ability_3: stakes.b_stake_3,
                a_used_1: false,
                a_used_2: false,
                a_used_3: false,
                b_used_1: false,
                b_used_2: false,
                b_used_3: false,
            });

            // Activate the match
            let mut state_mut: MatchState1v1 = world.read_model(match_id);
            state_mut.status = MatchStatus::Active;
            world.write_model(@state_mut);
        }

        fn settle_match(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');
            assert(
                caller == state.player_a || caller == state.player_b,
                'Not a match participant',
            );

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(stakes.staked, 'Not a staked match');
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

                let mut winner_kingdom: PlayerKingdom = world.read_model(winner);
                winner_kingdom.total_wins += 1;
                world.write_model(@winner_kingdom);

                // Update reputation
                let mut rep_winner: PlayerReputation = world.read_model(winner);
                let mut rep_loser: PlayerReputation = world.read_model(loser);

                // Loser stats
                rep_loser.total_losses += 1;
                if rep_loser.current_streak < 0 {
                    rep_loser.current_streak -= 1;
                } else {
                    rep_loser.current_streak = -1;
                }

                // Winner stats
                if rep_winner.current_streak > 0 {
                    rep_winner.current_streak += 1;
                } else {
                    rep_winner.current_streak = 1;
                }
                let streak_u32: u32 = rep_winner.current_streak.try_into().unwrap();
                if streak_u32 > rep_winner.best_streak {
                    rep_winner.best_streak = streak_u32;
                }

                // Recalculate brackets
                rep_winner.bracket = super::calculate_bracket(winner_kingdom.total_wins, rep_winner.total_losses);
                let loser_kingdom: PlayerKingdom = world.read_model(loser);
                rep_loser.bracket = super::calculate_bracket(loser_kingdom.total_wins, rep_loser.total_losses);

                world.write_model(@rep_winner);
                world.write_model(@rep_loser);

                // Update match records (bidirectional)
                let mut record_wl: MatchRecord = world.read_model((winner, loser));
                record_wl.wins += 1;
                record_wl.last_match_id = match_id;
                world.write_model(@record_wl);

                let mut record_lw: MatchRecord = world.read_model((loser, winner));
                record_lw.losses += 1;
                record_lw.last_match_id = match_id;
                world.write_model(@record_lw);

                // Grant pillage eligibility if the winner borders any of the loser's home parcels
                if self.has_adjacent_to_any_home(winner, loser) {
                    let now = get_block_timestamp();
                    world.write_model(@PillageEligibility {
                        winner,
                        match_id,
                        loser,
                        granted_at: now,
                        expires_at: now + PILLAGE_WINDOW,
                        used: false,
                    });
                }

                // If the winner is currently being pillaged by the loser, break those pillages
                let winner_kingdom_read: PlayerKingdom = world.read_model(winner);
                let winner_homes: Array<u32> = array![
                    winner_kingdom_read.home_0,
                    winner_kingdom_read.home_1,
                    winner_kingdom_read.home_2,
                ];
                let mut pi: u32 = 0;
                while pi < 3 {
                    let home_id = *winner_homes.at(pi);
                    let mut existing: Pillage = world.read_model(home_id);
                    if existing.active && existing.pillager == loser {
                        existing.active = false;
                        world.write_model(@existing);
                    }
                    pi += 1;
                };
            }

            // Mint resources for all parcels owned by each player
            if rc.iron.is_non_zero() {
                let world_config: WorldConfig = world.read_model(0_u8);
                let mut p: u32 = 0;
                while p < world_config.total_parcels {
                    let parcel: Parcel = world.read_model(p);
                    if parcel.owner == state.player_a {
                        self.mint_parcel_resources(@rc, parcel.parcel_type, state.player_a, 1_u256);
                    } else if parcel.owner == state.player_b {
                        self.mint_parcel_resources(@rc, parcel.parcel_type, state.player_b, 1_u256);
                    }
                    p += 1;
                };
            }

            world.write_model(@stakes);

            // Fold probability check via VRF
            let vrf = IVrfProviderDispatcher {
                contract_address: 0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f
                    .try_into()
                    .unwrap(),
            };
            let random: felt252 = vrf.consume_random(Source::Nonce(get_caller_address()));
            let roll: u8 = (Into::<felt252, u256>::into(random) % 100).try_into().unwrap();

            if roll >= FOLD_THRESHOLD_NONE {
                if roll < FOLD_THRESHOLD_SECTOR {
                    // Sector fold — axis from random bits
                    let axis: u8 = ((Into::<felt252, u256>::into(random) / 100) % 4)
                        .try_into()
                        .unwrap();
                    self.execute_sector_fold(axis, match_id);
                } else {
                    // World fold toggle
                    self.toggle_world_fold(match_id);
                }
            }
        }

        fn claim_parcel(ref self: ContractState, match_id: u64, parcel_id: u32, parcel_type: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(parcel_type <= 2, 'Invalid parcel type');

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            let mut stakes: MatchStakes1v1 = world.read_model(match_id);
            assert(stakes.settled, 'Not settled yet');
            assert(!stakes.parcel_claimed, 'Parcel already claimed');

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
                self.is_adjacent_to_territory(caller, parcel_id),
                'Not adjacent to territory',
            );

            let mut claim = parcel;
            claim.owner = caller;
            claim.parcel_type = parcel_type;
            world.write_model(@claim);

            let mut kingdom: PlayerKingdom = world.read_model(caller);
            kingdom.parcel_count += 1;
            world.write_model(@kingdom);

            stakes.parcel_claimed = true;
            world.write_model(@stakes);
        }

        fn claim_drip(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let mut kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let now = get_block_timestamp();
            let elapsed = now - kingdom.last_drip_time;
            let intervals: u64 = elapsed / DRIP_INTERVAL;
            if intervals == 0 {
                return;
            }

            let rc: ResourceConfig = world.read_model(0_u8);
            let amount: u256 = intervals.into();

            // Mint for each home parcel based on its type, skipping actively pillaged and stranded ones
            let home_parcels: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
            let mut i: u32 = 0;
            while i < 3 {
                let home_id = *home_parcels.at(i);
                let pillage: Pillage = world.read_model(home_id);
                let is_pillaged = pillage.active && pillage.expires_at > now;
                if !is_pillaged {
                    let parcel: Parcel = world.read_model(home_id);
                    if !parcel.is_stranded {
                        let zone_mult: u256 = match parcel.zone {
                            0 => 3, // core
                            1 => 2, // mid
                            _ => 1, // frontier
                        };
                        let drip_amount: u256 = amount * zone_mult;
                        self.mint_parcel_resources(@rc, parcel.parcel_type, caller, drip_amount);
                    }
                }
                i += 1;
            };

            kingdom.last_drip_time = kingdom.last_drip_time + (intervals * DRIP_INTERVAL);
            world.write_model(@kingdom);
        }

        fn initiate_pillage(ref self: ContractState, match_id: u64, home_parcel_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Read eligibility
            let mut eligibility: PillageEligibility = world.read_model((caller, match_id));
            let now = get_block_timestamp();
            assert(eligibility.expires_at > now, 'Eligibility expired');
            assert(!eligibility.used, 'Eligibility already used');
            assert(eligibility.granted_at > 0, 'No eligibility');

            // Verify the target home parcel belongs to the loser and is a home parcel
            let parcel: Parcel = world.read_model(home_parcel_id);
            assert(parcel.owner == eligibility.loser, 'Not loser home parcel');
            assert(parcel.is_home, 'Not a home parcel');

            // Verify caller still has adjacency to THIS specific home parcel
            assert(
                self.is_adjacent_to_territory(caller, home_parcel_id),
                'No adjacency to parcel',
            );

            // Faction pillage protection — if any faction ally borders the target home parcel, block
            let target_member: FactionMember = world.read_model(parcel.owner);
            if target_member.faction_id != 0 {
                let neighbors = tile_graph::get_neighbors(@world, home_parcel_id);
                let mut ni: u32 = 0;
                let mut protected = false;
                while ni < neighbors.len() {
                    if !protected {
                        let nid = *neighbors.at(ni);
                        let ally_parcel: Parcel = world.read_model(nid);
                        if ally_parcel.owner.is_non_zero() && ally_parcel.owner != parcel.owner {
                            let ally_member: FactionMember = world.read_model(ally_parcel.owner);
                            if ally_member.faction_id == target_member.faction_id {
                                protected = true;
                            }
                        }
                    }
                    ni += 1;
                };
                assert(!protected, 'Home protected by ally');
            }

            // Assert no active pillage on this home parcel
            let existing: Pillage = world.read_model(home_parcel_id);
            assert(!existing.active, 'Already being pillaged');

            // Create the pillage
            world.write_model(@Pillage {
                home_parcel_id,
                pillager: caller,
                target: eligibility.loser,
                start_time: now,
                expires_at: now + PILLAGE_WINDOW,
                last_claim_time: now,
                active: true,
            });

            // Mark eligibility as used
            eligibility.used = true;
            world.write_model(@eligibility);
        }

        fn claim_pillage_drip(ref self: ContractState, home_parcel_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut pillage: Pillage = world.read_model(home_parcel_id);
            assert(pillage.active, 'Pillage not active');
            assert(pillage.pillager == caller, 'Not the pillager');

            let now = get_block_timestamp();

            // Lazy adjacency check
            let parcel: Parcel = world.read_model(home_parcel_id);
            if !self.is_adjacent_to_territory(caller, home_parcel_id) {
                pillage.active = false;
                world.write_model(@pillage);
                return;
            }

            // Cap end time at expires_at
            let end_time = if now > pillage.expires_at { pillage.expires_at } else { now };

            // Calculate intervals
            let elapsed = if end_time > pillage.last_claim_time {
                end_time - pillage.last_claim_time
            } else {
                0
            };
            let intervals: u64 = elapsed / DRIP_INTERVAL;

            if intervals > 0 {
                let rc: ResourceConfig = world.read_model(0_u8);
                if rc.iron.is_non_zero() {
                    self.mint_parcel_resources(@rc, parcel.parcel_type, caller, intervals.into());
                }
                pillage.last_claim_time = pillage.last_claim_time + (intervals * DRIP_INTERVAL);
            }

            // Natural expiration
            if now >= pillage.expires_at {
                pillage.active = false;
            }

            world.write_model(@pillage);
        }

        fn upgrade_kingdom(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let mut kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let current = kingdom.tier;
            let next = current + 1;
            assert(next <= 3, 'Already max tier');

            // Check win requirement
            let wins_needed = super::tier_wins_required(next);
            assert(kingdom.total_wins >= wins_needed, 'Not enough wins');

            // Burn resources based on target tier
            let rc: ResourceConfig = world.read_model(0_u8);
            if next == 1 {
                // Strategos: 20 Iron + 20 Stone + 10 Wood
                super::burn_upgrade_resources(rc.iron, caller, 20);
                super::burn_upgrade_resources(rc.stone, caller, 20);
                super::burn_upgrade_resources(rc.wood, caller, 10);
            } else if next == 2 {
                // Hegemonia: 50 Iron + 50 Stone + 30 Wood + 20 Ember
                super::burn_upgrade_resources(rc.iron, caller, 50);
                super::burn_upgrade_resources(rc.stone, caller, 50);
                super::burn_upgrade_resources(rc.wood, caller, 30);
                super::burn_upgrade_resources(rc.ember, caller, 20);
            } else {
                // Basileia: 100 Iron + 100 Stone + 60 Wood + 40 Ember + 20 Seeds
                super::burn_upgrade_resources(rc.iron, caller, 100);
                super::burn_upgrade_resources(rc.stone, caller, 100);
                super::burn_upgrade_resources(rc.wood, caller, 60);
                super::burn_upgrade_resources(rc.ember, caller, 40);
                super::burn_upgrade_resources(rc.seeds, caller, 20);
            }

            kingdom.tier = next;
            world.write_model(@kingdom);
        }

        fn create_faction(ref self: ContractState, name: felt252, tag: felt252) -> u32 {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');
            assert(kingdom.tier >= 1, 'Strategos tier required');

            let existing: FactionMember = world.read_model(caller);
            assert(existing.faction_id == 0, 'Already in a faction');

            // Burn formation cost: 30 Iron + 30 Stone + 20 Wood
            let rc: ResourceConfig = world.read_model(0_u8);
            super::burn_upgrade_resources(rc.iron, caller, 30);
            super::burn_upgrade_resources(rc.stone, caller, 30);
            super::burn_upgrade_resources(rc.wood, caller, 20);

            // Allocate new faction ID
            let mut counter: FactionCounter = world.read_model(0_u8);
            counter.count += 1;
            let new_id = counter.count;
            world.write_model(@counter);

            let now = get_block_timestamp();

            world.write_model(@Faction {
                faction_id: new_id,
                leader: caller,
                name,
                tag,
                member_count: 1,
                created_at: now,
                dissolved: false,
            });

            world.write_model(@FactionMember {
                player: caller,
                faction_id: new_id,
                joined_at: now,
                last_leave_time: 0,
            });

            new_id
        }

        fn invite_member(ref self: ContractState, target: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let caller_member: FactionMember = world.read_model(caller);
            assert(caller_member.faction_id != 0, 'Not in a faction');

            let faction: Faction = world.read_model(caller_member.faction_id);
            assert(caller == faction.leader, 'Not the leader');
            assert(!faction.dissolved, 'Faction dissolved');
            assert(target != caller, 'Cannot invite self');

            let target_kingdom: PlayerKingdom = world.read_model(target);
            assert(target_kingdom.registered, 'Target not registered');

            world.write_model(@FactionInvite {
                target,
                faction_id: caller_member.faction_id,
                invited_by: caller,
                invited_at: get_block_timestamp(),
                used: false,
            });
        }

        fn accept_invite(ref self: ContractState, faction_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(faction_id > 0, 'Invalid faction id');

            let mut invite: FactionInvite = world.read_model((caller, faction_id));
            let zero_addr: ContractAddress = 0.try_into().unwrap();
            assert(invite.invited_by != zero_addr, 'No invite');
            assert(!invite.used, 'Invite already used');

            let mut caller_member: FactionMember = world.read_model(caller);
            assert(caller_member.faction_id == 0, 'Already in a faction');

            let now = get_block_timestamp();
            if caller_member.last_leave_time > 0 {
                assert(now >= caller_member.last_leave_time + 86400, 'Leave cooldown active');
            }

            let mut faction: Faction = world.read_model(faction_id);
            assert(!faction.dissolved, 'Faction dissolved');

            caller_member.faction_id = faction_id;
            caller_member.joined_at = now;
            world.write_model(@caller_member);

            faction.member_count += 1;
            world.write_model(@faction);

            invite.used = true;
            world.write_model(@invite);
        }

        fn leave_faction(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut member: FactionMember = world.read_model(caller);
            assert(member.faction_id != 0, 'Not in a faction');

            let mut faction: Faction = world.read_model(member.faction_id);
            assert(!faction.dissolved, 'Already dissolved');

            if caller == faction.leader {
                faction.dissolved = true;
            }

            if faction.member_count > 0 {
                faction.member_count -= 1;
            }
            world.write_model(@faction);

            member.faction_id = 0;
            member.last_leave_time = get_block_timestamp();
            world.write_model(@member);
        }

        fn kick_member(ref self: ContractState, target: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let caller_member: FactionMember = world.read_model(caller);
            assert(caller_member.faction_id != 0, 'Not in a faction');

            let mut faction: Faction = world.read_model(caller_member.faction_id);
            assert(caller == faction.leader, 'Not the leader');

            let mut target_member: FactionMember = world.read_model(target);
            assert(target_member.faction_id == caller_member.faction_id, 'Target not in faction');
            assert(target != caller, 'Cannot kick self');

            target_member.faction_id = 0;
            target_member.last_leave_time = get_block_timestamp();
            world.write_model(@target_member);

            if faction.member_count > 0 {
                faction.member_count -= 1;
            }
            world.write_model(@faction);
        }

        fn set_faction_reinforcement(ref self: ContractState, enabled: bool) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let mut kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');
            kingdom.faction_reinforcement_enabled = enabled;
            world.write_model(@kingdom);
        }

        fn set_cosmetic(ref self: ContractState, cosmetic_type: felt252, circuit_key: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let mut cosmetics: PlayerCosmetics = world.read_model(caller);
            cosmetics.player = caller;

            if cosmetic_type == 'banner' {
                cosmetics.banner = circuit_key;
            } else if cosmetic_type == 'parcel_skin' {
                cosmetics.parcel_skin = circuit_key;
            } else if cosmetic_type == 'hold_decoration' {
                cosmetics.hold_decoration = circuit_key;
            } else {
                panic!("Invalid cosmetic type");
            }

            world.write_model(@cosmetics);
        }
    }

    #[generate_trait]
    impl SettlementHelpers of SettlementHelpersTrait {
        fn mint_parcel_resources(
            self: @ContractState,
            rc: @ResourceConfig,
            parcel_type: u8,
            to: ContractAddress,
            amount: u256,
        ) {
            // Skip untyped parcels (sentinel 255)
            if parcel_type == 255 {
                return;
            }

            let (token_a_addr, token_b_addr) = if parcel_type == 0 {
                (*rc.iron, *rc.linen)     // Forge
            } else if parcel_type == 1 {
                (*rc.stone, *rc.wood)     // Quarry
            } else {
                (*rc.ember, *rc.seeds)    // Grove
            };

            if token_a_addr.is_non_zero() {
                IResourceMintDispatcher { contract_address: token_a_addr }.mint(to, amount);
                IResourceMintDispatcher { contract_address: token_b_addr }.mint(to, amount);
            }
        }

        /// Release the most recently claimed non-home parcel (highest tile_id among owned non-homes).
        /// If the player only has home parcels, no parcel is released.
        fn release_furthest_parcel(ref self: ContractState, player: ContractAddress) {
            let mut world = self.world_default();
            let mut kingdom: PlayerKingdom = world.read_model(player);
            let config: WorldConfig = world.read_model(0_u8);
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            let mut highest_id: u32 = 0;
            let mut found = false;

            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.owner == player && !parcel.is_home {
                    if !found || p > highest_id {
                        highest_id = p;
                        found = true;
                    }
                }
                p += 1;
            };

            if found {
                let mut parcel: Parcel = world.read_model(highest_id);
                parcel.owner = zero_addr;
                world.write_model(@parcel);
                kingdom.parcel_count -= 1;
                world.write_model(@kingdom);
            }
        }

        fn is_adjacent_to_territory(
            self: @ContractState, player: ContractAddress, target_tile_id: u32,
        ) -> bool {
            let world = self.world_default();
            let neighbors = tile_graph::get_neighbors(@world, target_tile_id);
            let mut i: u32 = 0;
            let mut adjacent = false;
            while i < neighbors.len() {
                if !adjacent {
                    let neighbor_id = *neighbors.at(i);
                    let parcel: Parcel = world.read_model(neighbor_id);
                    if parcel.owner == player {
                        adjacent = true;
                    }
                }
                i += 1;
            };
            adjacent
        }

        fn has_adjacent_to_any_home(
            self: @ContractState, pillager: ContractAddress, target: ContractAddress,
        ) -> bool {
            let world = self.world_default();
            let kingdom: PlayerKingdom = world.read_model(target);
            if !kingdom.registered {
                return false;
            }

            let home_ids: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
            let mut i: u32 = 0;
            let mut found = false;
            while i < 3 {
                if !found {
                    let home_id = *home_ids.at(i);
                    if self.is_adjacent_to_territory(pillager, home_id) {
                        found = true;
                    }
                }
                i += 1;
            };
            found
        }

        fn toggle_world_fold(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();
            let mut config: WorldConfig = world.read_model(0_u8);
            config.is_world_folded = !config.is_world_folded;
            config.fold_epoch += 1;
            config.total_folds += 1;
            world.write_model(@config);

            world.write_model(@FoldEvent {
                fold_id: config.total_folds,
                fold_type: 1,
                axis: 0,
                trigger_match: match_id,
                timestamp: get_block_timestamp(),
            });
        }

        fn execute_sector_fold(ref self: ContractState, axis: u8, match_id: u64) {
            let mut world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);

            let sector_a1 = axis * 2;
            let sector_a2 = axis * 2 + 1;
            let sector_b1 = (axis * 2 + 4) % 8;
            let sector_b2 = (axis * 2 + 5) % 8;

            let mut p: u32 = 0;
            while p < config.total_parcels {
                let mut parcel: Parcel = world.read_model(p);
                if parcel.sector_id == sector_a1 {
                    let mut e: u8 = 0;
                    while e < 4 {
                        let adj: TileAdjacency = world.read_model((p, e));
                        if adj.neighbor_tile_id != 0xFFFFFFFF && adj.neighbor_tile_id != 0 {
                            let neighbor: Parcel = world.read_model(adj.neighbor_tile_id);
                            if neighbor.sector_id == sector_b1 {
                                parcel.sector_id = sector_b2;
                                world.write_model(@parcel);
                            }
                        }
                        e += 1;
                    };
                } else if parcel.sector_id == sector_b1 {
                    let mut e: u8 = 0;
                    while e < 4 {
                        let adj: TileAdjacency = world.read_model((p, e));
                        if adj.neighbor_tile_id != 0xFFFFFFFF && adj.neighbor_tile_id != 0 {
                            let neighbor: Parcel = world.read_model(adj.neighbor_tile_id);
                            if neighbor.sector_id == sector_a1 {
                                parcel.sector_id = sector_a2;
                                world.write_model(@parcel);
                            }
                        }
                        e += 1;
                    };
                }
                p += 1;
            };

            let mut cfg: WorldConfig = world.read_model(0_u8);
            cfg.total_folds += 1;
            world.write_model(@cfg);

            world.write_model(@FoldEvent {
                fold_id: cfg.total_folds,
                fold_type: 0,
                axis,
                trigger_match: match_id,
                timestamp: get_block_timestamp(),
            });

            self.break_pillages_on_fold();
            self.recompute_stranded_after_fold();
        }

        fn break_pillages_on_fold(ref self: ContractState) {
            let mut world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);

            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.is_home {
                    let mut pillage: Pillage = world.read_model(p);
                    if pillage.active {
                        if !self.is_adjacent_to_territory(pillage.pillager, p) {
                            pillage.active = false;
                            world.write_model(@pillage);
                        }
                    }
                }
                p += 1;
            };
        }

        fn recompute_stranded_after_fold(ref self: ContractState) {
            let mut world = self.world_default();
            let config: WorldConfig = world.read_model(0_u8);
            let zero_addr: ContractAddress = 0.try_into().unwrap();

            // Collect all unique owners
            let mut owners: Array<ContractAddress> = ArrayTrait::new();
            let mut p: u32 = 0;
            while p < config.total_parcels {
                let parcel: Parcel = world.read_model(p);
                if parcel.owner != zero_addr {
                    let mut already = false;
                    let mut o: u32 = 0;
                    while o < owners.len() {
                        if *owners.at(o) == parcel.owner { already = true; }
                        o += 1;
                    };
                    if !already { owners.append(parcel.owner); }
                }
                p += 1;
            };

            // For each owner: BFS from homes, mark unreached tiles as stranded
            let mut oi: u32 = 0;
            while oi < owners.len() {
                let owner = *owners.at(oi);
                let kingdom: PlayerKingdom = world.read_model(owner);
                if kingdom.registered {
                    let member: FactionMember = world.read_model(owner);

                    // BFS queue: start from homes
                    let mut visited: Array<u32> = ArrayTrait::new();
                    let mut queue: Array<u32> = ArrayTrait::new();
                    queue.append(kingdom.home_0);
                    queue.append(kingdom.home_1);
                    queue.append(kingdom.home_2);
                    visited.append(kingdom.home_0);
                    visited.append(kingdom.home_1);
                    visited.append(kingdom.home_2);

                    let mut qi: u32 = 0;
                    while qi < queue.len() {
                        let current = *queue.at(qi);
                        let neighbors = tile_graph::get_neighbors(@world, current);
                        let mut ni: u32 = 0;
                        while ni < neighbors.len() {
                            let nid = *neighbors.at(ni);
                            let mut already_visited = false;
                            let mut vi: u32 = 0;
                            while vi < visited.len() {
                                if *visited.at(vi) == nid { already_visited = true; }
                                vi += 1;
                            };
                            if !already_visited {
                                let np: Parcel = world.read_model(nid);
                                let is_own = np.owner == owner;
                                let is_faction_bridge = if member.faction_id != 0 {
                                    let nm: FactionMember = world.read_model(np.owner);
                                    nm.faction_id == member.faction_id
                                } else {
                                    false
                                };
                                if is_own || is_faction_bridge {
                                    visited.append(nid);
                                    queue.append(nid);
                                }
                            }
                            ni += 1;
                        };
                        qi += 1;
                    };

                    // Mark tiles: owned by this player but not in visited = stranded
                    let mut p2: u32 = 0;
                    while p2 < config.total_parcels {
                        let mut parcel: Parcel = world.read_model(p2);
                        if parcel.owner == owner && !parcel.is_home {
                            let mut in_visited = false;
                            let mut vi2: u32 = 0;
                            while vi2 < visited.len() {
                                if *visited.at(vi2) == p2 { in_visited = true; }
                                vi2 += 1;
                            };
                            let was_stranded = parcel.is_stranded;
                            parcel.is_stranded = !in_visited;
                            if parcel.is_stranded != was_stranded {
                                world.write_model(@parcel);
                            }
                        }
                        p2 += 1;
                    };
                }
                oi += 1;
            };
        }
    }
}
