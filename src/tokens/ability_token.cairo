// AbilityToken v2 — ERC-1155 with fully on-chain metadata.
//
// Token ID = ability ID (1=Siege Sword, 2=Stone Cloak, 3=Ember Blast, 4=Hex, 5=Fortify).
// uri(token_id) returns a data:application/json;base64,... URI with inline SVG image.
// No external server needed — metadata is constructed on-chain at read time.
//
// Three admin roles:
//   - admin: can rotate minter/burner and update per-ability SVGs (set at constructor, immutable)
//   - minter: can call mint (set by admin post-deploy — usually crafting_1v1)
//   - burner: can call burn (set by admin when Phase 2B ships — starts at 0x0)
//
// Phase 3 stub: get_ability_svg signature accepts (ability_type, color_seed) — the seed
// is ignored in v2 (always reads from admin-settable storage) but the parameter is in
// place for future per-token color generation.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IAbilityToken<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
    fn set_minter(ref self: T, new_minter: ContractAddress);
    fn set_burner(ref self: T, new_burner: ContractAddress);
    fn set_ability_svg(ref self: T, ability_type: u8, svg: ByteArray);
    fn admin(self: @T) -> ContractAddress;
    fn minter(self: @T) -> ContractAddress;
    fn burner(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod AbilityToken {
    use core::num::traits::Zero;
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc1155::{ERC1155Component, ERC1155HooksEmptyImpl};
    use openzeppelin_interfaces::token::erc1155::IERC1155MetadataURI;
    use siege_dojo::tokens::ability_metadata;

    component!(path: ERC1155Component, storage: erc1155, event: ERC1155Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // Selective embedding: core + camelCase, but NOT the metadata impl.
    // We provide our own uri() below that returns on-chain data URIs.
    #[abi(embed_v0)]
    impl ERC1155Impl = ERC1155Component::ERC1155Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC1155CamelImpl = ERC1155Component::ERC1155CamelImpl<ContractState>;
    impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;

    // SRC5 embedded separately — no duplicate since we're not using the mixin.
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc1155: ERC1155Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        admin_address: ContractAddress,
        minter_address: ContractAddress,
        burner_address: ContractAddress,
        ability_svgs: Map<u8, ByteArray>,
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
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert(admin.is_non_zero(), 'Admin cannot be zero');
        // Initialize with empty base URI — uri() never reads it (we override below),
        // but the component requires initializer to be called for SRC5 registration.
        self.erc1155.initializer("");
        self.admin_address.write(admin);
    }

    // Custom on-chain metadata: returns data:application/json;base64,... per token ID.
    #[abi(embed_v0)]
    impl AbilityMetadataURI of IERC1155MetadataURI<ContractState> {
        fn uri(self: @ContractState, token_id: u256) -> ByteArray {
            // Token IDs 1-10: IDs 1-5 are T1, 6-10 are T2. Anything outside returns empty.
            if token_id.high != 0 || token_id.low == 0 || token_id.low > 10 {
                return "";
            }
            let tid: u8 = token_id.low.try_into().unwrap();
            // SVG is keyed by ability type (1-5), shared across tiers
            let ability_type: u8 = ((tid - 1) % 5) + 1;
            let svg = self.ability_svgs.entry(ability_type).read();
            ability_metadata::build_ability_data_uri(tid, svg)
        }
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

        fn set_ability_svg(ref self: ContractState, ability_type: u8, svg: ByteArray) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            assert(ability_type >= 1 && ability_type <= 5, 'Invalid ability type');
            self.ability_svgs.entry(ability_type).write(svg);
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
