#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use starknet::SyscallResultTrait;
    use core::dict::{Felt252Dict, Felt252DictTrait};

    use siege_dojo::systems::world_system::{world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait};
    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::models::player_cosmetics::{PlayerCosmetics, m_PlayerCosmetics};
    use siege_dojo::tokens::ability_token::{
        AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait,
    };

    use crate::tests::test_world::MockAccount;

    fn deploy_ability_token(admin: starknet::ContractAddress) -> IAbilityTokenDispatcher {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            calldata.span(),
            false,
        )
            .unwrap_syscall();
        IAbilityTokenDispatcher { contract_address: addr }
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        )
            .unwrap_syscall();
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
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerCosmetics::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ]
            .span()
    }

    fn setup() -> (dojo::world::WorldStorage, IWorldSystemDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        let ws = IWorldSystemDispatcher { contract_address: ws_addr };
        (world, ws)
    }

    // Init a full 2x2 rectangle: ids 0..3, row-major.
    fn init_2x2(ws: IWorldSystemDispatcher) {
        ws.initialize_world(
            array![0_u16, 1_u16, 0_u16, 1_u16],
            array![0_u16, 0_u16, 1_u16, 1_u16],
        );
    }

    #[test]
    fn test_expand_appends_missing_cells() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        ws.expand_world(3_u16, 3_u16);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 9, 'total should be 9');
        assert(config.next_parcel_id == 9, 'next_id should be 9');

        // New parcels (ids 4..8) are untyped, unowned, not home.
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let mut i: u32 = 4;
        while i < 9 {
            let p: Parcel = world.read_model(i);
            assert(p.parcel_type == 255, 'new parcel should be untyped');
            assert(p.owner == zero_addr, 'new parcel should be unowned');
            assert(!p.is_home, 'new parcel not home');
            assert(p.col < 3 && p.row < 3, 'cell out of bounds');
            // Every appended cell is OUTSIDE the old 2x2 rectangle.
            assert(p.col >= 2 || p.row >= 2, 'cell overlaps old grid');
            i += 1;
        };
    }

    #[test]
    fn test_expand_preserves_existing_parcels() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        // Claim parcel 1 directly (simulates a live owner).
        let owner_addr: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
        let mut p1: Parcel = world.read_model(1_u32);
        p1.owner = owner_addr;
        p1.parcel_type = 2;
        p1.is_home = true;
        world.write_model_test(@p1);

        ws.expand_world(4_u16, 4_u16);

        let p1_after: Parcel = world.read_model(1_u32);
        assert(p1_after.owner == owner_addr, 'owner must survive expand');
        assert(p1_after.parcel_type == 2, 'type must survive expand');
        assert(p1_after.is_home, 'is_home must survive expand');
        assert(p1_after.col == 1 && p1_after.row == 0, 'position must survive');
    }

    #[test]
    fn test_multiple_incremental_expands() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        ws.expand_world(3_u16, 3_u16);
        ws.expand_world(4_u16, 4_u16);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 16, 'total should be 16');
        assert(config.next_parcel_id == 16, 'next_id should be 16');

        // All 16 cells of the 4x4 rectangle exist exactly once: check via
        // per-cell hit count over all parcel ids.
        let mut found: Felt252Dict<bool> = Default::default();
        let mut i: u32 = 0;
        while i < 16 {
            let p: Parcel = world.read_model(i);
            let cell_key: felt252 = (p.col.into() * 100 + p.row.into());
            assert(!found.get(cell_key), 'duplicate cell');
            found.insert(cell_key, true);
            assert(p.col < 4 && p.row < 4, 'cell out of 4x4');
            i += 1;
        };
    }

    #[test]
    #[should_panic(expected: ('Not world owner', 'ENTRYPOINT_FAILED'))]
    fn test_expand_non_owner_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        let rando = deploy_user();
        starknet::testing::set_contract_address(rando);
        ws.expand_world(3_u16, 3_u16);
    }

    #[test]
    #[should_panic(expected: ('Cannot shrink world', 'ENTRYPOINT_FAILED'))]
    fn test_expand_shrink_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        ws.expand_world(1_u16, 3_u16);
    }

    #[test]
    #[should_panic(expected: ('No growth', 'ENTRYPOINT_FAILED'))]
    fn test_expand_noop_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        ws.expand_world(2_u16, 2_u16);
    }

    #[test]
    #[should_panic(expected: ('World not initialized', 'ENTRYPOINT_FAILED'))]
    fn test_expand_before_init_reverts() {
        let (_world, ws) = setup();
        ws.expand_world(3_u16, 3_u16);
    }

    #[test]
    fn test_register_after_expand_uses_new_parcels() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        // Ability token wiring (register_player mints starter abilities).
        let admin: starknet::ContractAddress = 0xADAD.try_into().unwrap();
        let ability_token = deploy_ability_token(admin);
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(ws_addr);
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token.contract_address;
        world.write_model_test(@rc);

        // Player A takes 3 of the 4 original parcels.
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        // Expand as the default (owner) caller.
        let owner: starknet::ContractAddress = 0.try_into().unwrap();
        starknet::testing::set_contract_address(owner);
        ws.expand_world(4_u16, 4_u16);

        // Player B can now register; only 1 original parcel was free, so at
        // least 2 of B's homes must be appended parcels (id >= 4).
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        let kb: PlayerKingdom = world.read_model(player_b);
        assert(kb.registered, 'B should be registered');
        assert(kb.parcel_count == 3, 'B parcel_count should be 3');
        let mut on_new: u32 = 0;
        if kb.home_0 >= 4 { on_new += 1; }
        if kb.home_1 >= 4 { on_new += 1; }
        if kb.home_2 >= 4 { on_new += 1; }
        assert(on_new >= 2, 'B homes should use new parcels');
        let hb: Parcel = world.read_model(kb.home_0);
        assert(hb.owner == player_b, 'B home_0 owner wrong');
    }
}
