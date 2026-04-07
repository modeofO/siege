# Phase 2B: Ability Effects in Battle

Add tactical ability activation to 1v1 matches. Players activate abilities during rounds as part of their commit-reveal allocation. Each ability has a unique combat effect applied during resolution.

## Prerequisite For

- World System (ability staking only matters if abilities have tactical value)
- Conquest (attacker's edge is ability usage against static defense)

## Commitment Hash Change

The Poseidon hash grows from 14 to **16 elements**:

```
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

- `ability_id`: 0 = no ability this round, 1-5 = ability to activate
- `ability_target`: 0-2 = target gate index (only meaningful for Siege Sword, ignored otherwise)

Both fields are committed and revealed like all other allocations. Neither player knows what the other activated until both reveal.

## Ability Effects

All effects apply during the same round they are activated.

| ID | Ability | Effect |
|----|---------|--------|
| 1 | Siege Sword | Player's attack on the chosen target gate becomes 10 (overrides allocated value) |
| 2 | Stone Cloak | All gate damage dealt to this player becomes 0. Does NOT block Ember Blast (which bypasses gates). |
| 3 | Ember Blast | Deal 5 direct vault damage to opponent, bypassing gates entirely. Applied post-repair, same timing as trap damage. |
| 4 | Hex | Reduce opponent's total gate damage output by 7 (floor at 0). Effectively absorbs 7 points of incoming gate damage. |
| 5 | Fortify | Double this player's defense values at all 3 gates (applied after gate modifiers). |

## Resolution Order

The existing resolution logic is extended. New steps are marked with **(NEW)**.

1. **Apply gate modifiers** (Narrow Pass, Mirror, Deadlock, Overflow) — unchanged, modifies raw attack/defense values
2. **(NEW) Apply Fortify** — if a player activated Fortify, double their defense values at all 3 gates (after modifier application, so Narrow Pass cap of 3 is doubled to 6 if Fortify is active)
3. **(NEW) Apply Siege Sword** — if a player activated Siege Sword, set their attack on the target gate to 10 (overrides the allocated + modifier-adjusted value)
4. **Calculate gate damage** — `damage = max(0, attack - defense)` per gate, same logic as current
5. **Sum total damage per side** — unchanged
6. **(NEW) Apply Hex** — if a player activated Hex, reduce the opponent's total gate damage by 7 (floor at 0)
7. **(NEW) Apply Stone Cloak** — if a player activated Stone Cloak, set all gate damage dealt to them to 0
8. **Apply Overflow/Reflection** — distribute reflected damage from Overflow gates to other gates, reduced by unused defense — unchanged logic. Note: Stone Cloak zeroes damage BEFORE reflection distribution, so reflected damage from a Cloaked player's gates is also 0.
9. **Repair** — apply repair (capped at 3) — unchanged
10. **(NEW) Apply Ember Blast** — if a player activated Ember Blast, deal 5 direct vault damage to opponent (post-repair, not repairable, same timing as traps)
11. **Apply trap damage** — unchanged

## Key Interactions

### Stone Cloak vs Ember Blast
Stone Cloak blocks all gate damage but Ember Blast bypasses gates entirely. Stone Cloak does NOT protect against Ember Blast. This creates the core counter dynamic — Ember Blast is the answer to Stone Cloak.

### Siege Sword + Gate Modifiers
- **Siege Sword + Deadlock gate**: The Siege Sword sets attack to 10, but Deadlock means no damage at that gate. The Sword is wasted. Players should read the visible modifiers before choosing their target gate.
- **Siege Sword + Narrow Pass**: Narrow Pass caps attack at 3 BEFORE Siege Sword overrides to 10. Since Siege Sword applies after modifiers (step 3), it overrides the cap. Siege Sword is effective against Narrow Pass.
- **Siege Sword + Mirror Gate**: Mirror swaps attack/defense values (step 1). Siege Sword then sets the attack on the target gate to 10 (step 3), overriding the swapped value. Siege Sword is effective against Mirror.

### Fortify + Narrow Pass
Narrow Pass caps defense at 3 (step 1). Fortify doubles defense (step 2). Result: defense at that gate becomes 6. Fortify partially counters Narrow Pass.

### Hex + Stone Cloak (same opponent)
If Player A uses Hex and Player B uses Stone Cloak: B takes 0 gate damage (Cloak), so Hex's -7 reduction is irrelevant (reducing 0 by 7 is still 0). Both abilities are "wasted" against each other.

### Hex + Overflow
Hex reduces total gate damage by 7. Overflow redistributes excess damage to other gates. Hex applies to the total AFTER overflow damage is distributed (step 6 after step 8). Wait — this is a contradiction in the resolution order. Let me clarify:

**Corrected order for Hex and Overflow:**
- Steps 4-5: Calculate base gate damage and total
- Step 6: Apply Hex to reduce total
- Step 7: Apply Stone Cloak
- Step 8: Redistribute Overflow

Actually, Hex should apply to the FINAL total damage, after all gate-level adjustments. So Hex should move to after Overflow:

**Revised resolution order:**
1. Apply gate modifiers
2. Apply Fortify (double defense)
3. Apply Siege Sword (set attack to 10)
4. Calculate per-gate damage
5. Apply Stone Cloak (zero gate damage to this player)
6. Apply Overflow/Reflection (redistribute)
7. Apply Hex (reduce opponent's total damage by 7)
8. Repair
9. Apply Ember Blast (5 direct)
10. Apply trap damage

This ensures Hex reduces the final gate damage total after all gate-level effects are resolved.

### Both Players Activate Same Round
Both commitments are blind. Mindgames are core gameplay:
- A uses Siege Sword on gate 0, B uses Stone Cloak → Sword wasted
- A uses Ember Blast, B uses Stone Cloak → Cloak blocks gates but Blast hits vault
- A uses Hex, B uses Siege Sword → Sword damage reduced by Hex

## Usage Rules

- Each player brings up to 3 abilities into a match.
- Each brought ability can be activated **once per match** (single-use across all 10 rounds).
- A player can only activate abilities they brought. The contract verifies the `ability_id` is in their brought set and hasn't been used yet.
- `ability_id = 0` means no ability activated that round (always valid).
- At most 1 ability per player per round.

## New Model: MatchAbilities1v1

```
Keys: match_id (u64)
Fields:
  a_ability_1, a_ability_2, a_ability_3: u8  (ability IDs player A brought, 0 = empty)
  b_ability_1, b_ability_2, b_ability_3: u8  (ability IDs player B brought, 0 = empty)
  a_used_1, a_used_2, a_used_3: bool         (has player A used each slot?)
  b_used_1, b_used_2, b_used_3: bool         (has player B used each slot?)
```

This model is set at match creation (players declare their 3 abilities) and updated each round as abilities are used.

## Contract Changes

### commit_reveal_1v1
- `reveal()` function gains two additional parameters: `ability_id: u8`, `ability_target: u8`
- Hash verification uses 16 elements instead of 14
- On reveal: validate `ability_id` is in the player's brought set (from MatchAbilities1v1) and not yet used. If valid and non-zero, mark as used.
- Store `ability_id` and `ability_target` in RoundMoves1v1 (add fields) for resolution to read.

### RoundMoves1v1 (model extension)
Add fields:
- `a_ability_id: u8`, `a_ability_target: u8`
- `b_ability_id: u8`, `b_ability_target: u8`

### resolution_1v1
- Read ability activations from RoundMoves1v1
- Apply effects in the resolution order defined above
- No changes to node contest, trap, or resource minting logic

### Frontend changes
- `crypto.ts`: `computeCommitment1v1()` updated for 16 elements
- `contracts1v1.ts`: `reveal()` call includes ability params
- UI: ability selection per round (choose which ability to activate, if any)
- `gameState1v1.ts`: display ability activations in round history

## What This Does NOT Include

- Ability staking or escrow (world system, separate plan)
- Ability burning or consumption (removed from design — abilities persist)
- Conquest-specific ability usage (conquest plan handles this)
- How players "bring" abilities into a match (currently just declared; escrow comes with world system)
