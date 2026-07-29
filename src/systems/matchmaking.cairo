use starknet::ContractAddress;

#[starknet::interface]
pub trait IMatchmaking<T> {
    // Queue for a staked auto-match, wagering 1-3 abilities. You only pair
    // with a player wagering the SAME COUNT (three single-slot sub-queues).
    // Returns the created match_id when the caller was paired with the
    // waiting player, or 0 when the caller was enqueued (or re-queued).
    // `token` selects the entry buy-in token (must be an enabled EntryToken).
    fn queue_for_match(ref self: T, token: ContractAddress, abilities: Array<u8>) -> u64;
    fn leave_queue(ref self: T);
    // Permissionless payout of a finished queue-made match's ENTRY pot.
    // Winner gets winner_bps of each side's buy-in (in that side's token),
    // treasury the remainder; a draw refunds both players in full. Ability
    // stakes are escrowed at world_system and paid out by settle_match.
    fn claim_winnings(ref self: T, match_id: u64);
    fn set_entry_config(ref self: T, winner_bps: u16, treasury: ContractAddress);
    fn set_entry_token(ref self: T, token: ContractAddress, amount: u256, enabled: bool);
}

// Standard ERC-20 surface used for entry buy-ins (STRK/LORDS/ETH conform).
#[starknet::interface]
pub trait IERC20Entry<T> {
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}

// ERC-1155 surface for ability wagers.
#[starknet::interface]
pub trait IERC1155Ability<T> {
    fn safe_transfer_from(
        ref self: T,
        from: ContractAddress,
        to: ContractAddress,
        token_id: u256,
        value: u256,
        data: Span<felt252>,
    );
    fn safe_batch_transfer_from(
        ref self: T,
        from: ContractAddress,
        to: ContractAddress,
        token_ids: Span<u256>,
        values: Span<u256>,
        data: Span<felt252>,
    );
    fn balance_of(self: @T, account: ContractAddress, token_id: u256) -> u256;
    fn is_approved_for_all(
        self: @T, owner: ContractAddress, operator: ContractAddress,
    ) -> bool;
}

