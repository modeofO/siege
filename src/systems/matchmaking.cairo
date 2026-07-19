use starknet::ContractAddress;

#[starknet::interface]
pub trait IMatchmaking<T> {
    // Returns the created match_id when the caller was paired with the
    // waiting player, or 0 when the caller was enqueued (or poked).
    fn queue_for_match(ref self: T) -> u64;
    fn leave_queue(ref self: T);
}

#[dojo::contract]
pub mod matchmaking {
    use core::num::traits::Zero;
    use starknet::{get_block_timestamp, get_caller_address, get_contract_address};
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorageTrait;
    use siege_dojo::models::match_queue::{QueueSlot, QueueStatus};
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::systems::actions_1v1::{
        IActions1v1Dispatcher, IActions1v1DispatcherTrait,
        IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source,
    };

    const VRF_PROVIDER_ADDRESS: felt252 =
        0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f;

    // Fixed validity window: a queue entry is dead this many seconds after
    // it was created (or last refreshed by an explicit re-queue). There is no
    // heartbeat — every poke would be a sponsored tx, and the paymaster bill
    // adds up. A player who walks away can be matched for up to this window;
    // the opponent recovers via the existing force_timeout zero-commit path.
    pub const STALE_SECONDS: u64 = 600;

    pub const QUEUE_STATE_IDLE: u8 = 0;
    pub const QUEUE_STATE_QUEUED: u8 = 1;
    pub const QUEUE_STATE_MATCHED: u8 = 2;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn set_queued(
        ref world: dojo::world::WorldStorage,
        player: starknet::ContractAddress,
        now: u64,
    ) {
        let mut status: QueueStatus = world.read_model(player);
        status.state = QUEUE_STATE_QUEUED;
        status.queued_at = now;
        world.write_model(@status);
    }

    #[abi(embed_v0)]
    impl MatchmakingImpl of super::IMatchmaking<ContractState> {
        fn queue_for_match(ref self: ContractState) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            // Same spam guard as create_match_1v1: queueing is free, so gate
            // it on having a registered Hold.
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            // Consume VRF unconditionally. Clients always send the
            // [request_random, queue_for_match] multicall, and the Cartridge
            // paymaster wrapper reverts on an unconsumed request — consuming
            // on every path (poke/enqueue/match) keeps the wrap valid. The
            // randomness is only used when a match is actually created.
            let config: ResourceConfig = world.read_model(0_u8);
            let vrf_addr = if config.vrf_provider.is_non_zero() {
                config.vrf_provider
            } else {
                VRF_PROVIDER_ADDRESS.try_into().unwrap()
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value = vrf.consume_random(Source::Nonce(get_contract_address()));

            let mut slot: QueueSlot = world.read_model(0_u8);

            // Re-queue: caller is already the waiting head — restart their
            // validity window (e.g. clicked Find again after expiry).
            if slot.player == caller {
                slot.queued_at = now;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            let head_empty = slot.player.is_zero();
            let head_stale = !head_empty && now > slot.queued_at + STALE_SECONDS;

            // Enqueue: nobody (live) is waiting.
            if head_empty || head_stale {
                if head_stale {
                    let mut old: QueueStatus = world.read_model(slot.player);
                    if old.state == QUEUE_STATE_QUEUED {
                        old.state = QUEUE_STATE_IDLE;
                        world.write_model(@old);
                    }
                }
                slot.player = caller;
                slot.queued_at = now;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            // Match: a live head is waiting. Waiting player becomes player_a.
            let opponent = slot.player;
            let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
            let actions = IActions1v1Dispatcher { contract_address: actions_addr };
            let match_id = actions.create_match_1v1_delegated(opponent, caller, random_value);

            slot.player = Zero::zero();
            slot.queued_at = 0;
            world.write_model(@slot);

            world.write_model(@QueueStatus {
                player: opponent,
                state: QUEUE_STATE_MATCHED,
                queued_at: 0,
                matched_match_id: match_id,
            });
            world.write_model(@QueueStatus {
                player: caller,
                state: QUEUE_STATE_MATCHED,
                queued_at: 0,
                matched_match_id: match_id,
            });

            match_id
        }

        fn leave_queue(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut slot: QueueSlot = world.read_model(0_u8);
            if slot.player == caller {
                slot.player = Zero::zero();
                slot.queued_at = 0;
                world.write_model(@slot);
            }
            // Only clear a queued status — a matched status keeps its
            // matched_match_id so a client that raced leave vs match still
            // finds its game.
            let mut status: QueueStatus = world.read_model(caller);
            if status.state == QUEUE_STATE_QUEUED {
                status.state = QUEUE_STATE_IDLE;
                world.write_model(@status);
            }
        }
    }
}
