#[cfg(test)]
mod tests {
    use core::serde::Serde;
    use siege_dojo::tokens::resource_token::{
        IResourceTokenDispatcher, IResourceTokenDispatcherTrait, ResourceToken,
    };
    use starknet::{ContractAddress, SyscallResultTrait};

    #[starknet::interface]
    trait IERC20Like<T> {
        fn balance_of(self: @T, account: ContractAddress) -> u256;
    }

    const ADMIN: felt252 = 0xA11CE;
    const OPERATOR_A: felt252 = 0xB0B;
    const OPERATOR_B: felt252 = 0xC0DE;
    const USER: felt252 = 0x1234;

    fn deploy_token() -> (IResourceTokenDispatcher, IERC20LikeDispatcher) {
        let admin: ContractAddress = ADMIN.try_into().unwrap();
        let name: ByteArray = "Iron";
        let symbol: ByteArray = "IRON";
        let mut calldata: Array<felt252> = array![];
        name.serialize(ref calldata);
        symbol.serialize(ref calldata);
        admin.serialize(ref calldata);

        let (addr, _) = starknet::syscalls::deploy_syscall(
            ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        )
            .unwrap_syscall();

        (
            IResourceTokenDispatcher { contract_address: addr },
            IERC20LikeDispatcher { contract_address: addr },
        )
    }

    fn set_caller(addr: felt252) {
        starknet::testing::set_contract_address(addr.try_into().unwrap());
    }

    #[test]
    fn test_admin_can_authorize_multiple_resource_operators() {
        let (token, erc20) = deploy_token();
        let operator_a: ContractAddress = OPERATOR_A.try_into().unwrap();
        let operator_b: ContractAddress = OPERATOR_B.try_into().unwrap();
        let user: ContractAddress = USER.try_into().unwrap();

        set_caller(ADMIN);
        token.set_authorized_operator(operator_a, true);
        token.set_authorized_operator(operator_b, true);
        assert(token.is_authorized_operator(operator_a), 'operator a not authorized');
        assert(token.is_authorized_operator(operator_b), 'operator b not authorized');

        set_caller(OPERATOR_A);
        token.mint(user, 7_u256);
        assert(erc20.balance_of(user) == 7_u256, 'mint failed');

        set_caller(OPERATOR_B);
        token.burn(user, 2_u256);
        assert(erc20.balance_of(user) == 5_u256, 'burn failed');
    }

    #[test]
    fn test_admin_can_revoke_resource_operator() {
        let (token, _erc20) = deploy_token();
        let operator: ContractAddress = OPERATOR_A.try_into().unwrap();

        set_caller(ADMIN);
        token.set_authorized_operator(operator, true);
        assert(token.is_authorized_operator(operator), 'operator not authorized');

        token.set_authorized_operator(operator, false);
        assert(!token.is_authorized_operator(operator), 'operator still authorized');
    }

    #[test]
    #[should_panic(expected: ('Only minter can authorize', 'ENTRYPOINT_FAILED'))]
    fn test_non_admin_cannot_authorize_resource_operator() {
        let (token, _erc20) = deploy_token();
        let operator: ContractAddress = OPERATOR_A.try_into().unwrap();

        set_caller(OPERATOR_B);
        token.set_authorized_operator(operator, true);
    }

    #[test]
    #[should_panic(expected: ('Not resource operator', 'ENTRYPOINT_FAILED'))]
    fn test_unauthorized_account_cannot_mint() {
        let (token, _erc20) = deploy_token();
        let user: ContractAddress = USER.try_into().unwrap();

        set_caller(OPERATOR_A);
        token.mint(user, 1_u256);
    }
}
