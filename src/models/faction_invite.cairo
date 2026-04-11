use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionInvite {
    #[key]
    pub target: ContractAddress,
    #[key]
    pub faction_id: u32,
    pub invited_by: ContractAddress,
    pub invited_at: u64,
    pub used: bool,
}
