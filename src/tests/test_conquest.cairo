// Mock VRF provider for conquest tests.
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
            0
        }
    }
}

#[starknet::contract]
pub mod MockAccount {
    const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC6_ID
        }
    }
}

#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::conquest::{
        conquest, IConquestDispatcher, IConquestDispatcherTrait,
    };
    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::{
        actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait,
    };
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::{PresetDefense, m_PresetDefense};
    use siege_dojo::models::conquest_cooldown::m_ConquestCooldown;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
        e_ConquestResolved,
    };
    use siege_dojo::tokens::ability_token::{
        AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait,
    };
    use siege_dojo::models::faction::{m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::m_FactionMember;
    use siege_dojo::models::faction_invite::m_FactionInvite;
    use super::{MockVrfProvider, MockAccount};

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    #[starknet::interface]
    trait IERC1155Like<T> {
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
        fn set_approval_for_all(ref self: T, operator: starknet::ContractAddress, approved: bool);
    }

    fn deploy_ability_token(
        admin: starknet::ContractAddress,
    ) -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (
            IAbilityTokenDispatcher { contract_address: addr },
            IERC1155LikeDispatcher { contract_address: addr },
            addr,
        )
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_user_salted(salt: felt252) -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), salt, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    /// Patch state so the given player owns exactly parcels h0/h1/h2 as homes,
    /// regardless of what register_player picked. Releases whatever homes the
    /// algorithm picked and overrides PlayerKingdom fields. Used to stabilise
    /// conquest/pillaging tests after the spatial starting algorithm change.
    fn force_legacy_homes(
        ref world: dojo::world::WorldStorage,
        player: starknet::ContractAddress,
        h0: u32, h1: u32, h2: u32,
    ) {
        let mut kingdom: PlayerKingdom = world.read_model(player);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();

        // Release current homes
        let current_homes: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
        let mut i: u32 = 0;
        while i < 3 {
            let pid = *current_homes.at(i);
            let mut p: Parcel = world.read_model(pid);
            if p.owner == player {
                p.owner = zero_addr;
                p.is_home = false;
                world.write_model_test(@p);
            }
            i += 1;
        };

        // Claim the desired homes and assign types (0=Forge, 1=Quarry, 2=Grove)
        let desired: Array<u32> = array![h0, h1, h2];
        let types: Array<u8> = array![0, 1, 2];
        let mut i: u32 = 0;
        while i < 3 {
            let pid = *desired.at(i);
            let mut p: Parcel = world.read_model(pid);
            p.owner = player;
            p.is_home = true;
            p.parcel_type = *types.at(i);
            world.write_model_test(@p);
            i += 1;
        };

        kingdom.home_0 = h0;
        kingdom.home_1 = h1;
        kingdom.home_2 = h2;
        kingdom.parcel_count = 3;
        world.write_model_test(@kingdom);
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_ConquestCooldown::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Event(e_ConquestResolved::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(conquest::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"conquest")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    // Setup: world + 2 players + give player_a an extra non-home parcel (parcel 4)
    fn conquest_setup() -> (
        dojo::world::WorldStorage,
        IConquestDispatcher,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a (attacker)
        starknet::ContractAddress, // player_b (defender)
    ) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (conquest_addr, _) = world.dns(@"conquest").unwrap();
        let conquest_sys = IConquestDispatcher { contract_address: conquest_addr };

        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

        // Wire VRF: set_vrf_provider checks world owner.
        // The initial caller (test runner) is the world owner — call before changing address.
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        IActions1v1Dispatcher { contract_address: actions_addr }.set_vrf_provider(mock_vrf_addr);

        // AbilityToken: deploy and wire via write_model_test (avoids world-owner check)
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, erc1155, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);
        // Reset caller back to test runner so initialize_world can proceed
        starknet::testing::set_contract_address(contract_address_const::<0>());
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token_addr;
        world.write_model_test(@rc);

        // Grid: 2 rows, 5 cols each (10 parcels)
        // parcels 0-4: (0,0)..(4,0)  parcels 5-9: (0,1)..(4,1)
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        world_sys.initialize_world(cols, rows);

        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        force_legacy_homes(ref world, player_a, 0, 1, 2);
        erc1155.set_approval_for_all(conquest_addr, true);

        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        force_legacy_homes(ref world, player_b, 3, 4, 5);

        // Upgrade player_b to Hegemonia (tier 2) so they can set 3 preset defense slots
        let mut kb_tier: PlayerKingdom = world.read_model(player_b);
        kb_tier.tier = 2;
        world.write_model_test(@kb_tier);

        let mut extra_parcel: Parcel = world.read_model(8_u32);
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        if extra_parcel.owner == zero_addr {
            extra_parcel.owner = player_a;
            world.write_model_test(@extra_parcel);
            starknet::testing::set_contract_address(player_a);
            let mut ka: PlayerKingdom = world.read_model(player_a);
            ka.parcel_count += 1;
            world.write_model_test(@ka);
        }

        (world, conquest_sys, world_sys, player_a, player_b)
    }

    #[test]
    fn test_set_preset_defense() {
        let (mut world, conquest_sys, _, _, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        // Preset index 0: attack 2/2/2, defense 2/2/2 (total 12)
        conquest_sys.set_preset_defense(0, 2, 2, 2, 2, 2, 2);

        let defense: PresetDefense = world.read_model(player_b);
        assert(defense.p0_p0 == 2, 'p0 atk should be 2');
        assert(defense.p0_g0 == 2, 'p0 def should be 2');
        assert(defense.preset_count == 1, 'should have 1 preset');
    }

    #[test]
    #[should_panic(expected: ('Budget exceeds 12', 'ENTRYPOINT_FAILED'))]
    fn test_preset_defense_over_budget() {
        let (_, conquest_sys, _, _, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 3, 3, 3, 3, 3, 3); // total = 18 > 12
    }

    #[test]
    fn test_conquest_attacker_wins() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender sets weak defense (all 3 presets — weak, 3 on defense only)
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1); // 3 on defense, 0 attack
        conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
        conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

        // Give B parcel 9 (col=4,row=1) as a non-home parcel to target.
        // Player A has parcel 8 (col=3,row=1) which is adjacent to parcel 9.
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker launches conquest with overwhelming attack on gate 0
        // atk: p0=10, p1=0, p2=0 (total=10), def: g0=0,g1=0,g2=0
        // Damage to defender: max(0, 10-1)=9 + 0 + 0 = 9 → def_hp = 15-9 = 6
        // Damage to attacker: def_p0=0 vs g0=0 → 0, etc. → atk_hp = 15
        // 15 > 6 → attacker wins
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(
            9,
            10, 0, 0, // attack: all on gate 0
            0, 0, 0,  // defense: none
            0, 0,     // no ability
        );

        // Verify target parcel is now owned by attacker
        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'attacker should own target');
    }

    #[test]
    fn test_conquest_attacker_loses_parcel_to_defender() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender sets strong defense (heavy counterattack — all attack, no defense)
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0); // 12 total attack
        conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

        // Give B parcel 9 (col=4,row=1) as a non-home parcel to target.
        // Player A has parcel 8 (col=3,row=1) which is adjacent.
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        let ka_before: PlayerKingdom = world.read_model(player_a);

        // Attacker launches weak attack with no defense
        // atk: p0=1,p1=1,p2=1, def: g0=0,g1=0,g2=0
        // Damage to defender: max(0,1-0)*3 = 3 → def_hp = 15-3 = 12
        // Damage to attacker: def_p0=4 vs g0=0 → 4, *3 = 12 → atk_hp = 15-12 = 3
        // 3 < 12 → defender wins → attacker loses parcel 8
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(
            9,          // target
            1, 1, 1,    // weak attack
            0, 0, 0,    // no defense — will take 12 damage from defender's counterattack
            0, 0,       // no ability
        );

        // Attacker should lose a parcel (goes to defender)
        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.parcel_count < ka_before.parcel_count, 'attacker should lose parcel');
    }

    #[test]
    fn test_last_stand_no_parcel_loss() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Remove player_a's non-home parcels (leave only home)
        let config: WorldConfig = world.read_model(0_u8);
        let mut p: u32 = 0;
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        while p < config.total_parcels {
            let parcel: Parcel = world.read_model(p);
            if parcel.owner == player_a && !parcel.is_home {
                let mut release = parcel;
                release.owner = zero_addr;
                world.write_model_test(@release);
            }
            p += 1;
        };
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.parcel_count = 3; // only home parcels remain
        world.write_model_test(@ka);

        // Defender sets strong defense (all attack)
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

        // Give B parcel 9 (col=4,row=1) as a non-home parcel to target.
        // We need player_a to have a parcel adjacent to parcel 9 for the adjacency check.
        // Player_a's home parcels are at parcels 0,1,2 (col=0,1,2 row=0).
        // Is any home parcel adjacent to parcel 9 (col=4,row=1)?
        // hex_distance((2,0),(4,1)): r1=0 even: x1=2,z1=0,y1=-2; r2=1 odd: x2=4-(0)/2=4,z2=1,y2=-5
        // dx=2,dy=3,dz=1 → max=3. Not adjacent.
        // hex_distance((1,0),(4,1)): dx=3. Not adjacent.
        // We need a different target that IS adjacent to player_a's home parcels.
        // Parcel 6 is at (1,1). Is it adjacent to home parcel 1 at (1,0)?
        // hex_distance((1,0),(1,1)): r1=0 even, r2=1 odd.
        // x1=1-(0)/2=1, z1=0, y1=-1; x2=1-(0)/2=1, z2=1, y2=-2
        // dx=0, dy=1, dz=1 → max=1. Adjacent!
        // Give B parcel 6 (col=1,row=1) as target instead.
        let mut tp: Parcel = world.read_model(6_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker (home-only) launches weak attack and loses
        // Player_a's home parcel 1 at (1,0) is adjacent to target parcel 6 at (1,1)
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(6, 1, 1, 1, 0, 0, 0, 0, 0);

        // Player A should still have 3 parcels (last stand — no loss)
        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.parcel_count == 3, 'last stand: no parcel loss');
    }

    #[test]
    fn test_conquest_with_ember_blast_t2() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Give player_a a T2 Ember Blast (token ID 8)
        let rc: ResourceConfig = world.read_model(0_u8);
        let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(world_sys_addr);
        ability_token.mint(player_a, 8_u256, 1_u256);

        // Defender: no attack, moderate defense
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 4, 4, 4);
        conquest_sys.set_preset_defense(1, 0, 0, 0, 4, 4, 4);
        conquest_sys.set_preset_defense(2, 0, 0, 0, 4, 4, 4);

        // Give B parcel 9 as a non-home parcel
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker: 5/5/0 attack, no defense, T2 Ember Blast (token ID 8 = 6 damage)
        // Gate damage to defender: (5-4)+(5-4)+(0-4)=0 = 2
        // Defender HP: 15 - 2 = 13, then T2 Ember Blast -6 = 7
        // Attacker HP: 10
        // 10 > 7 → attacker wins
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 5, 5, 0, 0, 0, 0, 8, 0);

        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'ember blast t2 should win');
    }

    #[test]
    fn test_conquest_with_stone_cloak_t2() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Give player_a a T2 Stone Cloak (token ID 7)
        let rc: ResourceConfig = world.read_model(0_u8);
        let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(world_sys_addr);
        ability_token.mint(player_a, 7_u256, 1_u256);

        // Defender: heavy counterattack
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker: 10/0/0 attack, no defense, T2 Stone Cloak (token ID 7 = zeros damage)
        // Gate damage to defender: (10-0)+(0-0)+(0-0) = 10. Def HP: 15-10 = 5
        // Gate damage to attacker: 4+4+4 = 12. T2 Stone Cloak → 0
        // Attacker HP: 10. 10 > 5 → attacker wins
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 7, 0);

        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'stone cloak t2 should win');
    }

    #[test]
    #[should_panic(expected: ('Ability not owned', 'ENTRYPOINT_FAILED'))]
    fn test_conquest_rejects_unowned_ability() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender setup
        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);
        conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
        conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker tries to use ability 4 (T1 Hex) without owning it
        // (player_a gets starter IDs 1,2,3 on register — ID 4 is not a starter)
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 5, 0, 0, 0, 0, 0, 4, 0);
    }

    #[test]
    #[should_panic(expected: ('Index exceeds tier limit', 'ENTRYPOINT_FAILED'))]
    fn test_polis_cannot_set_preset_1() {
        let (mut world, conquest_sys, _, _, _) = conquest_setup();

        // Create a fresh Polis player (tier 0) via write_model_test (no parcels needed)
        let polis_player = deploy_user_salted(99);
        let mut kp: PlayerKingdom = world.read_model(polis_player);
        kp.registered = true;
        kp.tier = 0;
        world.write_model_test(@kp);

        // Polis tier = 0, max 1 preset. Setting index 0 is ok, index 1 should fail.
        starknet::testing::set_contract_address(polis_player);
        conquest_sys.set_preset_defense(0, 2, 2, 2, 2, 2, 2);
        conquest_sys.set_preset_defense(1, 2, 2, 2, 2, 2, 2); // should panic
    }

    #[test]
    fn test_conquest_win_increments_total_wins() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);
        conquest_sys.set_preset_defense(1, 0, 0, 0, 1, 1, 1);
        conquest_sys.set_preset_defense(2, 0, 0, 0, 1, 1, 1);

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        let ka_before: PlayerKingdom = world.read_model(player_a);
        assert(ka_before.total_wins == 0, 'should start at 0 wins');

        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);

        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.total_wins == 1, 'total_wins should be 1');
    }

    #[test]
    fn test_conquest_loss_no_total_wins() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(1, 4, 4, 4, 0, 0, 0);
        conquest_sys.set_preset_defense(2, 4, 4, 4, 0, 0, 0);

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 1, 1, 1, 0, 0, 0, 0, 0);

        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.total_wins == 0, 'no wins on loss');
        let kb_after: PlayerKingdom = world.read_model(player_b);
        assert(kb_after.total_wins == 0, 'defender gets no win');
    }

    #[test]
    fn test_basileia_can_set_all_four_presets() {
        let (mut world, conquest_sys, _, _, _) = conquest_setup();

        // Create a Basileia player (tier 3) via write_model_test (no parcels needed)
        let basileia_player = deploy_user_salted(100);
        let mut kb: PlayerKingdom = world.read_model(basileia_player);
        kb.registered = true;
        kb.tier = 3;
        world.write_model_test(@kb);

        starknet::testing::set_contract_address(basileia_player);
        conquest_sys.set_preset_defense(0, 2, 2, 2, 2, 2, 2);
        conquest_sys.set_preset_defense(1, 2, 2, 2, 2, 2, 2);
        conquest_sys.set_preset_defense(2, 2, 2, 2, 2, 2, 2);
        conquest_sys.set_preset_defense(3, 2, 2, 2, 2, 2, 2);

        let defense: PresetDefense = world.read_model(basileia_player);
        assert(defense.preset_count == 4, 'should have 4 presets');
        assert(defense.p3_p0 == 2, 'p3 slot 0 should be 2');
    }

    #[test]
    #[should_panic(expected: ("Cannot conquest faction ally", 'ENTRYPOINT_FAILED'))]
    fn test_conquest_blocks_friendly_fire() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Put both players in the same faction
        world.write_model_test(@siege_dojo::models::faction::Faction {
            faction_id: 1,
            leader: player_a,
            name: 'TestClan',
            tag: 'TC',
            member_count: 2,
            created_at: 0,
            dissolved: false,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: player_a,
            faction_id: 1,
            joined_at: 0,
            last_leave_time: 0,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: player_b,
            faction_id: 1,
            joined_at: 0,
            last_leave_time: 0,
        });

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);

        let mut tp: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);
    }

    #[test]
    fn test_conquest_reinforcement_disabled_by_default() {
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);

        let kb: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
        assert(!kb.faction_reinforcement_enabled, 'default off');

        let mut tp: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb_mut = kb;
        kb_mut.parcel_count += 1;
        world.write_model_test(@kb_mut);

        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);

        let target: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'attacker wins weak defense');
    }

    // ── Task 8: Reinforcement pool — positive / guard / empty-pool tests ──

    #[test]
    fn test_conquest_reinforcement_ally_contributes_to_pool() {
        // Defender opts in with ZERO own presets. An ally in the same faction
        // owns a parcel adjacent to the target and has a strong preset 0. The
        // mock VRF returns 0, defender_preset_count = 0, so preset_idx 0 falls
        // into the ally slot — the ally's preset is what fights the attacker,
        // and the attacker loses.
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Defender opts into faction reinforcement. No own presets.
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.faction_reinforcement_enabled = true;
        world.write_model_test(@kb);

        // Put defender + ally in the same faction (faction_id = 2).
        let ally = deploy_user_salted(77);
        world.write_model_test(@siege_dojo::models::faction::Faction {
            faction_id: 2,
            leader: ally,
            name: 'Allied',
            tag: 'AL',
            member_count: 2,
            created_at: 0,
            dissolved: false,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: ally,
            faction_id: 2,
            joined_at: 0,
            last_leave_time: 0,
        });
        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: player_b,
            faction_id: 2,
            joined_at: 0,
            last_leave_time: 0,
        });

        // Ally owns parcel 6 at (col=1,row=1), adjacent to target parcel 7 at (col=2,row=1).
        // Parcel 6 is unclaimed after conquest_setup (only parcel 8 was assigned).
        let mut ally_parcel: Parcel = world.read_model(6_u32);
        ally_parcel.owner = ally;
        world.write_model_test(@ally_parcel);

        // Ally's preset 0: 4/4/4 attack, 0/0/0 defense (heavy counterattack).
        world.write_model_test(@PresetDefense {
            player: ally,
            p0_p0: 4, p0_p1: 4, p0_p2: 4, p0_g0: 0, p0_g1: 0, p0_g2: 0,
            p1_p0: 0, p1_p1: 0, p1_p2: 0, p1_g0: 0, p1_g1: 0, p1_g2: 0,
            p2_p0: 0, p2_p1: 0, p2_p2: 0, p2_g0: 0, p2_g1: 0, p2_g2: 0,
            p3_p0: 0, p3_p1: 0, p3_p2: 0, p3_g0: 0, p3_g1: 0, p3_g2: 0,
            preset_count: 1,
        });

        // Give player_b parcel 7 at (2,1) as the target. Player_a already has
        // parcel 2 (home at (2,0)) adjacent to parcel 7, so attacker adjacency holds.
        let mut tp: Parcel = world.read_model(7_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb_parcel: PlayerKingdom = world.read_model(player_b);
        kb_parcel.parcel_count += 1;
        world.write_model_test(@kb_parcel);

        let ka_before: PlayerKingdom = world.read_model(player_a);

        // Attacker launches weak attack.
        //   Ally preset (VRF-picked): p=4/4/4, g=0/0/0
        //   Attacker:                 p=1/1/1, g=0/0/0
        //   Damage to defender: (1-0)*3 = 3 → def_hp = 15-3 = 12
        //   Damage to attacker: (4-0)*3 = 12 → atk_hp = 10-12 clamps to 0
        //   0 < 12 → defender (ally) wins → attacker loses a parcel
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(7, 1, 1, 1, 0, 0, 0, 0, 0);

        let target: Parcel = world.read_model(7_u32);
        assert(target.owner == player_b, 'ally preset should defend');

        let ka_after: PlayerKingdom = world.read_model(player_a);
        assert(ka_after.parcel_count < ka_before.parcel_count, 'attacker should lose parcel');
    }

    #[test]
    fn test_conquest_reinforcement_opt_in_without_faction() {
        // Defender opts in but is NOT in a faction. The `defender_faction_id != 0`
        // guard short-circuits the ally loop, so opt-in is a no-op and the
        // defender's own presets handle the fight normally.
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.faction_reinforcement_enabled = true;
        world.write_model_test(@kb);

        starknet::testing::set_contract_address(player_b);
        conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb_mut: PlayerKingdom = world.read_model(player_b);
        kb_mut.parcel_count += 1;
        world.write_model_test(@kb_mut);

        // Attacker wins via overwhelming attack on gate 0.
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);

        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'opt-in alone should not help');
    }

    #[test]
    fn test_conquest_no_presets_uses_default_defense() {
        // A defender who never set a preset (and has no ally reinforcement) is
        // no longer unattackable — they fight with the fixed default garrison
        // 2/2/2 assault + 2/2/2 gate defense (sum 12). Here the default assault
        // is strong enough to repel a naive attacker who brings no gate defense.
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Prove the cooldown is set from the real timestamp, not left at 0.
        starknet::testing::set_block_timestamp(1000);

        // Defender: no presets at all, no faction reinforcement.

        // Give B parcel 9 (col=4,row=1) as a non-home target; A's parcel 8 is adjacent.
        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker: p=(3,3,4) all attack, g=(0,0,0) no gate defense.
        // Damage to defender: (3-2)+(3-2)+(4-2) = 1+1+2 = 4 → def_hp = 15-4 = 11
        // Damage to attacker: default p 2/2/2 vs g 0/0/0 = 2+2+2 = 6 → atk_hp = 10-6 = 4
        // 4 < 11 → defender wins, target unchanged.
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 3, 3, 4, 0, 0, 0, 0, 0);

        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_b, 'default def should hold target');

        let cooldown: siege_dojo::models::conquest_cooldown::ConquestCooldown =
            world.read_model(player_a);
        assert(cooldown.last_attack_time == 1000, 'cooldown should be set');
    }

    #[test]
    fn test_conquest_ability_beats_default_defense() {
        // The default garrison is predictable, so an attacker who prepares can
        // still take a turtling defender's parcel. Siege Sword T2 (token 6)
        // overrides one gate's attack to 10, and a matching gate defense soaks
        // the default 2/2/2 assault.
        let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

        // Give player_a a T2 Siege Sword (token ID 6).
        let rc: ResourceConfig = world.read_model(0_u8);
        let ability_token = IAbilityTokenDispatcher { contract_address: rc.ability_token };
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(world_sys_addr);
        ability_token.mint(player_a, 6_u256, 1_u256);

        // Defender: no presets, no reinforcement → default 2/2/2 // 2/2/2 garrison.

        let mut tp: Parcel = world.read_model(9_u32);
        tp.owner = player_b;
        world.write_model_test(@tp);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.parcel_count += 1;
        world.write_model_test(@kb);

        // Attacker: p=(0,0,0), g=(2,2,2) (total 6), Siege Sword T2 on gate 0.
        // Siege Sword T2 → atk_p0 = 10.
        // Damage to defender: (10-2)+0+0 = 8 → def_hp = 15-8 = 7
        // Damage to attacker: default p 2/2/2 vs g 2/2/2 = 0 → atk_hp = 10
        // 10 > 7 → attacker wins the target parcel.
        starknet::testing::set_contract_address(player_a);
        conquest_sys.initiate_conquest(9, 0, 0, 0, 2, 2, 2, 6, 0);

        let target: Parcel = world.read_model(9_u32);
        assert(target.owner == player_a, 'siege sword beats default');
    }
}
