use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
    fn craft_ability_tier2(ref self: T, ability_type: u8);
}

#[starknet::interface]
pub trait IResourceTokenBurn<T> {
    fn burn(ref self: T, from: ContractAddress, amount: u256);
}

#[starknet::interface]
pub trait IAbilityTokenMint<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
}

#[dojo::contract]
pub mod crafting_1v1 {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use super::{IResourceTokenBurnDispatcher, IResourceTokenBurnDispatcherTrait};
    use super::{IAbilityTokenMintDispatcher, IAbilityTokenMintDispatcherTrait};

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn burn_tokens(token_addr: ContractAddress, from: ContractAddress, amount: u256) {
        let token = IResourceTokenBurnDispatcher { contract_address: token_addr };
        token.burn(from, amount);
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

        fn craft_ability_tier2(ref self: ContractState, ability_type: u8) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            assert(ability_type >= 1 && ability_type <= 5, 'Invalid ability type');

            let config: ResourceConfig = world.read_model(0_u8);

            // Burn T2 recipe resources (the T1 ability is burned separately below)
            if ability_type == 1 {
                // T2 Siege Sword: 30 Iron + 20 Wood + 10 Ember
                burn_tokens(config.iron, caller, 30);
                burn_tokens(config.wood, caller, 20);
                burn_tokens(config.ember, caller, 10);
            } else if ability_type == 2 {
                // T2 Stone Cloak: 30 Stone + 20 Linen + 10 Seeds
                burn_tokens(config.stone, caller, 30);
                burn_tokens(config.linen, caller, 20);
                burn_tokens(config.seeds, caller, 10);
            } else if ability_type == 3 {
                // T2 Ember Blast: 30 Ember + 20 Seeds + 10 Iron
                burn_tokens(config.ember, caller, 30);
                burn_tokens(config.seeds, caller, 20);
                burn_tokens(config.iron, caller, 10);
            } else if ability_type == 4 {
                // T2 Hex: 20 Iron + 20 Stone + 10 Ember + 10 Wood
                burn_tokens(config.iron, caller, 20);
                burn_tokens(config.stone, caller, 20);
                burn_tokens(config.ember, caller, 10);
                burn_tokens(config.wood, caller, 10);
            } else {
                // T2 Fortify: 20 Stone + 20 Linen + 10 Wood
                burn_tokens(config.stone, caller, 20);
                burn_tokens(config.linen, caller, 20);
                burn_tokens(config.wood, caller, 10);
            }

            // Burn the T1 ability token (token ID == ability_type) and mint the T2 token
            // (T2 token ID == ability_type + 5)
            let ability_token = IAbilityTokenMintDispatcher {
                contract_address: config.ability_token,
            };
            ability_token.burn(caller, ability_type.into(), 1_u256);
            ability_token.mint(caller, (ability_type + 5).into(), 1_u256);
        }
    }
}
