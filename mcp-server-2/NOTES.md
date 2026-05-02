# Notes from playing match 2

What an LLM agent actually needs to know to play well, and what the MCP tools
should surface so it doesn't have to grep the Cairo contracts to find out.

## Gate modifier semantics (currently surfaced as raw `[u8, u8, u8]`)

The `modifiers` field on `siege_get_match_state` is a `[gate0, gate1, gate2]`
array of raw u8 values, rolled fresh each round and *visible to both players
before allocation*. The agent has to either remember the encoding or read
`resolution_1v1.cairo` to decode them. Distribution per gate per round
(uniform digit roll, see `random_to_modifiers`): Normal 60%, NarrowPass 10%,
Mirror 10%, Deadlock 10%, Reflection 10%.

The base damage formula at any non-special gate is just:

```
aa = my attack at gate g
bd = opp defense at gate g
damage_to_opp[g] = max(aa - bd, 0)
unused_def_opp[g] = max(bd - aa, 0)   # only matters for Reflection
```

The same calc runs symmetrically for the other side.  Then a final
`total_damage = sum(damage_to_*[g])` is reduced/zeroed by abilities, then
applied to vault HP after repair.  Each modifier mutates the four inputs
`(aa, ad, ba, bd)` *before* this calc runs.

### `0` Normal
No change. The base formula above.

### `1` Narrow Pass — value cap
All four inputs are clamped to 3 at this gate *before* damage:

```
aa = min(aa, 3); ad = min(ad, 3); ba = min(ba, 3); bd = min(bd, 3)
```

**Implication.** Spending more than 3 on either attack or defense at a
Narrow Pass gate is pure waste. Optimal allocation here is some combination
of 0..3 / 0..3, and any surplus budget is better spent on another gate or on
nodes/repair. If you knew the opponent was tunneling all their attack into
gate 1 and gate 1 rolled Narrow Pass, you cap their incoming damage at 3
with just 0 defense (since they cap to 3 anyway and you keep your full
defense budget for elsewhere).

### `2` Mirror — within-player swap
Each player's own attack and defense values *swap places at this gate*
before damage:

```
(aa, ad) = (ad, aa)
(ba, bd) = (bd, ba)
```

Then the standard `max(aa - bd, 0)` formula runs.  This is **not** an
attacker-vs-defender swap — both players' values flip simultaneously, so the
damage *direction* is unchanged; only the slot you put each value in
changes.

**Implication.** To deal damage at a Mirror gate you must allocate to your
*defense* slot, because that becomes your attack after the swap. Likewise
your attack slot becomes your defense. Putting `attack=5, defense=0` at a
Mirror gate is the same as putting `attack=0, defense=5` — both deal 0 to
opponents who do anything similar. The cleanest "mirror exploit" is
`attack=0, defense=N` (effective `attack=N, defense=0`), trading away your
own defense for surprise attack pressure.  An opponent who doesn't realize
this and allocates conventionally will eat full damage.

### `3` Deadlock — gate is dead
The gate produces zero damage in either direction. No swap, no calc,
`damage_to_*[g] = 0`. Reflection from another gate also *cannot* land here
(see Reflection — receiving gates skip if Deadlock).

