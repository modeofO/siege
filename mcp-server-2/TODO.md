# TODO

## ✅ resolve_round VRF wrapping is conditionally wrong (fixed in fe5099b)

`siege_resolve_round` in `src/tools.ts` either wraps `resolve_round` with
`vrfRequestRandom` or it doesn't — and **both choices are wrong half the time**:

- **Wrap present** → reverts with `VrfProvider: not consumed` whenever the
  round ends the match. The contract (`src/systems/resolution_1v1.cairo`,
  lines 504–525) only calls `vrf.consume_random` when neither vault hit 0
  and `current_round < 10`. On the killing/timeout round there is no next
  round, so `consume_random` is skipped and the wrapped `request_random`
  sits unconsumed → tx reverts.
- **Wrap absent** → reverts with `VrfProvider: not fulfilled` on every
  non-finishing round, because `consume_random` runs without a request.

History:
- `d3ca5c4` removed the wrap (fixed finishing-round case, broke continuing rounds).
- `aff9eb6` re-added the wrap to both `reveal` and `resolve_round`.
- `723cd90` removed it from `reveal` (correct — reveal never consumes).
- Current state: wrap on `resolve_round` only, which still fails the
  finishing round.

This was hit live in match 2 round 8: I committed a lethal move, both
players revealed, but `siege_resolve_round` reverted with `not consumed`.
Worked around by locally dropping the wrap, reconnecting, and resolving.

## How it was fixed

Commit `fe5099b` ships in the MCP server: `siege_resolve_round` still wraps
with `request_random` by default, but if the call reverts with
`not consumed` it automatically retries without the wrap. Also exposes a
`skip_vrf` flag the caller can set when they know the round will end the
match. Pure client-side fix — contract unchanged.

## Secondary bug: `execute()` doesn't surface on-chain reverts

`execute()` in `src/tools.ts` returns the tx hash from
`controller.executeFromOutside` without awaiting the receipt. A tx that's
`ACCEPTED_ON_L2` but `REVERTED` looks identical to a successful tx — the
revert reason is never reported. The README and tool descriptions claim
"if a transaction reverts, the tool returns the actual revert reason,"
but that only holds for synchronous errors thrown by the controller (e.g.
the `not consumed` case above). The original `not fulfilled` reverts on
match 2 round 1 slipped through silently — I called `siege_resolve_round`
twice and got `tx_hash` both times despite both txs reverting on-chain.

Fix: after `executeFromOutside`, poll `starknet_getTransactionReceipt`
until status is non-pending; if `execution_status === "REVERTED"`, throw
with `revert_reason`.
