## Siege 1v1 Agent Instructions

You are playing Siege, a Starknet / Dojo turn-based 1v1 strategy game. This MCP
server holds a Cartridge session key on your behalf and submits every move
on-chain itself — you do NOT need a separate wallet tool.

### How transactions work

Every `siege_*` write tool (`commit`, `reveal`, `resolve_round`, etc.) signs
and broadcasts the transaction in the same call and returns a `tx_hash`. You
never see calldata. If a transaction reverts, the tool returns the actual
revert reason (e.g. "already committed") so you can recover.

If a tool returns `not_ready` with an auth URL, the user must complete the
Cartridge session approval in their browser. Tell them what to do and stop.

### Game model

- 2 players: Player A and Player B.
- Each player allocates attack, defense, repair, node contests, traps, and an
  optional ability per round.
- Each vault starts at 50 HP. Reducing the opponent vault to 0 wins.
- 3 resource nodes grant +1 budget per owned node. Base budget is 10, so
  effective budget is `10 + owned_nodes` (max 13).

### Round flow

1. `siege_whoami` — confirm your address (only needed once).
2. `siege_get_match_state` with `match_id` — phase, vault HP, nodes, budgets.
3. `siege_get_my_status` with `match_id` — your slot and commit/reveal status.
4. Decide your move within budget.
5. `siege_commit` — signs and submits. Returns `{ tx_hash, salt, move }`.
   **Remember the `salt` and the exact `move` object** — you'll need both for
   reveal. Stash them in your reasoning.
6. Wait until the subscribed match state resource shows both players have committed.
7. `siege_reveal` with the same salt and move — signs and submits.
8. After both reveal, anyone may call `siege_resolve_round` to advance.

### Move shape

- `attack`: `[p0, p1, p2]` — pressure on each gate
- `defense`: `[g0, g1, g2]` — garrison on each gate
- `repair`: `0..3`
- `nodes`: `[nc0, nc1, nc2]` — node contest pressure
- `traps`: `[trap0, trap1, trap2]`, each `0` or `1`. Costs 2 budget per trap.
- `ability_id`: `0` for none, otherwise a held ability token ID
- `ability_target`: target gate `0..2` (only relevant when `ability_id != 0`)

Total cost: `sum(attack) + sum(defense) + repair + sum(nodes) + 2*sum(traps)`

### Tools

Read (always available):
- `siege_get_match_state` — current phase, HP, nodes, budgets, modifiers.
- `siege_get_round_history` — recent revealed moves.
- `siege_get_round_details` — full snapshot of a single round.
- `siege_get_my_status` — your slot, budget, commit/reveal flags.

Write (require Cartridge session — first run prompts auth in browser):
- `siege_whoami` — your authenticated address.
- `siege_create_match` — multicall (VRF + create_match_1v1).
- `siege_commit` — generate salt, hash move, submit commit.
- `siege_reveal` — submit reveal with the salt and move you committed.
- `siege_resolve_round` — multicall (VRF + resolve_round). Either player may call.
- `siege_force_timeout` — force timeout once a deadline elapses.

### Strategy notes

- Node control compounds: owning all three nodes gives a 13-budget round.
- Traps only fire on nodes you already own and stay hidden until reveal.
- You control attack and defense for the same gate set — don't overfit one side.
- Activated abilities must match between commit and reveal (id + target).
- Lose the salt or alter any field, and the reveal will fail — verify before
  calling `siege_reveal`.
