// Mock account contract used as the `to` address for mint tests.
//
// `ERC1155Component::mint_with_acceptance_check` performs an SRC5 call on the
// recipient: if it supports `IERC1155_RECEIVER_ID` the recipient must also
// return that constant from `on_erc1155_received`; otherwise the component
// falls back to checking `ISRC6_ID` (account contract). We take the account
// path — it's the minimal surface area.
#[starknet::contract]
pub mod MockAccount {
    // ISRC6 interface id (Starknet account). See
    // openzeppelin_interfaces::accounts::ISRC6_ID.
    const ISRC6_ID: felt252 =
        0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC6_ID
        }
    }
}

#[cfg(test)]
mod tests {
    use starknet::ContractAddress;
    use starknet::syscalls::deploy_syscall;
    use starknet::SyscallResultTrait;
    use core::serde::Serde;
    use siege_dojo::tokens::ability_token::{
        AbilityToken,
        IAbilityTokenDispatcher,
        IAbilityTokenDispatcherTrait,
    };
    use super::MockAccount;

    // Local ERC-1155 dispatcher trait covering just the read methods we need.
    // Defined inline so we don't need `openzeppelin_interfaces` as a direct
    // Scarb dep — the contract still speaks the full standard ABI via
    // ERC1155MixinImpl, we just need these selectors for test assertions.
    #[starknet::interface]
    trait IERC1155Like<T> {
        fn balance_of(self: @T, account: ContractAddress, token_id: u256) -> u256;
        fn uri(self: @T, token_id: u256) -> ByteArray;
    }

    const ADMIN: felt252 = 0xADAD;
    const MINTER: felt252 = 0xB0B;
    const BURNER: felt252 = 0xC0DE;

    fn deploy_token() -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher) {
        let admin: ContractAddress = ADMIN.try_into().unwrap();
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let base_uri: ByteArray = "https://example.test/{id}";
        base_uri.serialize(ref calldata);

        let (addr, _) = deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            calldata.span(),
            false,
        )
            .unwrap_syscall();

        (
            IAbilityTokenDispatcher { contract_address: addr },
            IERC1155LikeDispatcher { contract_address: addr },
        )
    }

    // Deploys a mock SRC6 account contract and returns its address.
    // We use a salt counter so repeated calls inside one test don't collide.
    fn deploy_user() -> ContractAddress {
        let (addr, _) = deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        )
            .unwrap_syscall();
        addr
    }

    fn set_caller(addr: felt252) {
        starknet::testing::set_contract_address(addr.try_into().unwrap());
    }

    fn set_caller_addr(addr: ContractAddress) {
        starknet::testing::set_contract_address(addr);
    }

    #[test]
    fn test_admin_is_set_at_deploy() {
        let (token, _erc1155) = deploy_token();
        let admin: ContractAddress = ADMIN.try_into().unwrap();
        assert(token.admin() == admin, 'Admin mismatch');
    }

    #[test]
    fn test_minter_and_burner_default_to_zero() {
        let (token, _erc1155) = deploy_token();
        let zero: ContractAddress = 0.try_into().unwrap();
        assert(token.minter() == zero, 'Minter should be zero');
        assert(token.burner() == zero, 'Burner should be zero');
    }

    #[test]
    fn test_admin_can_set_minter() {
        let (token, _erc1155) = deploy_token();
        set_caller(ADMIN);
        let new_minter: ContractAddress = MINTER.try_into().unwrap();
        token.set_minter(new_minter);
        assert(token.minter() == new_minter, 'Minter not updated');
    }

    #[test]
    #[should_panic(expected: ('Not admin', 'ENTRYPOINT_FAILED'))]
    fn test_non_admin_cannot_set_minter() {
        let (token, _erc1155) = deploy_token();
        // A random caller address that is not the admin.
        set_caller(0x1234);
        let new_minter: ContractAddress = MINTER.try_into().unwrap();
        token.set_minter(new_minter);
    }

    #[test]
    fn test_authorized_minter_can_mint() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        let user = deploy_user();
        set_caller(MINTER);
        token.mint(user, 1_u256, 1_u256);

        assert(erc1155.balance_of(user, 1_u256) == 1_u256, 'Balance mismatch');
    }

    #[test]
    #[should_panic(expected: ('Not minter', 'ENTRYPOINT_FAILED'))]
    fn test_unauthorized_minter_cannot_mint() {
        let (token, _erc1155) = deploy_token();
        let user = deploy_user();
        // No set_minter call — minter is still 0x0
        set_caller(MINTER);
        token.mint(user, 1_u256, 1_u256);
    }

    #[test]
    fn test_token_ids_isolated() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        let user = deploy_user();
        set_caller(MINTER);
        token.mint(user, 1_u256, 3_u256);
        token.mint(user, 2_u256, 5_u256);

        assert(erc1155.balance_of(user, 1_u256) == 3_u256, 'ID 1 balance wrong');
        assert(erc1155.balance_of(user, 2_u256) == 5_u256, 'ID 2 balance wrong');
        assert(erc1155.balance_of(user, 3_u256) == 0_u256, 'ID 3 should be 0');
    }

    #[test]
    #[should_panic(expected: ('Not burner', 'ENTRYPOINT_FAILED'))]
    fn test_burn_blocked_when_burner_unset() {
        let (token, _erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        let user = deploy_user();
        set_caller(MINTER);
        token.mint(user, 1_u256, 1_u256);

        // Burner is still 0x0, nobody can burn
        set_caller(BURNER);
        token.burn(user, 1_u256, 1_u256);
    }

    #[test]
    fn test_authorized_burner_can_burn() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());
        token.set_burner(BURNER.try_into().unwrap());

        let user = deploy_user();
        set_caller(MINTER);
        token.mint(user, 1_u256, 2_u256);

        set_caller(BURNER);
        token.burn(user, 1_u256, 1_u256);

        assert(erc1155.balance_of(user, 1_u256) == 1_u256, 'Burn did not decrement');
    }

    #[test]
    fn test_admin_can_update_base_uri() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        let new_uri: ByteArray = "https://other.test/{id}";
        token.set_base_uri(new_uri);
        // uri(1) should now return the new base URI string verbatim.
        let returned = erc1155.uri(1_u256);
        assert(returned == "https://other.test/{id}", 'URI not updated');
    }
}
