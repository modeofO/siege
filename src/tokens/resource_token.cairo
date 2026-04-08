#[starknet::interface]
pub trait IResourceToken<TContractState> {
    fn mint(ref self: TContractState, to: starknet::ContractAddress, amount: u256);
    fn minter(self: @TContractState) -> starknet::ContractAddress;
    fn set_minter2(ref self: TContractState, new_minter2: starknet::ContractAddress);
    fn minter2(self: @TContractState) -> starknet::ContractAddress;
}

#[starknet::contract]
pub mod ResourceToken {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};

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
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,
        symbol: ByteArray,
        minter: ContractAddress,
    ) {
        self.erc20.initializer(name, symbol);
        self.minter_address.write(minter);
    }

    #[abi(embed_v0)]
    impl ResourceTokenImpl of super::IResourceToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let caller = get_caller_address();
            assert(
                caller == self.minter_address.read() || caller == self.minter2_address.read(),
                'Only minter can mint',
            );
            self.erc20.mint(to, amount);
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter_address.read()
        }

        fn set_minter2(ref self: ContractState, new_minter2: ContractAddress) {
            assert(get_caller_address() == self.minter_address.read(), 'Only minter can set minter2');
            self.minter2_address.write(new_minter2);
        }

        fn minter2(self: @ContractState) -> ContractAddress {
            self.minter2_address.read()
        }
    }
}
