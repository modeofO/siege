use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Faction {
    #[key]
    pub faction_id: u32,
    pub leader: ContractAddress,
    pub name: felt252,
    pub tag: felt252,
    pub member_count: u32,
    pub created_at: u64,
    pub dissolved: bool,
}

#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionCounter {
    #[key]
    pub id: u8,
    pub count: u32,
}
