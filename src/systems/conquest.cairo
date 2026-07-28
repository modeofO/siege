use starknet::ContractAddress;

#[starknet::interface]
pub trait IConquest<T> {
    fn set_preset_defense(ref self: T, index: u8, p0: u8, p1: u8, p2: u8, g0: u8, g1: u8, g2: u8);
    fn initiate_conquest(
        ref self: T,
        target_parcel: u32,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        ability_id: u8, ability_target: u8,
    );
}

// ERC-1155 interface for ability ownership check
#[starknet::interface]
pub trait IERC1155<T> {
    fn balance_of(self: @T, account: ContractAddress, token_id: u256) -> u256;
    fn safe_transfer_from(
        ref self: T,
        from: ContractAddress,
        to: ContractAddress,
        token_id: u256,
        value: u256,
        data: Span<felt252>,
    );
}

pub fn ability_type_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) % 5) + 1 }
}

pub fn ability_tier_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) / 5) + 1 }
}

#[dojo::contract]
pub mod conquest {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::preset_defense::PresetDefense;
    use siege_dojo::models::faction_member::FactionMember;
    use siege_dojo::models::conquest_cooldown::ConquestCooldown;
    use siege_dojo::models::events::ConquestResolved;
    use siege_dojo::utils::hex;
    use super::{IERC1155Dispatcher, IERC1155DispatcherTrait};
    use super::{ability_type_from_token, ability_tier_from_token};

    // VRF dispatcher (same pattern as actions_1v1)
    #[starknet::interface]
    trait IVrfProvider<T> {
        fn consume_random(ref self: T, source: Source) -> felt252;
    }

    #[derive(Drop, Copy, Clone, Serde)]
    enum Source {
        Nonce: ContractAddress,
        Salt: felt252,
    }

    const DEFENDER_BUDGET: u8 = 12;
    const ATTACKER_BUDGET: u8 = 10;
    const DEFENDER_HP: u8 = 15;
    const ATTACKER_HP: u8 = 10;
    // Per-gate value of the fallback garrison a defender fights with when they
    // have no presets and no ally reinforcement. sum 12 == DEFENDER_BUDGET;
    // fixed and publicly known — not setting presets means every attacker knows
    // your defense.
    const DEFAULT_DEF_ALLOC: u8 = 2;
    // Minimum seconds between an attacker's conquest attempts. Without it a
    // home-only attacker (who forfeits nothing on a loss) can spam attacks to
    // re-roll VRF preset selection and farm territory/tier for free. Tunable.
    const CONQUEST_COOLDOWN: u64 = 3600;

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
    impl ConquestImpl of super::IConquest<ContractState> {
        fn set_preset_defense(
            ref self: ContractState,
            index: u8, p0: u8, p1: u8, p2: u8, g0: u8, g1: u8, g2: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Tier-based slot limit
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');
            let max_presets = siege_dojo::systems::world_system::tier_preset_count(kingdom.tier);
            assert(index < max_presets, 'Index exceeds tier limit');

            let total = p0 + p1 + p2 + g0 + g1 + g2;
            assert(total <= DEFENDER_BUDGET, 'Budget exceeds 12');

            let mut defense: PresetDefense = world.read_model(caller);

            if index == 0 {
                defense.p0_p0 = p0; defense.p0_p1 = p1; defense.p0_p2 = p2;
                defense.p0_g0 = g0; defense.p0_g1 = g1; defense.p0_g2 = g2;
            } else if index == 1 {
                defense.p1_p0 = p0; defense.p1_p1 = p1; defense.p1_p2 = p2;
                defense.p1_g0 = g0; defense.p1_g1 = g1; defense.p1_g2 = g2;
            } else if index == 2 {
                defense.p2_p0 = p0; defense.p2_p1 = p1; defense.p2_p2 = p2;
                defense.p2_g0 = g0; defense.p2_g1 = g1; defense.p2_g2 = g2;
            } else {
                defense.p3_p0 = p0; defense.p3_p1 = p1; defense.p3_p2 = p2;
                defense.p3_g0 = g0; defense.p3_g1 = g1; defense.p3_g2 = g2;
            }

            if index >= defense.preset_count {
                defense.preset_count = index + 1;
            }

            world.write_model(@defense);
        }

