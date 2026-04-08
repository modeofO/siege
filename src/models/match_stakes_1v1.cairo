#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchStakes1v1 {
    #[key]
    pub match_id: u64,
    pub a_stake_1: u8,
    pub a_stake_2: u8,
    pub a_stake_3: u8,
    pub b_stake_1: u8,
    pub b_stake_2: u8,
    pub b_stake_3: u8,
    pub stake_count: u8,
    pub settled: bool,
}
