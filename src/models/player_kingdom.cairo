use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerKingdom {
    #[key]
    pub player: ContractAddress,
    pub home_0: u32,
    pub home_1: u32,
    pub home_2: u32,
    pub parcel_count: u32,
    pub registered: bool,
    pub free_craft_used: bool,
    pub last_drip_time: u64,
    pub tier: u8,
    pub total_wins: u32,
    pub faction_reinforcement_enabled: bool,
}
