use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerReputation {
    #[key]
    pub player: ContractAddress,
    pub total_losses: u32,
    pub current_streak: i32,
    pub best_streak: u32,
    pub bracket: u8,
}
