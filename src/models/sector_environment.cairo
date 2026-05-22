#[dojo::model]
#[derive(Drop, Serde)]
pub struct SectorEnvironment {
    #[key]
    pub sector_id: u8, // 0-7
    pub effect_type: u8, // 0=none, 1=drip_boost, 2=defense_debuff, 3=conquest_cost
    pub effect_magnitude: u8,
}
