use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
}

#[starknet::interface]
pub trait IERC20Transfer<T> {
    fn transfer_from(
        ref self: T,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait IAbilityTokenMint<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
}

#[dojo::contract]
pub mod crafting_1v1 {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use super::{IERC20TransferDispatcher, IERC20TransferDispatcherTrait};
    use super::{IAbilityTokenMintDispatcher, IAbilityTokenMintDispatcherTrait};

    // Burn sink for ERC-20 resource tokens — tokens sent here are effectively burned.
    const BURN_ADDRESS: felt252 = 0x1;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn burn_tokens(token_addr: ContractAddress, from: ContractAddress, amount: u256) {
        let mut token = IERC20TransferDispatcher { contract_address: token_addr };
        let balance = token.balance_of(from);
        assert(balance >= amount, 'Insufficient balance');
        let burn_addr: ContractAddress = BURN_ADDRESS.try_into().unwrap();
        token.transfer_from(from, burn_addr, amount);
    }

    #[abi(embed_v0)]
    impl Crafting1v1Impl of super::ICrafting1v1<ContractState> {
        fn craft_ability(ref self: ContractState, ability_id: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Read resource config for token addresses (single row keyed by id=0)
            let config: ResourceConfig = world.read_model(0_u8);

            // Check for free first craft
            let mut kingdom: PlayerKingdom = world.read_model(caller);
            let is_free = kingdom.registered && !kingdom.free_craft_used;

            if is_free {
                kingdom.free_craft_used = true;
                world.write_model(@kingdom);
            }

            if !is_free {
                // Burn resources based on ability recipe
                if ability_id == 1 {
                    // Siege Sword: 3 Iron + 2 Wood
                    burn_tokens(config.iron, caller, 3);
                    burn_tokens(config.wood, caller, 2);
                } else if ability_id == 2 {
                    // Stone Cloak: 3 Stone + 2 Linen
                    burn_tokens(config.stone, caller, 3);
                    burn_tokens(config.linen, caller, 2);
                } else if ability_id == 3 {
                    // Ember Blast: 3 Ember + 2 Seeds
                    burn_tokens(config.ember, caller, 3);
                    burn_tokens(config.seeds, caller, 2);
                } else if ability_id == 4 {
                    // Hex: 2 Iron + 2 Stone + 1 Ember
                    burn_tokens(config.iron, caller, 2);
                    burn_tokens(config.stone, caller, 2);
                    burn_tokens(config.ember, caller, 1);
                } else if ability_id == 5 {
                    // Fortify: 2 Stone + 2 Linen + 1 Wood
                    burn_tokens(config.stone, caller, 2);
                    burn_tokens(config.linen, caller, 2);
                    burn_tokens(config.wood, caller, 1);
                } else {
                    panic!("Invalid ability ID");
                }
            } else {
                // Free craft — still validate the ability ID
                assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
            }

            // Mint the ERC-1155 ability token (token_id == ability_id)
            let ability_token = IAbilityTokenMintDispatcher {
                contract_address: config.ability_token,
            };
            ability_token.mint(caller, ability_id.into(), 1_u256);
        }
    }
}
