#[dojo::model]
#[derive(Drop, Serde)]
pub struct FoldEvent {
    #[key]
    pub fold_id: u32,
    pub fold_type: u8, // 0=sector, 1=world
    pub axis: u8,
    pub trigger_match: u64,
    pub timestamp: u64,
}
