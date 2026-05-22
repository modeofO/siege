#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait,
        WorldStorageTestTrait,
    };
    use siege_dojo::models::tile_adjacency::{TileAdjacency, m_TileAdjacency};
    use siege_dojo::utils::tile_graph;

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_TileAdjacency::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn setup() -> dojo::world::WorldStorage {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits([].span());

        // Create a small graph: 4 tiles in a line
        // Tile 0 -- Tile 1 -- Tile 2 -- Tile 3
        world.write_model_test(@TileAdjacency { tile_id: 0, edge_index: 0, neighbor_tile_id: 1 });
        world.write_model_test(@TileAdjacency { tile_id: 1, edge_index: 0, neighbor_tile_id: 0 });
        world.write_model_test(@TileAdjacency { tile_id: 1, edge_index: 1, neighbor_tile_id: 2 });
        world.write_model_test(@TileAdjacency { tile_id: 2, edge_index: 0, neighbor_tile_id: 1 });
        world.write_model_test(@TileAdjacency { tile_id: 2, edge_index: 1, neighbor_tile_id: 3 });
        world.write_model_test(@TileAdjacency { tile_id: 3, edge_index: 0, neighbor_tile_id: 2 });

        world
    }

    #[test]
    fn test_is_adjacent_direct_neighbors() {
        let world = setup();
        assert(tile_graph::is_adjacent(@world, 0, 1), 'tiles 0-1 should be adjacent');
        assert(tile_graph::is_adjacent(@world, 1, 2), 'tiles 1-2 should be adjacent');
    }

    #[test]
    fn test_is_adjacent_non_neighbors() {
        let world = setup();
        assert(!tile_graph::is_adjacent(@world, 0, 2), 'tiles 0-2 not adjacent');
        assert(!tile_graph::is_adjacent(@world, 0, 3), 'tiles 0-3 not adjacent');
    }

    #[test]
    fn test_get_neighbors() {
        let world = setup();
        let neighbors = tile_graph::get_neighbors(@world, 1);
        assert(neighbors.len() == 2, 'tile 1 should have 2 neighbors');
    }

    #[test]
    fn test_get_neighbors_boundary_tile() {
        let world = setup();
        let neighbors = tile_graph::get_neighbors(@world, 0);
        assert(neighbors.len() == 1, 'tile 0 should have 1 neighbor');
    }
}
