use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerAbilities {
    #[key]
    pub player: ContractAddress,
    pub siege_sword: u8,
    pub stone_cloak: u8,
    pub ember_blast: u8,
    pub hex: u8,
    pub fortify: u8,
}
