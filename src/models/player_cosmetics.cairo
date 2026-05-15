use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerCosmetics {
    #[key]
    pub player: ContractAddress,
    pub banner: felt252,
    pub parcel_skin: felt252,
    pub hold_decoration: felt252,
}