        fn initiate_conquest(
            ref self: ContractState,
            target_parcel: u32,
            p0: u8, p1: u8, p2: u8,
            g0: u8, g1: u8, g2: u8,
            ability_id: u8, ability_target: u8,
        ) {
            let mut world = self.world_default();
            let attacker = get_caller_address();

            // Validate attacker budget (10)
            let atk_total = p0 + p1 + p2 + g0 + g1 + g2;
            assert(atk_total <= ATTACKER_BUDGET, 'Budget exceeds 10');

            // Rate limit: refuse another attack until the cooldown elapses.
            // Written before any token movement so a blocked call is cheap.
            let now = get_block_timestamp();
            let mut cooldown: ConquestCooldown = world.read_model(attacker);
            if cooldown.last_attack_time != 0 {
                assert(
                    now >= cooldown.last_attack_time + CONQUEST_COOLDOWN,
                    'Conquest on cooldown',
                );
            }
            cooldown.last_attack_time = now;
            world.write_model(@cooldown);

            // Validate ability (0 = none, 1-10 = valid) and verify ownership.
            // The ability is CONSUMED by the attack: it is escrowed permanently
            // into this contract (the only address that implements the ERC-1155
            // receiver, so it's a de-facto burn) and never returned, win or
            // lose. Abilities are single-use in conquest.
            if ability_id > 0 {
                assert(ability_id <= 10, 'Invalid ability ID');
                assert(ability_target <= 2, 'Invalid ability target');

                let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);
                let erc1155 = IERC1155Dispatcher { contract_address: rc.ability_token };
                let balance = erc1155.balance_of(attacker, ability_id.into());
                assert(balance >= 1_u256, 'Ability not owned');
                erc1155.safe_transfer_from(
                    attacker, get_contract_address(),
                    ability_id.into(), 1_u256,
                    array![].span(),
                );
            }

            // Validate target parcel
            let target: Parcel = world.read_model(target_parcel);
            let defender = target.owner;
            assert(defender.is_non_zero(), 'Target is unclaimed');
            assert(defender != attacker, 'Cannot attack own parcel');
            assert(!target.is_home, 'Cannot attack home parcel');

            // Shared borders — can't conquest your own faction
            let attacker_member: FactionMember = world.read_model(attacker);
            let defender_member: FactionMember = world.read_model(defender);
            if attacker_member.faction_id != 0 && attacker_member.faction_id == defender_member.faction_id {
                panic!("Cannot conquest faction ally");
            }

            // Attacker kingdom for adjacency check
            let atk_kingdom: PlayerKingdom = world.read_model(attacker);
            assert(atk_kingdom.registered, 'Not registered');

            let config: WorldConfig = world.read_model(0_u8);
            let mut has_adjacent = false;

            // Attacker's closest non-home parcel to the target, tracked during
            // the SAME sweep as the adjacency check. A losing attack used to
            // scan the whole map a second time to find it; every parcel read is
            // a separate world call, so a loss cost twice what a win did.
            let mut has_non_home = false;
            let mut closest_id: u32 = 0;
            let mut min_dist: u16 = 65535;

            // Check if defender wants reinforcement. defender_member was already
            // read above for the friendly-fire check — reuse it here.
            let defender_kingdom: PlayerKingdom = world.read_model(defender);
            let reinforcement_on = defender_kingdom.faction_reinforcement_enabled;
            let defender_faction_id = defender_member.faction_id;

