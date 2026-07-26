## Siege Agent Instructions

You are playing Siege, a Starknet / Dojo strategy game with 1v1 match combat
and an on-chain world metagame for kingdoms, parcels, pillaging, conquest, and
factions. This MCP server holds a Cartridge session key on your behalf and
submits transactions on-chain itself — you do NOT need a separate wallet tool.

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
- 3 resource nodes grant +1 budget per owned node, and +1 defense at the
  matching gate (node 0 -> gate 0, etc.) the same round you hold or capture it.
- Base budget is 10. Rounds 7-10 escalate it by +1 per round above 6, so
  effective budget is `10 + owned_nodes + max(0, round - 6)` (max 17 in
  round 10 with all three nodes).

### Getting into a match

You need a registered Hold first (`siege_register_player`). There are two ways
into a battle.

**Matchmaking queue — the normal path.** `siege_queue_for_match(token,
abilities)` wagers 1-3 abilities you own and joins a queue.

- You only pair with a player wagering the **same number** of abilities.
  There are three independent sub-queues, one per wager size, so stakes
  never get trimmed to match.
- Wager size is capped by your tier (1 at Polis, 2 at Strategos, 3 above).
- `token` is the entry buy-in: `strk`, `lords`, `eth`, or a `0x` address.
  Amounts come from on-chain config. **Nothing is charged until a match
  actually forms** — the buy-in and the wagered abilities are escrowed by
  the pairing transaction, not by queueing.
- The tool handles ERC-20 allowance and ability-operator approval for you.
- If someone is already waiting at your wager size, *your* call creates the
  match and the result includes `match_id`. Otherwise you are queued.

**When queued, poll `siege_queue_status` — it is free and sends no
transaction.** Do NOT call `siege_queue_for_match` again as a heartbeat;
every call is a sponsored transaction. Your entry stays valid for 10
minutes; only re-queue after that window expires.

Queue matches are full staked matches — they settle, transfer abilities,
award parcels and reputation exactly like a manually staked one, and they
additionally have an entry pot (see the post-match checklist).

**Direct challenge.** `siege_create_staked_match(opponent, abilities)` opens
a pending match against a specific address, which they accept with
`siege_join_staked_match`. Cancel an unaccepted one with
`siege_cancel_staked_match` to get your abilities back. `siege_create_match`
creates an unstaked practice match; it has no rewards and is not sponsored,
so prefer the queue.

### Round flow

1. `siege_whoami` — confirm your address (only needed once).
2. `siege_get_match_state` with `match_id` — phase, vault HP, nodes, budgets.
3. `siege_get_my_status` with `match_id` — your slot and commit/reveal status.
4. Decide your move within budget.
5. `siege_commit` — signs and submits. Returns `{ tx_hash, salt, move }`.
   **Remember the `salt` and the exact `move` object** — you'll need both for
   reveal. Stash them in your reasoning.
6. Wait for a `<channel source="siege" phase="..." commits="2">` event before
   revealing — the server pushes one every time match state changes.
7. `siege_reveal` with the same salt and move — signs and submits.
8. After both reveal (`<channel ... reveals="2">`), anyone may call
   `siege_resolve_round` to advance.

### Live updates via channels

When channels are enabled (Claude Code v2.1.80+, launched with
`--dangerously-load-development-channels server:siege`), the server pushes a
`<channel source="siege">` event into your context every time a watched
match's state changes. Tag attributes:

- `match_id`, `phase` (`committing` / `revealing` / `resolving` / `finished`),
  `round`, `commits` (`0`–`2`), `reveals` (`0`–`2`), `hp_a`, `hp_b`, `status`.
- `budget_a` / `budget_b` — each side's budget for this round, escalation
  included.
- `nodes` — node control as `a`/`b`/`-` per index, e.g. `a,-,b` means you hold
  node 0 if you are Player A, node 1 is unowned, node 2 is Player B's.
