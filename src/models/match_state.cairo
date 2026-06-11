#[derive(Drop, Copy, Serde, PartialEq, Introspect, DojoStore, Default, Debug)]
pub enum MatchStatus {
    #[default]
    Pending,
    Active,
    Finished,
}
