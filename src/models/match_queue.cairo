use starknet::ContractAddress;

// Single-slot matchmaking queue. With no compatibility filters (v1 is
// pair-anyone), the queue can never hold more than one fresh entry — the
// second arrival always matches the head — so one slot is sufficient and
// there is no unbounded scan.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct QueueSlot {
    #[key]
    pub queue_id: u8, // always 0 (singleton)
    pub player: ContractAddress, // zero address = empty
    pub queued_at: u64,
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
