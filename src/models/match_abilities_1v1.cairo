#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchAbilities1v1 {
    #[key]
    pub match_id: u64,
    // Abilities each player brought (ability type IDs 1-5, 0 = empty slot)
    pub a_ability_1: u8,
    pub a_ability_2: u8,
    pub a_ability_3: u8,
    pub b_ability_1: u8,
    pub b_ability_2: u8,
    pub b_ability_3: u8,
    // Track which slots have been used (one-time per match)
    pub a_used_1: bool,
    pub a_used_2: bool,
    pub a_used_3: bool,
    pub b_used_1: bool,
    pub b_used_2: bool,
    pub b_used_3: bool,
}
