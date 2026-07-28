// Gas canary + schema-subset guard for the map-sweep rework.
//
// The rest of the suite initializes a 10-parcel world, which hides the cost
// that actually matters: mainnet runs 96 parcels, and register_player's sweep
// scales with that. A 10-parcel measurement understates the sweep by ~10x and
// makes register_player's O(unclaimed x claimed) distance term nearly
// invisible. These tests exist to be READ AS GAS NUMBERS in `sozo test`
// output, not just to pass.

#[cfg(test)]
mod tests {
    use dojo::model::{Model, ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
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
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::parcel::{Parcel, ParcelPlacement, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::player_cosmetics::m_PlayerCosmetics;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };

    // Mainnet grid as of the 2026-07-18 expansion.
    const MAINNET_COLS: u16 = 12;
    const MAINNET_ROWS: u16 = 8;

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
        (world, IWorldSystemDispatcher { contract_address: ws_addr })
    }

    /// Build the mainnet-sized 12x8 grid, row-major, exactly as
    /// scripts/init-hex-world.sh does.
    fn init_mainnet_grid(ws: IWorldSystemDispatcher) {
        let mut cols: Array<u16> = ArrayTrait::new();
        let mut rows: Array<u16> = ArrayTrait::new();
        let mut row: u16 = 0;
        while row < MAINNET_ROWS {
            let mut col: u16 = 0;
            while col < MAINNET_COLS {
                cols.append(col);
                rows.append(row);
                col += 1;
            };
            row += 1;
        };
        ws.initialize_world(cols, rows);
    }

    /// The subset struct addresses fields by name selector, so a renamed or
    /// misspelled field is NOT a compile error — it silently reads a slot that
    /// was never written and returns 0. Pin the mapping against the real model.
    #[test]
    fn test_parcel_placement_matches_parcel() {
        let (mut world, _ws) = setup();

        let owner: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
        let written = Parcel {
            parcel_id: 7, col: 3, row: 5, parcel_type: 1, owner, is_home: true,
        };
        world.write_model_test(@written);

        let placement: ParcelPlacement = world
            .read_schema(Model::<Parcel>::ptr_from_keys(7_u32));

        assert(placement.col == 3, 'placement col mismatch');
        assert(placement.row == 5, 'placement row mismatch');
        assert(placement.owner == owner, 'placement owner mismatch');

        // An unwritten parcel must read as zeroes, not as garbage — this is the
        // case the sweep relies on to detect unclaimed land.
        let empty: ParcelPlacement = world
            .read_schema(Model::<Parcel>::ptr_from_keys(8_u32));
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        assert(empty.owner == zero_addr, 'empty owner should be zero');
    }

    /// Gas canary: registration at mainnet grid size. The number printed for
    /// this test is the one that matters — it is the sponsored onboarding
    /// transaction, and the paymaster starts refusing work around 100M L2 gas.
    #[test]
    fn test_register_player_at_mainnet_grid() {
        let (mut world, ws) = setup();
        init_mainnet_grid(ws);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 96, 'grid should be 96 parcels');

        let player: starknet::ContractAddress = 0xA1.try_into().unwrap();
        starknet::testing::set_account_contract_address(player);
        starknet::testing::set_contract_address(player);
        ws.register_player(array![0, 1, 2]);

        let kingdom: PlayerKingdom = world.read_model(player);
        assert(kingdom.registered, 'should be registered');
        assert(kingdom.parcel_count == 3, 'should hold 3 parcels');

        // Homes must be distinct and typed as requested.
        assert(kingdom.home_0 != kingdom.home_1, 'homes 0/1 must differ');
        assert(kingdom.home_1 != kingdom.home_2, 'homes 1/2 must differ');
        assert(kingdom.home_0 != kingdom.home_2, 'homes 0/2 must differ');

        let h0: Parcel = world.read_model(kingdom.home_0);
        let h1: Parcel = world.read_model(kingdom.home_1);
        let h2: Parcel = world.read_model(kingdom.home_2);
        assert(h0.owner == player, 'home 0 owner wrong');
        assert(h1.owner == player, 'home 1 owner wrong');
        assert(h2.owner == player, 'home 2 owner wrong');
        assert(h0.is_home && h1.is_home && h2.is_home, 'homes must be flagged');
        assert(h0.parcel_type == 0, 'home 0 type wrong');
        assert(h1.parcel_type == 1, 'home 1 type wrong');
        assert(h2.parcel_type == 2, 'home 2 type wrong');
    }

    /// Second registration on a populated grid — this is the expensive case,
    /// because the anchor selection compares every unclaimed parcel against
    /// every claimed one.
    #[test]
    fn test_second_register_at_mainnet_grid() {
        let (mut world, ws) = setup();
        init_mainnet_grid(ws);

        let first: starknet::ContractAddress = 0xA1.try_into().unwrap();
        starknet::testing::set_account_contract_address(first);
        starknet::testing::set_contract_address(first);
        ws.register_player(array![0, 1, 2]);

        let second: starknet::ContractAddress = 0xA2.try_into().unwrap();
        starknet::testing::set_account_contract_address(second);
        starknet::testing::set_contract_address(second);
        ws.register_player(array![2, 1, 0]);

        let kingdom: PlayerKingdom = world.read_model(second);
        assert(kingdom.registered, 'second should be registered');
        assert(kingdom.parcel_count == 3, 'second should hold 3');

        // The two players must not share a home parcel.
        let first_kingdom: PlayerKingdom = world.read_model(first);
        assert(kingdom.home_0 != first_kingdom.home_0, 'home collision 0');
        assert(kingdom.home_0 != first_kingdom.home_1, 'home collision 1');
        assert(kingdom.home_0 != first_kingdom.home_2, 'home collision 2');
    }
}
