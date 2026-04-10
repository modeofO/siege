use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PillageEligibility {
    #[key]
    pub winner: ContractAddress,
    #[key]
    pub match_id: u64,
    pub loser: ContractAddress,
    pub granted_at: u64,
    pub expires_at: u64,
    pub used: bool,
}
