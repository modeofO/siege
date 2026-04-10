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

#[dojo::contract]
pub mod conquest {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::parcel::Parcel;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::world_config::WorldConfig;
    use siege_dojo::models::preset_defense::PresetDefense;
    use siege_dojo::utils::hex;

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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
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

            // Validate ability (0 = none, 1-5 = valid)
            if ability_id > 0 {
                assert(ability_id <= 5, 'Invalid ability ID');
                assert(ability_target <= 2, 'Invalid ability target');
            }

            // Validate target parcel
            let target: Parcel = world.read_model(target_parcel);
            let defender = target.owner;
            assert(defender.is_non_zero(), 'Target is unclaimed');
            assert(defender != attacker, 'Cannot attack own parcel');
            assert(!target.is_home, 'Cannot attack home parcel');

            // Attacker kingdom for adjacency + parcel cap check
            let atk_kingdom: PlayerKingdom = world.read_model(attacker);
            assert(atk_kingdom.registered, 'Not registered');

            // Tier-based parcel cap check
            let non_home = if atk_kingdom.parcel_count > 3 { atk_kingdom.parcel_count - 3 } else { 0 };
            let cap = siege_dojo::systems::world_system::tier_parcel_cap(atk_kingdom.tier);
            assert(non_home < cap, 'Parcel cap reached');
            let config: WorldConfig = world.read_model(0_u8);
            let mut has_adjacent = false;
            let mut pi: u32 = 0;
            while pi < config.total_parcels {
                if !has_adjacent {
                    let parcel: Parcel = world.read_model(pi);
                    if parcel.owner == attacker {
                        if hex::is_neighbor(parcel.col, parcel.row, target.col, target.row) {
                            has_adjacent = true;
                        }
                    }
                }
                pi += 1;
            };
            assert(has_adjacent, 'No adjacent parcel');

            // Get defender's preset defense and select via VRF
            let defense: PresetDefense = world.read_model(defender);
            assert(defense.preset_count > 0, 'No defense set');

            // VRF selects preset index (0, 1, or 2)
            // Read VRF from ResourceConfig (same pattern as actions_1v1)
            let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);
            let vrf_addr = if rc.vrf_provider.is_non_zero() {
                rc.vrf_provider
            } else {
                let addr: starknet::ContractAddress = 0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f.try_into().unwrap();
                addr
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value: u256 = vrf.consume_random(Source::Nonce(starknet::get_contract_address())).into();
            let preset_idx: u8 = (random_value % defense.preset_count.into()).try_into().unwrap();

            // Read selected preset
            let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if preset_idx == 0 {
                (defense.p0_p0, defense.p0_p1, defense.p0_p2, defense.p0_g0, defense.p0_g1, defense.p0_g2)
            } else if preset_idx == 1 {
                (defense.p1_p0, defense.p1_p1, defense.p1_p2, defense.p1_g0, defense.p1_g1, defense.p1_g2)
            } else if preset_idx == 2 {
                (defense.p2_p0, defense.p2_p1, defense.p2_p2, defense.p2_g0, defense.p2_g1, defense.p2_g2)
            } else {
                (defense.p3_p0, defense.p3_p1, defense.p3_p2, defense.p3_g0, defense.p3_g1, defense.p3_g2)
            };

            // --- Apply attacker ability effects ---
            // Mutable copies of attacker values
            let mut atk_p0 = p0;
            let mut atk_p1 = p1;
            let mut atk_p2 = p2;
            let mut atk_g0 = g0;
            let mut atk_g1 = g1;
            let mut atk_g2 = g2;

            // Fortify (ID 5): double attacker defense
            if ability_id == 5 {
                atk_g0 = atk_g0 * 2;
                atk_g1 = atk_g1 * 2;
                atk_g2 = atk_g2 * 2;
            }

            // Siege Sword (ID 1): override attack on target gate to 10
            if ability_id == 1 {
                if ability_target == 0 { atk_p0 = 10; }
                else if ability_target == 1 { atk_p1 = 10; }
                else { atk_p2 = 10; }
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

            // Stone Cloak (ID 2): zero all gate damage to attacker
            if ability_id == 2 {
                total_dmg_to_atk = 0;
            }

            // Hex (ID 4): reduce damage to attacker by 7
            if ability_id == 4 {
                if total_dmg_to_atk > 7 { total_dmg_to_atk = total_dmg_to_atk - 7; }
                else { total_dmg_to_atk = 0; }
            }

            // Apply damage to vaults
            let mut atk_hp: u8 = if total_dmg_to_atk >= ATTACKER_HP { 0 } else { ATTACKER_HP - total_dmg_to_atk };
            let mut def_hp: u8 = if total_dmg_to_def >= DEFENDER_HP { 0 } else { DEFENDER_HP - total_dmg_to_def };

            // Ember Blast (ID 3): 5 direct damage to defender vault
            if ability_id == 3 {
                if def_hp > 5 { def_hp = def_hp - 5; } else { def_hp = 0; }
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
                // Attacker loses — find their parcel closest to the target
                // and transfer it to the defender.
                // Exception: last stand (attacker has only home parcels) → no loss.
                let mut has_non_home = false;
                let mut closest_id: u32 = 0;
                let mut min_dist: u16 = 65535;

                let mut p2: u32 = 0;
                while p2 < config.total_parcels {
                    let parcel: Parcel = world.read_model(p2);
                    if parcel.owner == attacker && !parcel.is_home {
                        has_non_home = true;
                        let dist = hex::hex_distance(parcel.col, parcel.row, target.col, target.row);
                        if dist < min_dist {
                            min_dist = dist;
                            closest_id = p2;
                        }
                    }
                    p2 += 1;
                };

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
        }
    }
}
