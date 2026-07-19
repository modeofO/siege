# Paid Matchmaking Queue — Design Spec (2026-07-19)

Extends the matchmaking v1 spec (2026-07-18). Adds an entry buy-in to
queue-made matches to recoup part of the ~$1/game paymaster spend, and removes
free practice matches from the product surface. Direction confirmed with the
owner: partial recoup only (full recoup priced players out), multi-token
entry, practice removed until sponsorship costs drop.

## Decisions

| Question | Decision |
| --- | --- |
| When is payment taken | At **pairing**, never at queue time. Nobody pays without getting a game; `leave_queue`/expiry stay free, no refund paths. |
| Tokens | Owner-managed allowlist: STRK, LORDS, ETH at launch. Fixed per-token buy-in amounts (no oracle); owner re-prices as markets drift. |
| Amounts at launch | ~$0.70 equivalent per player (owner-set, adjustable). `amount = 0` + enabled = free entry (dev chains, future promotions). |
| Winner cut | 65% (`winner_bps = 6500`, owner-set). Winner takes 65% of each side's buy-in (paid per-token, no conversion); treasury takes the remainder. |
| Draw | Each player reclaims 100% of own buy-in; treasury gets nothing. Covers the zero-commit abandon path (equalized vaults = draw). |
| Payout | Pull-based, permissionless `claim_winnings(match_id)`. Checks `MatchState1v1` Finished, winner by vault HP (mirrors `settle_match`). |
| Escrow | Buy-ins `transfer_from` both players into the matchmaking contract in the pairing tx. Allowance + balance asserted at queue time. |
| Practice mode | Removed from create page UI; `create_match_1v1` dropped from the paymaster policy (still on-chain, unsponsored). Staked flow untouched. |
| Mixed tokens | Allowed — the two players may pay different tokens. All payout math is per-token on the recorded buy-ins. |

## Models (extend `src/models/match_queue.cairo`)

```cairo
// Owner-managed entry pricing. amount is in the token's base units.
#[dojo::model]
pub struct EntryToken {
    #[key] pub token: ContractAddress,
    pub amount: u256,
    pub enabled: bool,
}

// Singleton payout config.
#[dojo::model]
pub struct EntryConfig {
    #[key] pub config_id: u8, // always 0
    pub winner_bps: u16,      // 6500 = winner takes 65% of each buy-in
    pub treasury: ContractAddress,
}

// Escrow record for one queue-made match.
#[dojo::model]
pub struct MatchPot {
    #[key] pub match_id: u64,
    pub player_a: ContractAddress,
    pub token_a: ContractAddress,
    pub amount_a: u256,
    pub player_b: ContractAddress,
    pub token_b: ContractAddress,
    pub amount_b: u256,
    pub claimed: bool,
}
```

`QueueSlot` gains `token: ContractAddress` and `amount: u256` — the buy-in the
waiting player committed to (locked at their queue time, so an owner reprice
mid-wait cannot charge more than they approved).

## Contract changes (`src/systems/matchmaking.cairo`)

- `queue_for_match(token: ContractAddress) -> u64` (signature change):
  - Assert `EntryToken` for `token` is enabled.
  - Assert `allowance(caller, matchmaking) >= amount` and
    `balance_of(caller) >= amount` (`'Entry not funded'`) — blocks unfundable
    entries before they can poison the slot.
  - Poke/re-queue path updates the stored token/amount to the caller's
    current choice.
  - Pairing path: `transfer_from` the waiting player's stored (token, amount)
    and the caller's (token, current amount) into the contract, then create
    the match and write `MatchPot`. Zero amounts skip transfers.
  - Known edge: a waiting player who revokes allowance after queueing makes
    the pairing tx revert, blocking the slot until their entry goes stale
    (≤10 min). Accepted for v1.
- `claim_winnings(match_id)`: permissionless. Requires pot exists and not
  claimed, match Finished. Winner = higher vault HP; equal = draw (refund
  both). Winner receives `amount * winner_bps / 10000` of each side's buy-in
  in that side's token; treasury receives the remainders. Sets `claimed`.
- Owner setters (world-owner assert, same pattern as `set_vrf_provider`):
  `set_entry_config(winner_bps, treasury)`, `set_entry_token(token, amount, enabled)`.
- ERC-20 surface used: `transfer_from`, `transfer`, `allowance`,
  `balance_of` (standard tokens only; STRK/LORDS/ETH all conform).

## Frontend

- Create page: PRACTICE mode removed; FIND is the default tab, STAKED second.
- FindOpponent: token picker (symbol + buy-in fetched from Torii `EntryToken`
  rows), approve-if-needed before the queue multicall (separate tx with
  receipt wait — mirrors `createStakedMatch`, since the VRF wrap forbids
  calls between `request_random` and the game call), then
  `[request_random, queue_for_match(token)]`.
- Claim: after a queue-made match finishes, the match page shows a
  "Claim pot" button when Torii has an unclaimed `MatchPot` for it (visible
  to both players; payouts go to fixed parties regardless of caller).
- Session policies: matchmaking gains `claim_winnings`; STRK/LORDS/ETH gain
  `approve` scoped `spender: matchmaking` with an amount cap.

## MCP

- `siege_queue_for_match` gains `token` param (symbol strk|lords|eth or
  address; resolved from config). Performs allowance check + approve tx +
  wait, then the VRF multicall.
- New `siege_claim_winnings(match_id)`.
- Policies updated to match.

## Deployment

Migrate (upgrades matchmaking — entrypoint signature change), then:
`set_entry_config(6500, <treasury>)`, `set_entry_token` × STRK/LORDS/ETH.
Paymaster: add `claim_winnings` + `approve` on the three tokens; REMOVE
`create_match_1v1` sponsorship. Session re-approval needed (players + MCP).
Treasury = deployer account at launch.

Mainnet token addresses (verify symbols on-chain before init):

- STRK `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`
- ETH  `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7`
- LORDS `0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49`

Launch amounts target ~$0.70; owner must sanity-check spot prices at init
time and re-price periodically.

## Out of scope

Oracle pricing, refunds for stale entries (nothing is paid), pot rollovers,
tournaments, fee tiers by reputation.