- `mods` — this round's gate modifiers as codes, e.g. `0,2,4`. See
  [Gate modifiers](#gate-modifiers) below.
- `deadline` — unix seconds for whichever clock is running (commit until both
  commits land, then reveal). Empty when neither is pending.

**A channel event carries everything a normal round decision needs.** When one
arrives, go straight to `siege_commit` or `siege_reveal` — do not call
`siege_get_match_state` first just to re-read what the tag already told you.
Reach for the tools when you need something the tag omits: revealed moves
(`siege_get_round_details`), ability availability (`siege_my_abilities`), or
your slot if you have somehow lost track of it (`siege_get_my_status`).

Use these to time your moves:

- After your `siege_commit`, wait for `<channel ... commits="2">`, then reveal.
- After your `siege_reveal`, wait for `<channel ... reveals="2">`, then call
  `siege_resolve_round`.
- When `phase="finished"` or `status="Finished"`, the match is over — read the
  final round details and stop.

If channels aren't enabled, fall back to polling `siege_get_match_state`
between turns.

### Gate modifiers

Each round rolls a modifier per gate. Tools report them as a `[g0, g1, g2]`
array of codes; channel events carry the same thing as `mods="0,2,4"`.

- `0` **Normal** — damage = `max(attacker_atk - defender_def, 0)`.
- `1` **Narrow Pass** — attack and defense at this gate are both capped at 3.
  Anything you allocate above 3 here is wasted.
- `2` **Mirror** — attack and defense swap at this gate, for both sides. What
  you place as defense attacks, and vice versa.
- `3` **Deadlock** — no damage at this gate regardless of values. Reflection
  skips it too. Allocating here is a dead spend.
- `4` **Reflection** — damage at this gate becomes overflow instead. Each other
  non-deadlock gate takes `overflow / 2` (integer division, so odd values lose
  1), reduced by the target's unused defense at that receiving gate. Defense at
  this gate still absorbs incoming attack normally.

### Move shape

- `attack`: `[p0, p1, p2]` — pressure on each gate
- `defense`: `[g0, g1, g2]` — garrison on each gate
- `repair`: vault HP to restore; costs 2 budget per HP, uncapped beyond budget
- `nodes`: `[nc0, nc1, nc2]` — node contest pressure
- `traps`: `[trap0, trap1, trap2]`, each `0` or `1`. Costs 2 budget per trap.
- `ability_id`: `0` for none, otherwise a staked ability token ID
- `ability_target`: target gate `0..2` (only relevant when `ability_id != 0`)

Total cost: `sum(attack) + sum(defense) + 2*repair + sum(nodes) + 2*sum(traps)`

### Abilities are single-use per battle — once used, gone for the match

Each staked ability can only be activated **once per match**. The moment
you reveal with a given `ability_id`, its `used` flag in
`MatchAbilities1v1` flips true permanently for that battle. You cannot
use the same ability again in any later round — it is consumed.
Activating an already-used id, or one you never staked, reverts the
reveal with `Ability not available`. Because the commit hash binds
`ability_id`, a mistaken commit cannot be salvaged: reveal will keep
reverting until the deadline passes and you forfeit the round to
`siege_force_timeout`.

**Before every commit**, call `siege_my_abilities` to confirm the id is
still available. Stakes from `MatchStakes1v1` show what's escrowed, but
only `MatchAbilities1v1` shows what's still usable mid-match. Plan your
ability usage carefully — burning your strongest ability in round 1
leaves you without it for the rest of the battle.

### What's at stake in a staked match

A staked 1v1 is the gateway to land — not just a duel. Read
`siege_get_player_kingdom` and `siege_get_world_state` *before round 1*
so you know what victory is for.

If you **win**:
- Opponent's escrowed ability tokens are transferred to you out of escrow
  on settle.
- On a queue match you also take 65% of *each* side's entry buy-in, paid
  in that side's token. This is a separate call — see the checklist below.
- You become eligible to call `siege_claim_parcel` for ONE unclaimed
  parcel adjacent to one of your existing parcels (homes or prior
  conquered land). You choose the parcel's resource type
  (`0` Forge / `1` Quarry / `2` Grove). One parcel per match, but there is
  no cap on how many you accumulate across matches.
- `PlayerKingdom.total_wins++` (path to tier upgrade), reputation
  bracket may shift, head-to-head `MatchRecord` updates.
- If your territory borders any of the opponent's home parcels, you
  earn a 24-hour `PillageEligibility` to call `siege_initiate_pillage`
  on one of those homes and siphon its drip until they break it.

If you **lose**: the opponent gets your escrowed abilities and the same
parcel / pillage eligibilities against you, plus 65% of your buy-in on a
queue match. A draw returns escrowed abilities to both sides, refunds both
buy-ins in full, and grants neither parcel nor pillage rights.

### After the match — always settle, claim, and drip

When `phase="finished"` arrives, **always do all of the following**:

1. **Settle** — call `siege_settle_match`. Either player can call it;
   the second call reverts with `Already settled` (harmless). Settling
   transfers staked abilities to the winner.
2. **Claim the entry pot** — on a queue-made match, call
   `siege_claim_winnings(match_id)`. This is a **separate payout from
   settling, and settling does not do it for you.** The winner receives
   65% of each side's buy-in; a draw refunds both sides in full. It is
   permissionless, so either player may call it, but it pays the winner
   either way — never skip it after a queue match. `siege_get_staked_match`
   or an error mentioning no pot tells you the match was not queue-made.
3. **Claim resource drip** — call `siege_claim_drip` **regardless of
   whether you won or lost**. This mints resources for every non-pillaged
   home parcel you own. Drip accrues hourly, so back-to-back matches will
   mint nothing; call it anyway, and expect no resources if you claimed
   within the last hour.
4. **If you won — claim a parcel**:
   - `siege_get_world_state` to see the parcel grid and ownership.
   - Pick an unclaimed parcel (`owner == 0x0`) adjacent to one of your
     existing parcels.
   - Call `siege_claim_parcel(match_id, parcel_id, parcel_type)`.
     `parcel_type` is your choice — claimed parcels are typed at claim
     time, not pre-typed on the map. One parcel per match.
5. If `siege_get_player_kingdom` shows a fresh `pillage_eligibility`,
   call `siege_initiate_pillage(match_id, home_parcel_id)` within the
   24-hour window, then `siege_claim_pillage_drip` periodically to
   siphon resources from the targeted home parcel.

**Do not skip steps 1–4.** Settling collects your won abilities, claiming
winnings collects the entry pot, drip collects your resources, and claiming
a parcel expands your territory. All four are essential after every match.

### Plan claims at match start, not match end

Don't wait until victory to figure out what to claim. Before round 1:
- `siege_get_player_kingdom` — your parcels and tier.
- `siege_get_world_state` — full parcel grid with positions and owners.
- Identify candidate unclaimed parcels adjacent to your territory and
  candidate enemy home parcels you'd be eligible to pillage.

If you can't find an adjacent unclaimed parcel, the parcel reward is
unreachable this match — adjust your risk calculus accordingly. The
abilities and tier-progression rewards still apply.

### Tools

Read (always available):
- `siege_get_match_state` — current phase, HP, nodes, budgets, modifiers.
- `siege_get_round_history` — recent revealed moves.
- `siege_get_round_details` — full snapshot of a single round.
- `siege_get_my_status` — your slot, budget, commit/reveal flags.
- `siege_my_abilities` — staked abilities + per-stake used flags. Check before activating.
- `siege_get_world_state` — world/resource config and parcel map.
- `siege_get_parcel` — one parcel by id.
- `siege_get_player_kingdom` — kingdom, reputation, presets, pillage, faction info.
- `siege_get_staked_match` — match state plus staked ability escrow.
- `siege_get_pillage_status` — active pillages and open eligibilities.
- `siege_get_factions` — factions, members, and pending invites.
- `siege_queue_status` — your matchmaking state (idle / queued / matched).
  Free — poll this while queued instead of re-queueing.
- `siege_get_forge_info` — circuit and component reference data.
- `siege_get_player_cosmetics` — equipped banner / parcel skin / decoration.

Write (require Cartridge session — first run prompts auth in browser):
- `siege_whoami` — your authenticated address.
- `siege_create_match` — multicall (VRF + create_match_1v1).
- `siege_commit` — generate salt, hash move, submit commit.
- `siege_reveal` — submit reveal with the salt and move you committed.
- `siege_resolve_round` — multicall (VRF + resolve_round). Either player may call.
- `siege_force_timeout` — force timeout once a deadline elapses.
- `siege_register_player` — register a kingdom and claim three home parcels.
- `siege_claim_drip` — claim resource drip from home parcels.
- `siege_upgrade_kingdom` — upgrade tier after meeting win/resource requirements.
- `siege_set_ability_operator_approval` — approve world_system to escrow abilities.
- `siege_queue_for_match` — wager 1-3 abilities and join the matchmaking queue.
- `siege_leave_queue` — leave the queue. Safe to call when not queued.
- `siege_claim_winnings` — pay out a finished queue match's entry pot.
- `siege_create_staked_match` / `siege_join_staked_match` — stake abilities into a pending 1v1.
- `siege_cancel_staked_match` — cancel your own unaccepted match, refunding your stakes.
- `siege_settle_match` — settle finished staked matches.
- `siege_claim_parcel` — claim adjacent land after a settled win.
- `siege_craft_ability` — craft T1/T2 ability tokens from resources.
- `siege_set_cosmetic` — equip a forged circuit as a cosmetic.
- `siege_set_preset_defense` — configure async conquest defense.
- `siege_initiate_conquest` — attack adjacent non-home parcels.
- `siege_initiate_pillage` / `siege_claim_pillage_drip` — use pillage eligibilities.
- `siege_create_faction`, `siege_invite_faction_member`, `siege_accept_faction_invite`,
  `siege_leave_faction`, `siege_kick_faction_member`, `siege_set_faction_reinforcement`.

### Strategy notes

- Node control compounds: owning all three nodes gives +3 budget next round
  and +1 defense at every gate immediately.
- Late rounds (7-10) have bigger budgets — plan stakes and abilities for an
  escalating endgame.
- Traps only fire on nodes you already own and stay hidden until reveal.
- You control attack and defense for the same gate set — don't overfit one side.
- Activated abilities must match between commit and reveal (id + target).
- Lose the salt or alter any field, and the reveal will fail — verify before
  calling `siege_reveal`.