            // Ally preset pool (up to 3 allies)
            let mut ally_p0_1: u8 = 0; let mut ally_p1_1: u8 = 0; let mut ally_p2_1: u8 = 0;
            let mut ally_g0_1: u8 = 0; let mut ally_g1_1: u8 = 0; let mut ally_g2_1: u8 = 0;
            let mut ally_p0_2: u8 = 0; let mut ally_p1_2: u8 = 0; let mut ally_p2_2: u8 = 0;
            let mut ally_g0_2: u8 = 0; let mut ally_g1_2: u8 = 0; let mut ally_g2_2: u8 = 0;
            let mut ally_p0_3: u8 = 0; let mut ally_p1_3: u8 = 0; let mut ally_p2_3: u8 = 0;
            let mut ally_g0_3: u8 = 0; let mut ally_g1_3: u8 = 0; let mut ally_g2_3: u8 = 0;
            let mut ally_count: u8 = 0;
            let zero_addr: ContractAddress = Zero::zero();
            let mut ally_owner_1: ContractAddress = zero_addr;
            let mut ally_owner_2: ContractAddress = zero_addr;
            let mut ally_owner_3: ContractAddress = zero_addr;

            let mut pi: u32 = 0;
            while pi < config.total_parcels {
                let parcel_iter: Parcel = world.read_model(pi);
                // Attacker adjacency, and the loss-forfeit candidate. One
                // hex_distance serves both — is_neighbor just compares it to 1.
                if parcel_iter.owner == attacker {
                    let d = hex::hex_distance(
                        parcel_iter.col, parcel_iter.row, target.col, target.row,
                    );
                    if d == 1 {
                        has_adjacent = true;
                    }
                    if !parcel_iter.is_home && d < min_dist {
                        min_dist = d;
                        closest_id = pi;
                        has_non_home = true;
                    }
                }
                // Faction ally reinforcement. Deduped per ally PLAYER (issue #29):
                // an ally owning multiple parcels bordering the target still fills
                // only one of the 3 ally slots, so clustered territory can't crowd
                // the pool with copies of one preset.
                if reinforcement_on && defender_faction_id != 0 && ally_count < 3 {
                    let owner = parcel_iter.owner;
                    let already_counted = owner == ally_owner_1
                        || owner == ally_owner_2
                        || owner == ally_owner_3;
                    if owner.is_non_zero() && owner != defender && !already_counted {
                        let ally_member: FactionMember = world.read_model(owner);
                        if ally_member.faction_id == defender_faction_id {
                            if hex::is_neighbor(parcel_iter.col, parcel_iter.row, target.col, target.row) {
                                let ally_defense: siege_dojo::models::preset_defense::PresetDefense = world.read_model(owner);
                                if ally_count == 0 {
                                    ally_p0_1 = ally_defense.p0_p0; ally_p1_1 = ally_defense.p0_p1; ally_p2_1 = ally_defense.p0_p2;
                                    ally_g0_1 = ally_defense.p0_g0; ally_g1_1 = ally_defense.p0_g1; ally_g2_1 = ally_defense.p0_g2;
                                    ally_owner_1 = owner;
                                } else if ally_count == 1 {
                                    ally_p0_2 = ally_defense.p0_p0; ally_p1_2 = ally_defense.p0_p1; ally_p2_2 = ally_defense.p0_p2;
                                    ally_g0_2 = ally_defense.p0_g0; ally_g1_2 = ally_defense.p0_g1; ally_g2_2 = ally_defense.p0_g2;
                                    ally_owner_2 = owner;
                                } else {
                                    ally_p0_3 = ally_defense.p0_p0; ally_p1_3 = ally_defense.p0_p1; ally_p2_3 = ally_defense.p0_p2;
                                    ally_g0_3 = ally_defense.p0_g0; ally_g1_3 = ally_defense.p0_g1; ally_g2_3 = ally_defense.p0_g2;
                                    ally_owner_3 = owner;
                                }
                                ally_count += 1;
                            }
                        }
                    }
                }
                pi += 1;
            };
            assert(has_adjacent, 'No adjacent parcel');