#[dojo::contract]
pub mod matchmaking {
    use core::num::traits::Zero;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use dojo::model::ModelStorage;
    use dojo::world::{IWorldDispatcherTrait, WorldStorageTrait};
    use siege_dojo::models::match_queue::{
        QueueSlot, QueueStatus, EntryToken, EntryConfig, MatchPot,
    };
    use siege_dojo::models::match_abilities_1v1::MatchAbilities1v1;
    use siege_dojo::models::match_stakes_1v1::MatchStakes1v1;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::systems::actions_1v1::{
        IActions1v1Dispatcher, IActions1v1DispatcherTrait,
        IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source,
    };
    use siege_dojo::systems::world_system::tier_ability_slots;
    use super::{
        IERC20EntryDispatcher, IERC20EntryDispatcherTrait,
        IERC1155AbilityDispatcher, IERC1155AbilityDispatcherTrait,
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

    pub const BPS_DENOMINATOR: u256 = 10000;

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

    // Pull a buy-in into escrow. Zero amounts are free entries — no transfer.
    fn collect_entry(
        this: ContractAddress,
        player: ContractAddress,
        token: ContractAddress,
        amount: u256,
    ) {
        if amount == 0 {
            return;
        }
        let erc20 = IERC20EntryDispatcher { contract_address: token };
        let ok = erc20.transfer_from(player, this, amount);
        assert(ok, 'Entry transfer failed');
    }

    fn pay_out(token: ContractAddress, recipient: ContractAddress, amount: u256) {
        if amount == 0 {
            return;
        }
        let erc20 = IERC20EntryDispatcher { contract_address: token };
        let ok = erc20.transfer(recipient, amount);
        assert(ok, 'Payout transfer failed');
    }

    // Escrow one side's wagered abilities at world_system (settle_match pays
    // stakes out from there, so queue matches settle exactly like manual
    // staked matches).
    //
    // One batched ERC-1155 call, not one per ability: each safe transfer costs
    // two call boundaries (the token, then the recipient's acceptance hook).
    // OpenZeppelin implements safe_transfer_from as a one-element
    // safe_batch_transfer_from, so a single-ability wager behaves exactly as
    // before — TransferSingle, on_erc1155_received. Two or three switch to
    // TransferBatch / on_erc1155_batch_received.
    fn escrow_abilities(
        erc1155: IERC1155AbilityDispatcher,
        from: ContractAddress,
        escrow: ContractAddress,
        a1: u8, a2: u8, a3: u8,
    ) {
        let ids = array![a1, a2, a3];
        let mut token_ids: Array<u256> = ArrayTrait::new();
        let mut values: Array<u256> = ArrayTrait::new();
        let mut i: u32 = 0;
        while i < 3 {
            let id = *ids.at(i);
            if id > 0 {
                token_ids.append(id.into());
                values.append(1_u256);
            }
            i += 1;
        };
        if token_ids.len() == 0 {
            return;
        }
        erc1155.safe_batch_transfer_from(
            from, escrow, token_ids.span(), values.span(), array![].span(),
        );
    }

    #[abi(embed_v0)]
    impl MatchmakingImpl of super::IMatchmaking<ContractState> {
        fn queue_for_match(
            ref self: ContractState, token: ContractAddress, abilities: Array<u8>,
        ) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let now = get_block_timestamp();
            let this = get_contract_address();

            // Same spam guard as create_match_1v1: gate on a registered Hold.
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            // Wager: 1-3 abilities, capped by tier — mirrors join_staked_match.
            let count = abilities.len();
            assert(count >= 1 && count <= 3, 'Must stake 1-3 abilities');
            let max_slots: u32 = tier_ability_slots(kingdom.tier).into();
            assert(count <= max_slots, 'Too many abilities for tier');

            let config: ResourceConfig = world.read_model(0_u8);

            // Ability checks up front so a broke/unapproved head can't poison
            // the slot: the pairing tx (sent by the OTHER player) is what
            // actually moves the stakes.
            let erc1155 = IERC1155AbilityDispatcher { contract_address: config.ability_token };
            assert(erc1155.is_approved_for_all(caller, this), 'Approve ability operator');
            let mut i: u32 = 0;
            while i < count {
                let id: u8 = *abilities.at(i);
                assert(id >= 1 && id <= 10, 'Invalid ability ID');
                assert(erc1155.balance_of(caller, id.into()) >= 1_u256, 'Ability not owned');
                i += 1;
            };
            let w1: u8 = *abilities.at(0);
            let w2: u8 = if count > 1 { *abilities.at(1) } else { 0 };
            let w3: u8 = if count > 2 { *abilities.at(2) } else { 0 };

            // Entry pricing. Enabled with amount 0 = free entry.
            let entry: EntryToken = world.read_model(token);
            assert(entry.enabled, 'Entry token not enabled');
            if entry.amount > 0 {
                let erc20 = IERC20EntryDispatcher { contract_address: token };
                assert(erc20.allowance(caller, this) >= entry.amount, 'Entry not funded');
                assert(erc20.balance_of(caller) >= entry.amount, 'Entry not funded');
            }

            // Consume VRF unconditionally. Clients always send the
            // [request_random, queue_for_match] multicall, and the Cartridge
            // paymaster wrapper reverts on an unconsumed request — consuming
            // on every path (enqueue/re-queue/match) keeps the wrap valid.
            // The randomness is only used when a match is actually created.
            let vrf_addr = if config.vrf_provider.is_non_zero() {
                config.vrf_provider
            } else {
                VRF_PROVIDER_ADDRESS.try_into().unwrap()
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value = vrf.consume_random(Source::Nonce(this));

            let count_key: u8 = count.try_into().unwrap();

            // Wager-size switch: clear the caller from any OTHER sub-queue so
            // one player can never occupy two slots.
            let mut k: u8 = 1;
            while k <= 3 {
                if k != count_key {
                    let mut other: QueueSlot = world.read_model(k);
                    if other.player == caller {
                        other.player = Zero::zero();
                        other.queued_at = 0;
                        other.token = Zero::zero();
                        other.amount = 0;
                        other.ability_1 = 0;
                        other.ability_2 = 0;
                        other.ability_3 = 0;
                        world.write_model(@other);
                    }
                }
                k += 1;
            };

            let mut slot: QueueSlot = world.read_model(count_key);

            // Re-queue: caller is already this sub-queue's head — restart the
            // validity window and refresh token/wager choices.
            if slot.player == caller {
                slot.queued_at = now;
                slot.token = token;
                slot.amount = entry.amount;
                slot.ability_1 = w1;
                slot.ability_2 = w2;
                slot.ability_3 = w3;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            let head_empty = slot.player.is_zero();
            let head_stale = !head_empty && now > slot.queued_at + STALE_SECONDS;

            // Enqueue: nobody (live) is waiting at this wager size.
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
                slot.token = token;
                slot.amount = entry.amount;
                slot.ability_1 = w1;
                slot.ability_2 = w2;
                slot.ability_3 = w3;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            // Match: a live head waits at the same wager size. Head becomes
            // player_a. Escrow entry buy-ins (matchmaking) and ability wagers
            // (world_system — settle_match pays from there). A head who
            // revoked allowance/approval since queueing makes this revert;
            // their entry expires within STALE_SECONDS, so the block is
            // bounded. Accepted for v1.
            let opponent = slot.player;
            collect_entry(this, opponent, slot.token, slot.amount);
            collect_entry(this, caller, token, entry.amount);

            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
            escrow_abilities(erc1155, opponent, world_sys_addr, slot.ability_1, slot.ability_2, slot.ability_3);
            escrow_abilities(erc1155, caller, world_sys_addr, w1, w2, w3);

            let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
            let actions = IActions1v1Dispatcher { contract_address: actions_addr };
            let match_id = actions.create_match_1v1_delegated(opponent, caller, random_value);

            // Full staked-match wiring — settle_match and in-match ability
            // activation treat queue matches exactly like manual staked ones.
            world.write_model(@MatchStakes1v1 {
                match_id,
                a_stake_1: slot.ability_1,
                a_stake_2: slot.ability_2,
                a_stake_3: slot.ability_3,
                b_stake_1: w1,
                b_stake_2: w2,
                b_stake_3: w3,
                stake_count: count_key,
                settled: false,
                staked: true,
                parcel_claimed: false,
            });
            world.write_model(@MatchAbilities1v1 {
                match_id,
                a_ability_1: slot.ability_1,
                a_ability_2: slot.ability_2,
                a_ability_3: slot.ability_3,
                b_ability_1: w1,
                b_ability_2: w2,
                b_ability_3: w3,
                a_used_1: false,
                a_used_2: false,
                a_used_3: false,
                b_used_1: false,
                b_used_2: false,
                b_used_3: false,
            });

            world.write_model(@MatchPot {
                match_id,
                player_a: opponent,
                token_a: slot.token,
                amount_a: slot.amount,
                player_b: caller,
                token_b: token,
                amount_b: entry.amount,
                claimed: false,
            });

            slot.player = Zero::zero();
            slot.queued_at = 0;
            slot.token = Zero::zero();
            slot.amount = 0;
            slot.ability_1 = 0;
            slot.ability_2 = 0;
            slot.ability_3 = 0;
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

            let mut k: u8 = 1;
            while k <= 3 {
                let mut slot: QueueSlot = world.read_model(k);
                if slot.player == caller {
                    slot.player = Zero::zero();
                    slot.queued_at = 0;
                    slot.token = Zero::zero();
                    slot.amount = 0;
                    slot.ability_1 = 0;
                    slot.ability_2 = 0;
                    slot.ability_3 = 0;
                    world.write_model(@slot);
                }
                k += 1;
            };
            // Only clear a queued status — a matched status keeps its
            // matched_match_id so a client that raced leave vs match still
            // finds its game.
            let mut status: QueueStatus = world.read_model(caller);
            if status.state == QUEUE_STATE_QUEUED {
                status.state = QUEUE_STATE_IDLE;
                world.write_model(@status);
            }
        }

        fn claim_winnings(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();

            let mut pot: MatchPot = world.read_model(match_id);
            assert(pot.player_a.is_non_zero(), 'No pot for match');
            assert(!pot.claimed, 'Pot already claimed');

            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Finished, 'Match not finished');

            pot.claimed = true;
            world.write_model(@pot);

            let config: EntryConfig = world.read_model(0_u8);

            // Winner by vault HP — mirrors settle_match. Equal = draw.
            if state.vault_a_hp == state.vault_b_hp {
                // Draw: full refunds, treasury gets nothing.
                pay_out(pot.token_a, pot.player_a, pot.amount_a);
                pay_out(pot.token_b, pot.player_b, pot.amount_b);
                return;
            }

            let winner = if state.vault_a_hp > state.vault_b_hp {
                pot.player_a
            } else {
                pot.player_b
            };

            // Winner takes winner_bps of each side's buy-in in that side's
            // token; treasury sweeps the remainder. No cross-token math.
            let bps: u256 = config.winner_bps.into();
            let win_a = pot.amount_a * bps / BPS_DENOMINATOR;
            let win_b = pot.amount_b * bps / BPS_DENOMINATOR;
            pay_out(pot.token_a, winner, win_a);
            pay_out(pot.token_b, winner, win_b);
            pay_out(pot.token_a, config.treasury, pot.amount_a - win_a);
            pay_out(pot.token_b, config.treasury, pot.amount_b - win_b);
        }

        fn set_entry_config(
            ref self: ContractState, winner_bps: u16, treasury: ContractAddress,
        ) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            assert(winner_bps <= 10000, 'bps > 10000');
            world.write_model(@EntryConfig { config_id: 0, winner_bps, treasury });
        }

        fn set_entry_token(
            ref self: ContractState, token: ContractAddress, amount: u256, enabled: bool,
        ) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            world.write_model(@EntryToken { token, amount, enabled });
        }
    }
}
