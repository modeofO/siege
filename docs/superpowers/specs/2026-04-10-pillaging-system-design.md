# Pillaging System Design

**Date:** 2026-04-10
**Status:** Approved design
**Depends on:** World map, staked matches, resource drip (all completed)

## Purpose

Pillaging is the "rock bottom punishment" from the game direction redesign. Losing matches to neighbors lets them siphon your passive resource income for a limited time. You're never eliminated — home parcels stay yours — but a pillaged player feels real pressure to either fight back or negotiate.

Pillaging targets the `claim_drip` passive income channel. Match-end resource rewards are NOT affected (playing matches is a way to escape pillage pressure).

## Trigger Flow

1. **Win a staked match** against a neighbor in `settle_match`
2. **Eligibility check**: if the winner owns at least one parcel adjacent to at least one of the loser's home parcels, a `PillageEligibility` record is written
3. **24-hour window**: the winner has 24 hours to call `initiate_pillage(match_id, home_parcel_id)`
4. **Initiation**: the winner picks which specific home parcel to drain, creating a `Pillage` record that lasts 24 hours from initiation

Eligibilities are per-match. Multiple match wins give multiple independent eligibilities.

## Data Models

### PillageEligibility — short-lived grant from a match win

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct PillageEligibility {
    #[key]
    pub winner: ContractAddress,
    #[key]
    pub match_id: u64,
    pub loser: ContractAddress,
    pub granted_at: u64,
    pub expires_at: u64,
    pub used: bool,
}
```

Key: `(winner, match_id)`. The combination of winner + match_id is unique because a given winner only wins a given match once.

`used` flags whether the winner has already consumed this eligibility via `initiate_pillage`.

### Pillage — active pillage on a specific home parcel

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct Pillage {
    #[key]
    pub home_parcel_id: u32,
    pub pillager: ContractAddress,
    pub target: ContractAddress,
    pub start_time: u64,
    pub expires_at: u64,
    pub last_claim_time: u64,
    pub active: bool,
}
```

Key: `home_parcel_id`. One home parcel can have at most one active pillage. `active = false` means the pillage has ended (expired, broken, or adjacency lost).

`last_claim_time` tracks when the pillager last called `claim_pillage_drip`, so unclaimed intervals can be calculated.

## Contract Functions

### `settle_match` (modified) — grant eligibility

After the existing win/loss processing, add:

1. Determine the winner and loser (already done)
2. For the winner, check if they own any parcel adjacent to any of the loser's home parcels
3. If yes, write a new `PillageEligibility` with `granted_at = now`, `expires_at = now + 24h`, `used = false`

Also add pillage-breaking logic: iterate the winner's 3 home parcels, check if any has an active `Pillage` where `pillager == loser`, and if so set `active = false`.

### `initiate_pillage(match_id, home_parcel_id)` — new function

