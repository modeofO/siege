use starknet::ContractAddress;

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MoveCommitted {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub role: u8,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MoveRevealed {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub role: u8,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct RoundResolved {
    #[key]
    pub match_id: u64,
    pub round: u32,
    pub vault_a_hp: u32,
    pub vault_b_hp: u32,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MatchFinished {
    #[key]
    pub match_id: u64,
    pub winner_team: u8,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct MatchCreated1v1 {
    #[key]
    pub match_id: u64,
    pub player_a: ContractAddress,
    pub player_b: ContractAddress,
}

#[dojo::event]
#[derive(Drop, Serde)]
pub struct ConquestResolved {
    #[key]
    pub attacker: ContractAddress,
    pub target_parcel: u32,
    pub defender: ContractAddress,
    pub attacker_won: bool,
    // The ability the attacker committed (0 = none). If non-zero it was
    // consumed by this attack — abilities are single-use in conquest.
    pub ability_id: u8,
    pub ability_consumed: bool,
}
