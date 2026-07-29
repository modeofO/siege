use starknet::ContractAddress;

/// Read-only subset of `Parcel` holding just what a spatial sweep needs.
///
/// Two reasons this exists. Reading it instead of the whole model drops 2 of
/// the 5 storage reads per parcel (dojo gives every model member its own
/// storage key), and `read_schemas` fetches an entire sweep in ONE world call
/// instead of one call per parcel — the call boundary is what dominates.
///
/// The field names MUST match `Parcel` exactly: dojo addresses schema fields
/// by `get_selector_from_name(field_name)`, so a typo is not a compile error.
/// It silently reads a slot that was never written and hands back 0.
/// `test_parcel_placement_matches_parcel` guards that.
#[derive(Copy, Drop, Serde, Introspect, DojoStore)]
pub struct ParcelPlacement {
    pub col: u16,
    pub row: u16,
    pub owner: ContractAddress,
}

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Parcel {
    #[key]
    pub parcel_id: u32,
    pub col: u16,
    pub row: u16,
    pub parcel_type: u8, // 0=Forge, 1=Quarry, 2=Grove
    pub owner: ContractAddress, // zero address = unclaimed
    pub is_home: bool,
}
