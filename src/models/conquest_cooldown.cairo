use starknet::ContractAddress;

// Per-attacker conquest rate limit. `initiate_conquest` refuses to run again
// until CONQUEST_COOLDOWN seconds after the last attempt (win or loss), so an
// attacker can't spam a bordering parcel to farm VRF variance for free.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct ConquestCooldown {
    #[key]
    pub player: ContractAddress,
    pub last_attack_time: u64,
}
