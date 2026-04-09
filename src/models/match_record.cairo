use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchRecord {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub opponent: ContractAddress,
    pub wins: u32,
    pub losses: u32,
    pub last_match_id: u64,
}
