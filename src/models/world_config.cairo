#[dojo::model]
#[derive(Drop, Serde)]
pub struct WorldConfig {
    #[key]
    pub id: u8, // always 0
    pub total_parcels: u32,
    pub next_parcel_id: u32,
    pub initialized: bool,
}
