use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Pillage {
    #[key]
    pub home_parcel_id: u32,
    pub pillager: ContractAddress,
    pub target: ContractAddress,
    pub start_time: u64,
    pub expires_at: u64,
    pub last_claim_time: u64,
    pub active: bool,
}
