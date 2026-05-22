use dojo::model::ModelStorage;
use siege_dojo::models::tile_adjacency::TileAdjacency;

const NO_NEIGHBOR: u32 = 0xFFFFFFFF;
const MAX_EDGES: u8 = 4;

pub fn is_adjacent(world: @dojo::world::WorldStorage, tile_a: u32, tile_b: u32) -> bool {
    let mut i: u8 = 0;
    let mut found = false;
    while i < MAX_EDGES {
        if !found {
            let adj: TileAdjacency = world.read_model((tile_a, i));
            if adj.neighbor_tile_id == tile_b {
                found = true;
            }
        }
        i += 1;
    };
    found
}

pub fn get_neighbors(world: @dojo::world::WorldStorage, tile_id: u32) -> Array<u32> {
    let mut neighbors: Array<u32> = ArrayTrait::new();
    let mut i: u8 = 0;
    while i < MAX_EDGES {
        let adj: TileAdjacency = world.read_model((tile_id, i));
        if adj.neighbor_tile_id != NO_NEIGHBOR {
            neighbors.append(adj.neighbor_tile_id);
        }
        i += 1;
    };
    neighbors
}
