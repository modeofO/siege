#[starknet::interface]
pub trait IResourceToken<TContractState> {
    fn mint(ref self: TContractState, to: starknet::ContractAddress, amount: u256);
    fn burn(ref self: TContractState, from: starknet::ContractAddress, amount: u256);
    fn minter(self: @TContractState) -> starknet::ContractAddress;
    fn set_minter2(ref self: TContractState, new_minter2: starknet::ContractAddress);
    fn minter2(self: @TContractState) -> starknet::ContractAddress;
    fn set_authorized_operator(
        ref self: TContractState, operator: starknet::ContractAddress, authorized: bool,
    );
    fn is_authorized_operator(self: @TContractState, operator: starknet::ContractAddress) -> bool;
}

#[starknet::contract]
pub mod ResourceToken {
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    // 0 decimals — resource tokens are whole units
    impl ERC20Config of ERC20Component::ImmutableConfig {
        const DECIMALS: u8 = 0;
    }

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        minter_address: ContractAddress,
        minter2_address: ContractAddress,
        authorized_operators: Map<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, name: ByteArray, symbol: ByteArray, minter: ContractAddress,
    ) {
        self.erc20.initializer(name, symbol);
        self.minter_address.write(minter);
    }

    fn is_resource_operator(self: @ContractState, operator: ContractAddress) -> bool {
        operator == self.minter_address.read()
            || operator == self.minter2_address.read()
            || self.authorized_operators.entry(operator).read()
    }

    #[abi(embed_v0)]
    impl ResourceTokenImpl of super::IResourceToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let caller = get_caller_address();
            assert(is_resource_operator(@self, caller), 'Not resource operator');
            self.erc20.mint(to, amount);
        }

        fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
            let caller = get_caller_address();
            assert(is_resource_operator(@self, caller), 'Not resource operator');
            self.erc20.burn(from, amount);
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter_address.read()
        }

        fn set_minter2(ref self: ContractState, new_minter2: ContractAddress) {
            assert(
                get_caller_address() == self.minter_address.read(), 'Only minter can set minter2',
            );
            self.minter2_address.write(new_minter2);
        }

        fn minter2(self: @ContractState) -> ContractAddress {
            self.minter2_address.read()
        }

        fn set_authorized_operator(
            ref self: ContractState, operator: ContractAddress, authorized: bool,
        ) {
            assert(get_caller_address() == self.minter_address.read(), 'Only minter can authorize');
            self.authorized_operators.entry(operator).write(authorized);
        }

        fn is_authorized_operator(self: @ContractState, operator: ContractAddress) -> bool {
            is_resource_operator(self, operator)
        }
    }
}
