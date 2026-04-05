// AbilityToken — ERC-1155 for crafted gameplay abilities.
//
// Token ID = ability ID (1=Siege Sword, 2=Stone Cloak, 3=Ember Blast, 4=Hex, 5=Fortify).
// Three roles:
//   - admin: can rotate minter/burner/base_uri (set at constructor, immutable)
//   - minter: can call mint (set by admin post-deploy — usually crafting_1v1)
//   - burner: can call burn (set by admin when Phase 2B ships — starts at 0x0)
//
// Standard ERC-1155 read/transfer methods (balance_of, balance_of_batch,
// safe_transfer_from, uri, etc.) come from ERC1155MixinImpl.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IAbilityToken<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
    fn set_minter(ref self: T, new_minter: ContractAddress);
    fn set_burner(ref self: T, new_burner: ContractAddress);
    fn set_base_uri(ref self: T, new_uri: ByteArray);
    fn admin(self: @T) -> ContractAddress;
    fn minter(self: @T) -> ContractAddress;
    fn burner(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod AbilityToken {
    use core::num::traits::Zero;
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc1155::{ERC1155Component, ERC1155HooksEmptyImpl};

    component!(path: ERC1155Component, storage: erc1155, event: ERC1155Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // ERC-1155 mixin provides balance_of, balance_of_batch, safe_transfer_from, uri, etc.
    // (Also provides supports_interface via the embedded SRC5 — do not embed SRC5Impl
    // separately or the contract will have duplicate entry points.)
    #[abi(embed_v0)]
    impl ERC1155MixinImpl = ERC1155Component::ERC1155MixinImpl<ContractState>;
    impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc1155: ERC1155Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        admin_address: ContractAddress,
        minter_address: ContractAddress,
        burner_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC1155Event: ERC1155Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        base_uri: ByteArray,
    ) {
        assert(admin.is_non_zero(), 'Admin cannot be zero');
        self.erc1155.initializer(base_uri);
        self.admin_address.write(admin);
        // minter_address and burner_address default to 0x0.
        // Until set_minter is called, no mints will succeed.
        // Until set_burner is called, no burns will succeed (correct for Phase 2A.5).
    }

    #[abi(embed_v0)]
    impl AbilityTokenImpl of super::IAbilityToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, token_id: u256, amount: u256) {
            assert(get_caller_address() == self.minter_address.read(), 'Not minter');
            self.erc1155.mint_with_acceptance_check(to, token_id, amount, array![].span());
        }

        // NOTE: burner is fully trusted — it can burn tokens from ANY address, not
        // just the caller. The burner role should only be assigned to a contract
        // that enforces "burn only from the token holder's own address" as an
        // internal invariant. Phase 2B's ability-consume contract will do this.
        fn burn(ref self: ContractState, from: ContractAddress, token_id: u256, amount: u256) {
            assert(get_caller_address() == self.burner_address.read(), 'Not burner');
            self.erc1155.burn(from, token_id, amount);
        }

        fn set_minter(ref self: ContractState, new_minter: ContractAddress) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.minter_address.write(new_minter);
        }

        fn set_burner(ref self: ContractState, new_burner: ContractAddress) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.burner_address.write(new_burner);
        }

        fn set_base_uri(ref self: ContractState, new_uri: ByteArray) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.erc1155._set_base_uri(new_uri);
        }

        fn admin(self: @ContractState) -> ContractAddress {
            self.admin_address.read()
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter_address.read()
        }

        fn burner(self: @ContractState) -> ContractAddress {
            self.burner_address.read()
        }
    }
}
