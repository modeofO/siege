use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Parcel {
    #[key]
    pub tile_id: u32,
    pub sector_id: u8,       // 0-7 — which sector wedge
    pub tile_shape: u8,      // 0=square, 1=rhombus
    pub zone: u8,            // 0=core, 1=mid, 2=frontier
    pub parcel_type: u8,     // 0=Forge, 1=Quarry, 2=Grove, 255=untyped
    pub owner: ContractAddress, // zero address = unclaimed
    pub is_home: bool,
    pub is_stranded: bool,
}
