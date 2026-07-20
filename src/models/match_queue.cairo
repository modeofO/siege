use starknet::ContractAddress;

// Single-slot matchmaking queue. With no compatibility filters (v1 is
// pair-anyone), the queue can never hold more than one fresh entry — the
// second arrival always matches the head — so one slot is sufficient and
// there is no unbounded scan.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct QueueSlot {
    #[key]
    pub queue_id: u8, // wager size (1-3) — one sub-queue per ability count
    pub player: ContractAddress, // zero address = empty
    pub queued_at: u64,
    // Entry buy-in the waiting player committed to, locked at queue time so
    // an owner reprice mid-wait can never charge more than they approved.
    pub token: ContractAddress,
    pub amount: u256,
    // Wagered ability ids (1-10); zero-padded past the wager size.
    pub ability_1: u8,
    pub ability_2: u8,
    pub ability_3: u8,
}

// Owner-managed entry pricing. amount is in the token's base units;
// enabled with amount 0 = free entry (dev chains, promotions).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct EntryToken {
    #[key]
    pub token: ContractAddress,
    pub amount: u256,
    pub enabled: bool,
}

// Singleton payout config.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct EntryConfig {
    #[key]
    pub config_id: u8, // always 0
    pub winner_bps: u16, // 6500 = winner takes 65% of each buy-in
    pub treasury: ContractAddress,
}

// Escrow record for one queue-made match. Both buy-ins sit in the
// matchmaking contract until claim_winnings pays them out.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchPot {
    #[key]
    pub match_id: u64,
    pub player_a: ContractAddress,
    pub token_a: ContractAddress,
    pub amount_a: u256,
    pub player_b: ContractAddress,
    pub token_b: ContractAddress,
    pub amount_b: u256,
    pub claimed: bool,
}

// Per-player queue state, readable via Torii so each client can watch its own
// row and discover the match_id when the opponent's tx created the pairing.
// state: 0 = idle, 1 = queued, 2 = matched (matched_match_id valid).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct QueueStatus {
    #[key]
    pub player: ContractAddress,
    pub state: u8,
    pub queued_at: u64,
    pub matched_match_id: u64,
}
