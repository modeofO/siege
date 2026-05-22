#[dojo::model]
#[derive(Drop, Serde)]
pub struct TileAdjacency {
    #[key]
    pub tile_id: u32,
    #[key]
    pub edge_index: u8, // 0..3 (4 edges per tile)
    pub neighbor_tile_id: u32, // 0xFFFFFFFF = no neighbor (boundary edge)
}
