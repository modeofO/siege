use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResourceConfig {
    #[key]
    pub id: u8, // always 0
    pub iron: ContractAddress,
    pub linen: ContractAddress,
    pub stone: ContractAddress,
    pub wood: ContractAddress,
    pub ember: ContractAddress,
    pub seeds: ContractAddress,
    pub ability_token: ContractAddress,
    pub vrf_provider: ContractAddress,
}