1. Read `PillageEligibility((caller, match_id))`
2. Assert `eligibility.expires_at > now` and `eligibility.used == false`
3. Assert the target home parcel belongs to `eligibility.loser` and is a home parcel
4. Assert the caller has at least one parcel adjacent to the target home parcel
5. Assert no active `Pillage` exists on that home parcel (`Pillage((home_parcel_id)).active == false` OR the record doesn't exist)
6. Create new `Pillage` record with `start_time = now`, `expires_at = now + 24h`, `last_claim_time = now`, `active = true`
7. Mark the eligibility as used (`used = true`)

### `claim_pillage_drip(home_parcel_id)` — new function

1. Read `Pillage((home_parcel_id))`
2. Assert `pillage.active == true` and `caller == pillage.pillager`
3. Compute effective end time: `end_time = min(now, pillage.expires_at)`
4. Lazy adjacency check: scan the caller's parcels for one adjacent to `home_parcel_id`. If none, set `pillage.active = false`, write, and return without minting.
5. Calculate intervals: `intervals = (end_time - pillage.last_claim_time) / DRIP_INTERVAL`
6. If `intervals == 0`, return without minting
7. Read the home parcel's `parcel_type` and call `mint_parcel_resources(rc, parcel_type, caller, intervals as u256)` — same helper the owner's drip uses, just sending to the pillager
8. Advance `pillage.last_claim_time += intervals * DRIP_INTERVAL`
9. If `now >= pillage.expires_at`, set `pillage.active = false`
10. Write the updated pillage

### `claim_drip` (modified) — owner's drip, skip pillaged parcels

Current behavior: iterates home parcels, mints resources for each, advances `last_drip_time`.

Modified behavior: for each home parcel, read the `Pillage` record and check `pillage.active == true && pillage.expires_at > now`. If both true, skip minting for that parcel (the owner loses that income for this claim). Otherwise, mint as before.

Note: an expired-but-not-yet-claimed pillage (`active == true` but `expires_at <= now`) counts as NOT pillaging the owner — the owner is free to collect income from that parcel again. The stale `active` flag will be cleaned up the next time anyone calls `claim_pillage_drip` on it.

`last_drip_time` still advances for the whole claim (not per-parcel). This means if a parcel is pillaged at the moment of claim, the owner forfeits that interval's income from it. Acceptable simplification — the owner can call `claim_drip` just before a pillage starts to capture pending resources.

## Pillage Termination (All Lazy Evaluation)

A pillage can end in three ways, all checked at the next claim:

**1. Natural expiration**
- When `claim_pillage_drip` runs and `now >= expires_at`, set `active = false` after minting the final intervals (capped at `expires_at`)
- A stale pillage (expired but not yet claimed) doesn't affect the owner's `claim_drip` — when the owner claims, their function checks `pillage.active && pillage.expires_at > now` to decide whether the parcel is still being pillaged

**2. Pillaged player beats the pillager**
- Handled in `settle_match` (see above) — when the pillaged player wins, any active pillage where `pillager == loser` is set to `active = false`
- This happens eagerly (not lazily) because it's tied to the settlement flow

**3. Adjacency broken**
- When `claim_pillage_drip` runs, the adjacency check fires
- If the pillager no longer borders the target home parcel, set `active = false` without minting
- Pillager forfeits all unclaimed time

## What Does NOT Break a Pillage

- The owner losing a conquered parcel (home parcels are never lost)
- The owner losing a match to someone OTHER than the pillager
- Time passing without claims (the pillage keeps accumulating up to `expires_at`)

## Frontend Display

### New hooks

`useActivePillages(playerAddress)` — queries `Pillage` models via Torii:
- Returns two lists: pillages where the caller is `pillager` (raiding), and pillages where the caller is `target` (being raided)
- Filtered to `active == true` AND `expires_at > now`

`usePillageEligibilities(playerAddress)` — queries `PillageEligibility` models:
- Returns unused (`used == false`), unexpired (`expires_at > now`) eligibilities for the caller
- Each entry includes the loser address so the UI can show which opponent's home parcels are targetable

### UI components

**Pillage section on player profile**:
- "My Active Raids" — list of pillages the player is running (target, home parcel, hours remaining, unclaimed resources, Claim button)
- "Pending Eligibilities" — unused eligibilities with "Pillage" button that opens a home parcel picker
- "Being Raided" — active pillages on the player's home parcels (pillager name, home parcel type, hours remaining)

**World map**:
- Pillage indicator icon on home parcels with an active pillage
- Hover tooltip shows pillager name and time remaining

**Post-match screen**:
- If the player won and a `PillageEligibility` was created, show "You can pillage [loser]" with a button to initiate

### Contract call wrappers

```typescript
export async function initiatePillage(account, matchId, homeParcelId) { ... }
export async function claimPillageDrip(account, homeParcelId) { ... }
```

## Adjacency Helper

The existing `is_adjacent_to_territory(player, col, row)` helper in `world_system.cairo` already supports the adjacency check for an arbitrary hex. It can be reused for both `initiate_pillage` and `claim_pillage_drip`.

For `settle_match`, we need a new helper: `has_adjacent_to_any_home(pillager, target)` that iterates the target's 3 home parcels and checks if the pillager borders any of them. This returns as soon as it finds one match.

## What This Does NOT Include

- Faction-based pillage protection (no factions yet — deferred)
- Pillager can't currently cancel a pillage manually (not worth extra function for MVP)
- No resource-cost to initiate — the match win is the "cost"
- No UI notification system (frontend polling is sufficient)
- No pillage history / leaderboard (reputation tracks wins, which covers this)

## Testing

Cairo tests in `src/tests/test_pillaging.cairo`:

- `test_settle_match_grants_eligibility` — win against neighbor creates eligibility
- `test_settle_match_no_eligibility_without_adjacency` — win against non-neighbor creates nothing
- `test_initiate_pillage_happy_path` — use eligibility to start a pillage
- `test_initiate_pillage_rejects_expired_eligibility` — past `expires_at`
- `test_initiate_pillage_rejects_used_eligibility` — second attempt fails
- `test_initiate_pillage_rejects_non_home_parcel` — must target a home parcel
- `test_initiate_pillage_rejects_no_adjacency` — pillager lost adjacency before initiating
- `test_initiate_pillage_rejects_already_pillaged` — only one pillager per home parcel
- `test_claim_pillage_drip_mints_resources` — claiming after 1 hour gives 1 interval of resources
- `test_claim_drip_skips_pillaged_parcel` — owner gets 0 from a pillaged home parcel
- `test_claim_drip_includes_non_pillaged_parcels` — owner still gets income from unpillaged home parcels
- `test_pillage_expires_naturally` — after 24 hours the pillage auto-ends
- `test_pillage_ends_when_target_beats_pillager` — revenge match breaks the pillage
- `test_pillage_ends_on_broken_adjacency` — pillager loses their bordering parcel

## Implementation Priority

1. Models: `PillageEligibility`, `Pillage`
2. `settle_match` eligibility grant + pillage-break logic
3. `initiate_pillage` function
4. `claim_pillage_drip` function
5. `claim_drip` modification
6. Full Cairo test suite
7. Frontend hooks and UI