            // Get defender's preset defense and select via VRF
            let defense: PresetDefense = world.read_model(defender);

            // Consume VRF unconditionally — the multicall always submits
            // request_random, so consuming it must not become conditional.
            // Read VRF from ResourceConfig (same pattern as actions_1v1).
            let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);
            let vrf_addr = if rc.vrf_provider.is_non_zero() {
                rc.vrf_provider
            } else {
                let addr: starknet::ContractAddress = 0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f.try_into().unwrap();
                addr
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value: u256 = vrf.consume_random(Source::Nonce(starknet::get_contract_address())).into();
            let total_pool: u8 = defense.preset_count + ally_count;

            // Select the defending allocation. A turtling defender with no presets
            // and no ally reinforcement (total_pool == 0) is always attackable and
            // fights with the fixed, publicly known default garrison. The modulo is
            // skipped in that case — dividing by zero would panic.
            let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if total_pool == 0 {
                (
                    DEFAULT_DEF_ALLOC, DEFAULT_DEF_ALLOC, DEFAULT_DEF_ALLOC,
                    DEFAULT_DEF_ALLOC, DEFAULT_DEF_ALLOC, DEFAULT_DEF_ALLOC,
                )
            } else {
                let preset_idx: u8 = (random_value % total_pool.into()).try_into().unwrap();
                // Read selected preset — defender slots first, then ally slots
                if preset_idx < defense.preset_count {
                    if preset_idx == 0 {
                        (defense.p0_p0, defense.p0_p1, defense.p0_p2, defense.p0_g0, defense.p0_g1, defense.p0_g2)
                    } else if preset_idx == 1 {
                        (defense.p1_p0, defense.p1_p1, defense.p1_p2, defense.p1_g0, defense.p1_g1, defense.p1_g2)
                    } else if preset_idx == 2 {
                        (defense.p2_p0, defense.p2_p1, defense.p2_p2, defense.p2_g0, defense.p2_g1, defense.p2_g2)
                    } else {
                        (defense.p3_p0, defense.p3_p1, defense.p3_p2, defense.p3_g0, defense.p3_g1, defense.p3_g2)
                    }
                } else {
                    let ally_idx = preset_idx - defense.preset_count;
                    if ally_idx == 0 {
                        (ally_p0_1, ally_p1_1, ally_p2_1, ally_g0_1, ally_g1_1, ally_g2_1)
                    } else if ally_idx == 1 {
                        (ally_p0_2, ally_p1_2, ally_p2_2, ally_g0_2, ally_g1_2, ally_g2_2)
                    } else {
                        (ally_p0_3, ally_p1_3, ally_p2_3, ally_g0_3, ally_g1_3, ally_g2_3)
                    }
                }
            };

            // --- Apply attacker ability effects ---
            // Mutable copies of attacker values
            let mut atk_p0 = p0;
            let mut atk_p1 = p1;
            let mut atk_p2 = p2;
            let mut atk_g0 = g0;
            let mut atk_g1 = g1;
            let mut atk_g2 = g2;

            // Fortify — tier-aware defense boost
            let a_type = ability_type_from_token(ability_id);
            let a_tier = ability_tier_from_token(ability_id);
            if a_type == 5 {
                if a_tier == 1 {
                    atk_g0 = atk_g0 + 1;
                    atk_g1 = atk_g1 + 1;
                    atk_g2 = atk_g2 + 1;
                } else {
                    atk_g0 = atk_g0 * 2;
                    atk_g1 = atk_g1 * 2;
                    atk_g2 = atk_g2 * 2;
                }
            }

            // Siege Sword — tier-aware attack override
            if a_type == 1 {
                let new_attack: u8 = if a_tier == 1 { 5 } else { 10 };
                if ability_target == 0 { atk_p0 = new_attack; }
                else if ability_target == 1 { atk_p1 = new_attack; }
                else { atk_p2 = new_attack; }
            }

            // Per-gate damage calculation
            let dmg_to_def_0: u8 = if atk_p0 > def_g0 { atk_p0 - def_g0 } else { 0 };
            let dmg_to_def_1: u8 = if atk_p1 > def_g1 { atk_p1 - def_g1 } else { 0 };
            let dmg_to_def_2: u8 = if atk_p2 > def_g2 { atk_p2 - def_g2 } else { 0 };
            let mut total_dmg_to_def: u8 = dmg_to_def_0 + dmg_to_def_1 + dmg_to_def_2;

            let dmg_to_atk_0: u8 = if def_p0 > atk_g0 { def_p0 - atk_g0 } else { 0 };
            let dmg_to_atk_1: u8 = if def_p1 > atk_g1 { def_p1 - atk_g1 } else { 0 };
            let dmg_to_atk_2: u8 = if def_p2 > atk_g2 { def_p2 - atk_g2 } else { 0 };
            let mut total_dmg_to_atk: u8 = dmg_to_atk_0 + dmg_to_atk_1 + dmg_to_atk_2;

            // Stone Cloak — tier-aware gate damage reduction
            if a_type == 2 {
                if a_tier == 1 {
                    total_dmg_to_atk = total_dmg_to_atk / 2;
                } else {
                    total_dmg_to_atk = 0;
                }
            }

            // Hex — tier-aware total damage reduction
            if a_type == 4 {
                let reduction: u8 = if a_tier == 1 { 3 } else { 8 };
                if total_dmg_to_atk > reduction {
                    total_dmg_to_atk = total_dmg_to_atk - reduction;
                } else {
                    total_dmg_to_atk = 0;
                }
            }

            // Apply damage to vaults
            let mut atk_hp: u8 = if total_dmg_to_atk >= ATTACKER_HP { 0 } else { ATTACKER_HP - total_dmg_to_atk };
            let mut def_hp: u8 = if total_dmg_to_def >= DEFENDER_HP { 0 } else { DEFENDER_HP - total_dmg_to_def };

            // Ember Blast — tier-aware direct vault damage
            if a_type == 3 {
                let ember_dmg: u8 = if a_tier == 1 { 2 } else { 6 };
                if def_hp > ember_dmg { def_hp = def_hp - ember_dmg; } else { def_hp = 0; }
            }

            // Determine winner: highest HP wins. Tie goes to defender.
            let attacker_wins = atk_hp > def_hp;
            // Note: if atk_hp == def_hp (including both 0), defender wins (tie/draw).

            if attacker_wins {
                // Transfer target parcel to attacker
                let mut t = target;
                t.owner = attacker;
                world.write_model(@t);

                let mut ak: PlayerKingdom = world.read_model(attacker);
                ak.parcel_count += 1;
                ak.total_wins += 1;
                world.write_model(@ak);

                let mut dk: PlayerKingdom = world.read_model(defender);
                dk.parcel_count -= 1;
                world.write_model(@dk);
            } else {
                // Attacker loses — transfer their parcel closest to the target
                // to the defender. The candidate was found during the adjacency
                // sweep above, so there is no second map scan here.
                // Exception: last stand (attacker has only home parcels) → no loss.
                if has_non_home {
                    let mut lost_parcel: Parcel = world.read_model(closest_id);
                    lost_parcel.owner = defender;
                    world.write_model(@lost_parcel);

                    let mut ak: PlayerKingdom = world.read_model(attacker);
                    ak.parcel_count -= 1;
                    world.write_model(@ak);

                    let mut dk: PlayerKingdom = world.read_model(defender);
                    dk.parcel_count += 1;
                    world.write_model(@dk);
                }
                // If !has_non_home: last stand — no parcel loss for attacker
            }

            // Surface the outcome (and whether an ability was consumed) so the
            // frontend and MCP can notify the player.
            world.emit_event(@ConquestResolved {
                attacker,
                target_parcel,
                defender,
                attacker_won: attacker_wins,
                ability_id,
                ability_consumed: ability_id > 0,
            });
        }
    }
}
