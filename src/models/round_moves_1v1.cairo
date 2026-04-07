#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundMoves1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub commit_count: u8,
    pub reveal_count: u8,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub a_p0: u8, pub a_p1: u8, pub a_p2: u8,
    pub a_g0: u8, pub a_g1: u8, pub a_g2: u8,
    pub a_repair: u8,
    pub a_nc0: u8, pub a_nc1: u8, pub a_nc2: u8,
    pub b_p0: u8, pub b_p1: u8, pub b_p2: u8,
    pub b_g0: u8, pub b_g1: u8, pub b_g2: u8,
    pub b_repair: u8,
    pub b_nc0: u8, pub b_nc1: u8, pub b_nc2: u8,
    // Ability activation per round (Phase 2B)
    pub a_ability_id: u8,    // 0 = none, 1-5 = ability activated
    pub a_ability_target: u8, // 0-2 = target gate (Siege Sword only)
    pub b_ability_id: u8,
    pub b_ability_target: u8,
}
