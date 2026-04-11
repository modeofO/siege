use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionMember {
    #[key]
    pub player: ContractAddress,
    pub faction_id: u32,
    pub joined_at: u64,
    pub last_leave_time: u64,
}
