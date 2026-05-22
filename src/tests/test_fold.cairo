#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait,
        WorldStorageTestTrait,
    };
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::tile_adjacency::{TileAdjacency, m_TileAdjacency};
    use siege_dojo::models::fold_event::{FoldEvent, m_FoldEvent};
    use siege_dojo::models::sector_environment::{SectorEnvironment, m_SectorEnvironment};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_TileAdjacency::TEST_CLASS_HASH),
                TestResource::Model(m_FoldEvent::TEST_CLASS_HASH),
                TestResource::Model(m_SectorEnvironment::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn setup() -> dojo::world::WorldStorage {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits([].span());
        world
    }

    #[test]
    fn test_world_fold_toggles() {
        let mut world = setup();

        world.write_model_test(@WorldConfig {
            id: 0, total_parcels: 6, next_parcel_id: 6, initialized: true,
            is_world_folded: false, fold_epoch: 0, total_folds: 0,
        });

        let config: WorldConfig = world.read_model(0_u8);
        assert(!config.is_world_folded, 'should start unfolded');

        world.write_model_test(@WorldConfig {
            id: 0, total_parcels: 6, next_parcel_id: 6, initialized: true,
            is_world_folded: true, fold_epoch: 1, total_folds: 1,
        });

        let config2: WorldConfig = world.read_model(0_u8);
        assert(config2.is_world_folded, 'should be folded');
        assert(config2.fold_epoch == 1, 'epoch should be 1');
    }

    #[test]
    fn test_fold_event_stored() {
        let mut world = setup();

        world.write_model_test(@FoldEvent {
            fold_id: 1,
            fold_type: 0,
            axis: 2,
            trigger_match: 42,
            timestamp: 1000,
        });

        let event: FoldEvent = world.read_model(1_u32);
        assert(event.fold_type == 0, 'should be sector fold');
        assert(event.axis == 2, 'axis should be 2');
        assert(event.trigger_match == 42, 'match should be 42');
    }

    #[test]
    fn test_parcel_stranded_flag() {
        let mut world = setup();

        let zero: starknet::ContractAddress = 0.try_into().unwrap();
        world.write_model_test(@Parcel {
            tile_id: 0, sector_id: 0, tile_shape: 0, zone: 2,
            parcel_type: 255, owner: zero, is_home: false, is_stranded: false,
        });

        let mut parcel: Parcel = world.read_model(0_u32);
        assert(!parcel.is_stranded, 'should not be stranded');

        parcel.is_stranded = true;
        world.write_model_test(@parcel);

        let parcel2: Parcel = world.read_model(0_u32);
        assert(parcel2.is_stranded, 'should be stranded');
    }

    #[test]
    fn test_tile_adjacency_model() {
        let mut world = setup();

        // Write bidirectional adjacency: tile 0 <-> tile 1
        world.write_model_test(@TileAdjacency {
            tile_id: 0, edge_index: 0, neighbor_tile_id: 1,
        });
        world.write_model_test(@TileAdjacency {
            tile_id: 1, edge_index: 0, neighbor_tile_id: 0,
        });

        let adj_0: TileAdjacency = world.read_model((0_u32, 0_u8));
        assert(adj_0.neighbor_tile_id == 1, 'tile 0 edge 0 should be tile 1');

        let adj_1: TileAdjacency = world.read_model((1_u32, 0_u8));
        assert(adj_1.neighbor_tile_id == 0, 'tile 1 edge 0 should be tile 0');

        // Verify is_adjacent utility
        assert(
            siege_dojo::utils::tile_graph::is_adjacent(@world, 0, 1),
            'tiles 0 and 1 should be adj',
        );
        assert(
            !siege_dojo::utils::tile_graph::is_adjacent(@world, 0, 2),
            'tiles 0 and 2 should not be adj',
        );
    }

    #[test]
    fn test_sector_environment_model() {
        let mut world = setup();

        world.write_model_test(@SectorEnvironment {
            sector_id: 3,
            effect_type: 1,      // drip_boost
            effect_magnitude: 2,
        });

        let env: SectorEnvironment = world.read_model(3_u8);
        assert(env.effect_type == 1, 'effect_type should be 1');
        assert(env.effect_magnitude == 2, 'magnitude should be 2');
    }

    #[test]
    fn test_parcel_new_fields() {
        let mut world = setup();

        let zero: starknet::ContractAddress = 0.try_into().unwrap();
        world.write_model_test(@Parcel {
            tile_id: 5, sector_id: 3, tile_shape: 1, zone: 0,
            parcel_type: 1, owner: zero, is_home: false, is_stranded: false,
        });

        let p: Parcel = world.read_model(5_u32);
        assert(p.tile_id == 5, 'tile_id wrong');
        assert(p.sector_id == 3, 'sector_id wrong');
        assert(p.tile_shape == 1, 'tile_shape wrong (rhombus)');
        assert(p.zone == 0, 'zone wrong (core)');
        assert(p.parcel_type == 1, 'parcel_type wrong (quarry)');
    }

    #[test]
    fn test_world_config_fold_fields() {
        let mut world = setup();

        world.write_model_test(@WorldConfig {
            id: 0, total_parcels: 34, next_parcel_id: 34, initialized: true,
            is_world_folded: false, fold_epoch: 0, total_folds: 0,
        });

        let mut config: WorldConfig = world.read_model(0_u8);
        assert(config.total_folds == 0, 'total_folds init 0');

        // Simulate 3 folds
        config.is_world_folded = true;
        config.fold_epoch = 3;
        config.total_folds = 3;
        world.write_model_test(@config);

        let config2: WorldConfig = world.read_model(0_u8);
        assert(config2.is_world_folded, 'should be folded');
        assert(config2.fold_epoch == 3, 'epoch should be 3');
        assert(config2.total_folds == 3, 'total_folds should be 3');
    }
}
