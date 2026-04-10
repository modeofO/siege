use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PresetDefense {
    #[key]
    pub player: ContractAddress,
    // Preset 0 (Polis+)
    pub p0_p0: u8, pub p0_p1: u8, pub p0_p2: u8,
    pub p0_g0: u8, pub p0_g1: u8, pub p0_g2: u8,
    // Preset 1 (Strategos+)
    pub p1_p0: u8, pub p1_p1: u8, pub p1_p2: u8,
    pub p1_g0: u8, pub p1_g1: u8, pub p1_g2: u8,
    // Preset 2 (Hegemonia+)
    pub p2_p0: u8, pub p2_p1: u8, pub p2_p2: u8,
    pub p2_g0: u8, pub p2_g1: u8, pub p2_g2: u8,
    // Preset 3 (Basileia only)
    pub p3_p0: u8, pub p3_p1: u8, pub p3_p2: u8,
    pub p3_g0: u8, pub p3_g1: u8, pub p3_g2: u8,
    pub preset_count: u8,
}
