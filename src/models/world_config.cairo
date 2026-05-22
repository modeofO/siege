#[dojo::model]
#[derive(Drop, Serde)]
pub struct WorldConfig {
    #[key]
    pub id: u8, // always 0
    pub total_parcels: u32,
    pub next_parcel_id: u32,
    pub initialized: bool,
    pub is_world_folded: bool,
    pub fold_epoch: u32,
    pub total_folds: u32,
}