**Implication.** Spending anything on this gate (attack, defense, traps it
doesn't even apply to) is wasted. Optimal allocation is 0/0 and reroute
budget to live gates. If an opponent is forced to spread budget evenly,
Deadlock gates effectively reduce both players' usable budget by the
allocation pinned there.

### `4` Reflection (`MOD_OVERFLOW`) — split-and-route overflow
The "would-be direct damage" at this gate is computed as overflow and
*not* applied directly. Instead it's halved and routed to each of the other
non-Deadlock gates, where it's reduced by the *unused defense* at the
receiving gate (defense that wasn't consumed by the opponent's direct
attack at that gate).

```
ovf_to_opp[g_refl] = max(aa - bd, 0)            # at the reflection gate
per_gate           = ovf_to_opp[g_refl] // 2    # integer division
for each other gate t (t != g_refl, mod[t] != Deadlock):
    add max(per_gate - unused_def_opp[t], 0) to damage_to_opp[t]
```

Three implications worth internalising:

1. **High raw attack at a reflection gate is amplified.** Even though no
   direct damage lands at the reflection gate, ovf=4 sends 2 to *each* of
   the other two gates, total 4. Same total damage as a normal gate, just
   distributed — *unless* the opponent has unused defense at the receiving
   gates, in which case each receiving gate's unused defense subtracts from
   the per-gate routed damage independently.

2. **Defense that gets fully consumed by direct attack at gate t leaves
   `unused_def_opp[t] = 0`, so reflection lands unblocked there.** If the
   opponent stacks attack into the same gates I'm attacking, my reflection
   damage routes there mostly unmitigated. This is why pure all-attack
   builds on both sides at low HP almost always end in a draw at a
   reflection round — neither player has unused defense to soak the
   routed overflow.

3. **Defense at the *reflection gate itself* still matters for the inbound
   side.** It reduces overflow before halving (`max(aa - bd, 0)` is the
   pre-halve amount). Defense of 4 at a reflection gate blocks an attack of
   4 fully — overflow becomes 0 and no reflection damage is routed. This is
   the only modifier where defending *the modifier gate* has bonus value.

### Combined-modifier tactics

- **Mirror + Reflection on different gates.** The cleanest play is mirror
  exploit (atk=0, def=N) at the Mirror gate plus heavy attack at the
  Reflection gate to spam routed damage. Defense at the *non-special* gate
  becomes the choke point.
- **Narrow Pass + Reflection.** Reflection routes overflow to other gates
  *after* the cap rule, so a Narrow Pass receiving gate caps neither the
  per-gate routed damage nor the unused defense — i.e. NP only matters
  when you allocate directly to it.
- **Two Deadlocks.** If two of three gates are Deadlock (rare, ~1% per
  round), the active gate is the only place anything can happen, and any
  Reflection on the third gate has no destinations to route to (the
  contract checks `t != g2 && mod[t] != Deadlock` per receiving gate). I
  haven't traced what happens with reflection-with-no-valid-target — needs
  a contract read.

### Ability layer (didn't come up in match 2 — flagged for completeness)

After modifier transforms but *before* damage application, abilities mutate
the inputs further (`Fortify` boosts defense per gate) or post-process the
damage arrays (`Stone Cloak` halves or zeros damage *and* overflow,
`Hex` subtracts from total damage, `Ember Blast` adds direct vault damage,
`Siege Sword` overrides attack at a chosen gate). Tier-1 vs Tier-2 changes
the magnitude. The `siege_get_round_details` response shows
`ability.{id, target}` per player but doesn't decode either — agent has to
remember `ability_type = ((id-1) % 5) + 1`, `tier = ((id-1) // 5) + 1` and
look up effects in `resolution_1v1.cairo`. Tools should label.

### Suggestions for the MCP tools

- `siege_get_match_state.modifiers` should be (or be augmented with) an
  array of `{gate, name, effect}` objects so the agent can plan without
  the lookup table.
- `siege_get_round_details` after both reveal: include
  `effective_moves` per player per gate `(atk_eff, def_eff)` after Narrow
  Pass clamp + Mirror swap, plus `predicted_damage` and `unused_def`. Today
  the agent has to apply the swap mentally to read the move at all.
- Decode `ability.id` to `{type_name, tier}` and surface a one-line
  effect description. Same problem as modifier raw values.

## Player-controllable mechanics I never touched (and why)

These all exist in the `siege_commit` schema or in adjacent contracts but
are effectively invisible at decision time, so I defaulted to ignoring them
the whole match. The tools should surface them as first-class options
during planning, not just accept them in the move payload.

### Traps — never placed one
**What they do.** `traps: [trap0, trap1, trap2]`, 0/1 per node. 2 budget
per trap. If opponent's node-contest spend would *take* that node from me
this round, they take 5 vault damage instead — post-repair, not blockable
by defense, not repairable. Trap is consumed regardless of whether it
fires; one-shot per round.

**Constraints.** Only on nodes I currently own; trapping a node means I
can't simultaneously contest it (`nodes[i]` must be 0 for that index). The
contract reverts at reveal if violated.

**Why I never placed any.** They never came up in my reasoning. The MCP
tool happily accepts `traps` in the commit payload but `siege_get_match_state`
shows me node ownership in plain ascii without ever flagging "you could
trap nodes 1 and 2." Player A's `nodes` allocations were `[0,0,0]` for
most of the match, which means traps would have been wasted anyway — but
I should have *considered* them in rounds 4+ when A retook Grove via a
nodes-only push (round 6: A allocated `nodes=[0,0,2]`). A trap on Grove
that round would have flipped a quiet 2-budget node steal into 5 vault
damage on A.

**Surface this in the tool.** On `siege_get_match_state` add a
`my_traps_eligible: [bool, bool, bool]` field per node (own + not-contesting
this round once a draft is in flight). On `siege_commit` reject invalid
trap placements client-side with a useful message rather than letting them
revert on reveal. On `siege_get_round_details` after reveal, surface
`trap_triggered: [bool, bool, bool]` so it's clear if a trap landed and
where the 5 dmg came from.

### Repair — used 0 the entire match
**What it does.** `repair: 0..3`, costs 1 budget per point of healing.
Applied *before* damage in `resolution_1v1.cairo:359-360`, capped at 50 HP.

**Why I never used it.** The 1:1 ratio of budget→HP looks bad next to a
1-budget attack point that can deal 1 dmg *and* draw out an opponent's
defense — a strict equivalent in raw HP swing, but with the upside of
forcing the opponent to spend on defense. Repair felt strictly worse
unless I was about to die. Player A used `repair=1` on round 3 (their
move shape was `atk=[2,4,3] def=[0,1,1] repair=1`, exactly filling their
11 budget). I never followed suit even when at 9 HP in round 8 where a
single repair point would have meaningfully changed the kill math: with
repair=1 my move would have been `atk=[2,4,3] def=[0,0,0] repair=1` and
A would have needed 10 dmg to kill me instead of 9. Same total budget,
better survival odds.

**Surface this in the tool.** Show `my_hp` and a `max_useful_repair` field
(`min(3, 50 - my_hp)`) on `siege_get_match_state` or `siege_get_my_status`,
so the agent has the cap visible without having to compute it. Mention
the cap explicitly in the `siege_commit` parameter docs.

### Abilities — never activated, never even checked inventory
**What they do.** `ability_id: 0..10`, `ability_target: 0..2`. ID 0 is
"none." 1–5 are tier-1, 6–10 are tier-2. Five types (Siege Sword, Stone
Cloak, Ember Blast, Hex, Fortify) with tier-aware effects in
`resolution_1v1.cairo` lines 146+. Activating consumes the token (or at
least the in-match charge — needs verification). Powerful: T2 Siege Sword
*sets* attack at the chosen gate to 10, T2 Stone Cloak zeros all incoming
gate damage, T2 Ember Blast deals 6 direct vault damage, etc.

**Why I never used them.** I had no idea whether I owned any. The MCP
tools don't expose ability balances at all — there is no `siege_my_abilities`
or `inventory` call. The commit/reveal payload accepts an `ability_id` but
the contract reverts if I don't actually hold the token. So my safe
default was always `ability_id=0`. If I'd had a T2 Ember Blast in round 8,
that's 6 free vault damage *bypassing the reflection-induced draw* — a
likely solo win.

**Surface this in the tool.** Add a `siege_get_my_abilities` (or fold
into `siege_get_my_status`) that returns the agent's ERC-1155 balances
on `AbilityToken`, decoded as `[{id, type_name, tier, count, effect}]`.
On `siege_commit` validate `ability_id != 0` against that balance and
reject client-side. On `siege_get_round_details` decode opponent's
revealed `ability.id` to a name + tier instead of just `{id: 7, target: 1}`.

### Resources — earned, never seen
**What they are.** Six ERC-20 tokens (Iron, Linen, Stone, Wood, Ember,
Seeds) minted at end of each round to whoever owns the corresponding node.
Forge → Iron + Linen, Quarry → Stone + Wood, Grove → Ember + Seeds. Used
to craft abilities outside of matches.

**Why this matters mid-match.** It doesn't, directly — resources don't
affect the round. But the agent prompt mentions them as a payoff for
holding nodes, and I had no signal of how many I'd accumulated. A status
hook on `siege_whoami` that shows ERC-20 balances would let the agent
weigh node holds against in-match damage trades correctly.

**Surface this in the tool.** Add a `siege_my_resources` returning all six
balances. Optional: include "earned this match" projections per node based
on `ResourceConfig` mint amounts.

### Tracking my own commits
**Current behaviour.** `siege_commit` returns `{salt, move}` and warns me
to save them for the matching `siege_reveal` — so I do, by repeating them
back in my conversation transcript. If the conversation is compacted I
lose the salt and can't reveal.

**Surface this in the tool.** The MCP server is already keeping a session
key on my behalf; it can also keep a per-`(match_id, round)` salt+move
cache and let `siege_reveal` work without arguments. Belt and braces:
`siege_get_my_status` could include `pending_reveal: {salt, move}` when
I've committed but not yet revealed, so even a fresh conversation can
recover state.

## Win conditions (currently not surfaced)

From `resolution_1v1.cairo`:

- Either vault hits 0 → match `Finished`, winner = other player.
- Both vaults hit 0 in the same round → `Finished`, `winner_team = 0` (draw).
- `current_round >= 10` after resolve → `Finished`, higher HP wins; tie → draw.

The tool should surface these on `siege_get_match_state` (e.g. a
`rounds_remaining` field and an explicit "draw possible at HP_a==HP_b" note
near round 10). Right now the agent has to read the contract to learn the
draw rule and the round-10 timeout.

## Repair cap (not surfaced)

Repair heals up to 50 HP, then is wasted. Currently `repair` is documented as
`0..3` budget allocation but the cap isn't mentioned. Worth noting in the
`siege_commit` description.

## Budget formula (surfaced — keep it)

`budget = 10 + owned_nodes`, max 13. Already in the agent-prompt and the
match-state response. Good.

## Node ownership (partially surfaced)

Ownership *persists* across rounds until contested. Initial intuition was
"defend nodes every round," but if the opponent contests with 0, owners keep
nodes for free. The match-state response shows `owner` per node which is
sufficient — but a hint in the agent prompt that ownership is sticky would
have saved a round of misallocated budget.

## Trap mechanic (not exercised, but underspecified)

Costs 2 budget per trap, only on owned nodes, only if you're not contesting
that node yourself. From the agent prompt:
- "Hidden": traps are part of the Poseidon commitment, only revealed at reveal.
- "Consumed": last one round.
- Damage: 5, post-repair, non-repairable, applied if opponent takes that node
  this round.

The tool should refuse traps placed on non-owned nodes at commit time rather
than failing on-chain.

## What the tool *should* show, beyond what it does today

Listed by which call should grow the field:

### `siege_get_match_state`
- ✅ **`modifier_details`**: array of `{ gate, code, name, effect }` objects (upstream `083da27`).
- ✅ **`rounds_remaining`**: `10 - current_round`.
- **`my_role`**: A or B. Currently in `siege_get_my_status` only — duplicating it here saves a call.
- **`commit_deadline` / `reveal_deadline`**: pulled from round details; useful for pacing without a separate call.
- **`status_reason`** when finished: which player won, by what (vault zero / round-10 timeout / draw).

### `siege_get_my_status`
- ✅ **`vault_hp`** for the caller's role.
- ✅ **`max_useful_repair`** = `min(3, 50 - vault_hp)`. Visible cap so the agent doesn't overspend on repair.
- ✅ **`rounds_remaining`**.

### `siege_get_round_details` (after reveal)
- ✅ **`modifier_details`**: same shape as on match-state.
- ✅ **`effective_moves`**: `{player_a, player_b}` arrays of `{attack, defense}` per gate after Narrow Pass clamp + Mirror swap. Populated only when both players have revealed.
- **Predicted damage** per gate (computed client-side from the commit data once both reveal). Saves a contract-grep at every endgame turn. *(Not yet built.)*

### `siege_create_match`
- ✅ **`match_id`** in the response (upstream `083da27`). Polls Torii for ~20s after the tx until the new row indexes, so the caller doesn't need a follow-up `siege_get_match_state` to discover the assigned id.

### `siege_resolve_round`
- ✅ **Phase precheck** (upstream `083da27`). Refuses to submit if the current round isn't yet in `"resolving"` phase, returning a clear error instead of submitting a tx that will revert.

### `siege_commit`
- Reject `traps[i] = 1` if node `i` isn't owned by the caller. Currently a bad trap probably reverts on reveal.
- Show effective allocations after Narrow Pass clamp at commit time, so the agent doesn't waste budget on capped gates.

### Errors
- See `TODO.md`: `execute()` doesn't surface on-chain reverts when tx is `ACCEPTED_ON_L2 / REVERTED`. The first two `siege_resolve_round` calls in this match looked successful but had silently reverted on-chain.

## Lesson: read the resolution contract before the first commit

Most useful single fact for an LLM agent: the canonical reference for damage
math is `src/systems/resolution_1v1.cairo`. The agent prompt covers shape and
phase but not enough of the math. Either link to that file from the prompt
or inline a one-screen "damage formula" section.
