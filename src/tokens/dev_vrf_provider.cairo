// Dev-chain VRF provider for the self-hosted katana. The Cartridge VRF service
// only exists on public networks, so ResourceConfig.vrf_provider points here on
// katana (see scripts/init-katana-world.sh). Pseudo-random only — derived from
// block data and an incrementing nonce. NEVER wire this on a public chain.
//
// Plain Starknet contract: sozo builds the artifact but does not deploy it
// (only #[dojo::contract]s migrate), so sepolia deployments are unaffected.
#[starknet::contract]
pub mod DevVrfProvider {
    use core::poseidon::poseidon_hash_span;
    use starknet::ContractAddress;
    use starknet::{get_block_info, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[derive(Drop, Copy, Clone, Serde)]
    pub enum Source {
        Nonce: ContractAddress,
        Salt: felt252,
    }

    #[storage]
    struct Storage {
        nonce: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn consume_random(ref self: ContractState, source: Source) -> felt252 {
            let nonce = self.nonce.read();
            self.nonce.write(nonce + 1);
            let seed_component = match source {
                Source::Nonce(addr) => addr.into(),
                Source::Salt(salt) => salt,
            };
            let block = get_block_info().unbox();
            poseidon_hash_span(
                array![
                    seed_component,
                    nonce,
                    block.block_number.into(),
                    get_block_timestamp().into(),
                ]
                    .span(),
            )
        }

        // Parity with the Cartridge provider interface: clients multicall
        // request_random before the consuming entrypoint. A no-op here.
        #[external(v0)]
        fn request_random(ref self: ContractState, caller: ContractAddress, source: Source) {
            let _ = caller;
            let _ = source;
        }
    }
}
