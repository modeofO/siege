# Matchmaking v1 — Design Spec (2026-07-18)

Implements GitHub issue #8 (queue-based auto-matching), scoped down per brainstorm.

## Decisions

| Question | Decision |
| --- | --- |
| Scope | Unstaked matches only. Staked keeps manual create/join flow. |
| Match trigger | Match-on-join: `queue_for_match` pairs with waiting player in the same tx, else enqueues caller. No `auto_match` crank. |
| Brackets | None in v1. FIFO pair-anyone. `PlayerReputation.bracket` untouched; bracket filtering is v2. |
| Staleness | Heartbeat via poke. Entries older than `STALE_SECONDS = 120` are dead; frontend re-pokes every ~60s while searching. |
| Placement | New `matchmaking` Dojo contract (approach A). Battle contracts untouched except one guard line. |

Because there are no compatibility filters, the queue can never hold more than
one fresh entry — the second arrival always matches the head. A single-slot
queue is therefore correct, and there is no unbounded scan (paymaster gas
constraint respected).

## Models — `src/models/match_queue.cairo`

```cairo
#[dojo::model]
pub struct QueueSlot {
    #[key]
    pub queue_id: u8,          // always 0 (singleton)
    pub player: ContractAddress, // zero address = empty
    pub queued_at: u64,
}

#[dojo::model]
pub struct QueueStatus {
    #[key]
    pub player: ContractAddress,
    pub state: u8,             // 0 = idle, 1 = queued, 2 = matched
    pub queued_at: u64,
    pub matched_match_id: u64, // valid when state == 2
}
```

`QueueStatus` exists so each client can watch its own row via Torii SQL and
discover the match_id when the opponent's tx created the pairing.

## System — `src/systems/matchmaking.cairo`

`STALE_SECONDS: u64 = 120`.

### `queue_for_match()`

1. Assert caller's `PlayerKingdom.registered` (same spam guard as
   `create_match_1v1`).
2. Consume VRF unconditionally at entry:
   `vrf.consume_random(Source::Nonce(get_contract_address()))`, provider from
   resource config with the Cartridge default fallback — same pattern as
   `world_system.create_staked_match`. Unconditional so the paymaster VRF
   wrapper never sees an unconsumed request on the enqueue path.
3. Read `QueueSlot`:
   - **Poke:** slot.player == caller → refresh `queued_at` on slot and status.
   - **Enqueue:** slot empty, or stale (`now - queued_at > STALE_SECONDS`) →
     if stale, reset the old head's `QueueStatus` to idle; write caller as
     head; write caller's status Queued.
   - **Match:** otherwise → call
     `actions_1v1.create_match_1v1_delegated(slot.player, caller, random_value)`
     (waiting player = player_a, caller = player_b; match is born Active).
     Clear the slot. Write both players' `QueueStatus` to
     `{ state: 2, matched_match_id: match_id }`.

### `leave_queue()`

If slot head == caller, clear slot. Set caller's status idle. Idempotent.

### Guard change in `actions_1v1`

`create_match_1v1_delegated` currently only accepts calls from `world_system`
(dns lookup). Extend the assert to also accept the `matchmaking` dns address.
Only change to battle contracts.

## Frontend

- "Find opponent" flow on the match-1v1 create page: button fires the queue
  multicall; searching state shows spinner + cancel.
- `frontend/src/lib/matchmaking.ts`: call builders. Queue tx is
  `[vrfRequestRandomCall(MATCHMAKING), queue_for_match]` (VRF must be call[0],
  game call immediately after — paymaster wrapper requirement). Cancel is a
  bare `leave_queue` call.
- While searching: poll own `QueueStatus` row via Torii SQL every ~3s; re-poke
  `queue_for_match` every ~60s to stay fresh. On `state == 2`, navigate to
  `/match-1v1/<matched_match_id>` (use `sqlU64()` for the id column).
- `sessionPolicies.ts`: add matchmaking contract with `queue_for_match`,
  `leave_queue`. Existing sessions won't have the policies — players
  reconnect (known Cartridge behavior).
- Addresses from the network manifest like every other contract.

## MCP (`mcp-server-2`)

Two new tools in `src/tools.ts`:

- `siege_queue_for_match` — VRF + queue multicall, returns tx hash; guidance
  text tells the agent to poll `QueueStatus` and re-poke.
- `siege_leave_queue` — bare call.

Matchmaking address resolved from `MANIFEST_PATH` dns like other systems.

## Edge cases

- Two players queue in the same block: sequencer orders txs; first enqueues,
  second matches. A third enqueues into the now-empty slot.
- Self-poke can never self-match (poke branch checked first).
- Stale head replaced: old head's status reset to idle so their client stops
  waiting; their next poke re-enqueues them fresh.
- Matched player walked away anyway: opponent uses existing `force_timeout`.
- Re-queue after a previous match: status row simply overwritten.
- `matched_match_id` persists after a match ends; only meaningful while
  `state == 2`, and state resets to 1 on next enqueue.

## Testing

Cairo tests (docker `sozo test`), new file in `src/tests/`:

- enqueue into empty slot; status written.
- second player pairs: match Active, correct player_a/player_b, slot cleared,
  both statuses matched with same match_id.
- poke refreshes `queued_at`, does not self-match.
- stale head replaced; old status idled.
- `leave_queue` clears; idempotent when not queued.
- unregistered caller reverts.
- delegated guard: matchmaking allowed, arbitrary caller reverts,
  world_system still allowed.

Frontend: `bun run lint`, `bun run test`, `bun run build`. MCP: `pnpm run
build`, `pnpm run test`.

## Deployment (deferred — NOT this session)

Migrate (adds contract), `auth grant writer` for
`siege_dojo,siege_dojo-matchmaking`, frontend redeploy for session policies,
MCP manifest pickup. Katana first, then mainnet.

## Out of scope (v2+)

Brackets + adjacency loosening, staked queue with escrow, multi-slot queue,
wager-compatibility matching, team/faction queues.
