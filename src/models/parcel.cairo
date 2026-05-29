use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Parcel {
    #[key]
    pub parcel_id: u32,
    pub col: u16,
    pub row: u16,
    pub parcel_type: u8, // 0=Forge, 1=Quarry, 2=Grove
    pub owner: ContractAddress, // zero address = unclaimed
    pub is_home: bool,
}
