// Stark-key account for headless agents on the self-hosted katana. Katana's
// predeployed dev-account class has no SRC5, so ERC-1155 acceptance checks
// (AbilityToken starter mints in register_player) reject it. This OZ account
// registers ISRC6 via SRC5, which passes mint_with_acceptance_check.
//
// Cartridge headless sessions can't be created for a custom chain id, so the
// MCP agent signs with this account directly (fee-less chain, no sponsorship).
// Plain Starknet contract — built by sozo, never migrated; deployed by
// scripts/deploy-agent-account.ts. Dev chains only.
#[starknet::contract(account)]
pub mod DevAgentAccount {
    use openzeppelin_account::AccountComponent;
    use openzeppelin_introspection::src5::SRC5Component;

    component!(path: AccountComponent, storage: account, event: AccountEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl AccountMixinImpl = AccountComponent::AccountMixinImpl<ContractState>;
    impl AccountInternalImpl = AccountComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        account: AccountComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccountEvent: AccountComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, public_key: felt252) {
        self.account.initializer(public_key);
    }
}
