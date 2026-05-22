> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Reputation System Design

**Date:** 2026-04-09
**Status:** Approved design
**Depends on:** Kingdom tiers (completed)

## Scope

Match record, rival graph, streak tracking, and matchmaking brackets. Campaign record, alliance history, and soulbound titles are deferred until those systems exist.

## Data Models

### PlayerReputation (one per player)

```
#[key] player: ContractAddress
total_losses: u32
current_streak: i32      // positive = win streak, negative = loss streak
best_streak: u32          // longest win streak ever
bracket: u8               // 0-4, recalculated on every settlement
```

`total_wins` is read from `PlayerKingdom.total_wins` (already tracked by settle_match). Not duplicated here.

### MatchRecord (one per ordered player-pair)

```
#[key] player: ContractAddress
#[key] opponent: ContractAddress
wins: u32
losses: u32
last_match_id: u64
```

Bidirectional: settling a match writes to both `(A, B)` and `(B, A)`. A's `wins` in `(A, B)` equals B's `losses` in `(B, A)`.

## Brackets

5 tiers. Both match count and win rate thresholds must be met. Players can drop brackets if win rate falls.

| Bracket | Name | Requirements |
|---------|------|-------------|
| 0 | Newcomer | 0-9 total matches |
| 1 | Developing | 10+ matches |
| 2 | Experienced | 30+ matches AND >40% win rate |
| 3 | Veteran | 60+ matches AND >50% win rate |
| 4 | Elite | 100+ matches AND >55% win rate |

Total matches = `PlayerKingdom.total_wins` + `PlayerReputation.total_losses`.
Win rate = `total_wins / total_matches`.

Bracket is recalculated on every non-draw settlement by checking thresholds top-down (start at Bracket 4, fall through until one matches).

## Rivals

Derived at read time from `MatchRecord`, not stored separately.

- **Rival:** 5+ total matches between the pair (`wins + losses >= 5`)
- **Blood rival:** 10+ total matches AND win rate between 35-65% (`wins / (wins + losses)` is 0.35-0.65)

## Settlement Integration

On every non-draw match settlement (inside `settle_match` in `world_system.cairo`):

1. Read/initialize `PlayerReputation` for both players
2. Read/initialize `MatchRecord` for both directions `(A, B)` and `(B, A)`
3. Increment winner's `MatchRecord.wins` in `(winner, loser)`, increment loser's `MatchRecord.losses` in `(loser, winner)`
4. Set `last_match_id` on both records
5. Increment `PlayerReputation.total_losses` for the loser
6. Update winner's streak: if `current_streak > 0`, increment; else set to `1`. Update `best_streak` if `current_streak > best_streak`.
7. Update loser's streak: if `current_streak < 0`, decrement; else set to `-1`.
8. Recalculate bracket for both players

**Draws are ignored** — no reputation changes, no streak changes, no match record updates.

## Bracket Calculation

```
fn calculate_bracket(total_wins: u32, total_losses: u32) -> u8 {
    let total = total_wins + total_losses;
    if total < 10 { return 0; }
    let win_rate_pct = (total_wins * 100) / total;
    if total >= 100 && win_rate_pct > 55 { return 4; }
    if total >= 60 && win_rate_pct > 50 { return 3; }
    if total >= 30 && win_rate_pct > 40 { return 2; }
    return 1;
}
```

## Frontend Display

### Player profile / world map inspection
- Bracket name and number
- Win/loss record and win rate percentage
- Current streak and best streak
- Rival list — opponents with 5+ matches, showing head-to-head record
- Blood rivals highlighted (10+ matches, 35-65% win rate)

### Pre-match screen
- Opponent's bracket, win rate, and streak visible
- Mismatch warning if bracket difference >= 2
- Head-to-head record against this opponent (if any)

### No contract enforcement
Brackets are advisory. The frontend warns about mismatches but `create_staked_match` does not reject based on bracket. This keeps the system simple and avoids blocking legitimate challenges.

## What This Does NOT Include

- Campaign record (deferred until campaign system exists)
- Alliance history (deferred until faction system exists)
- Soulbound titles and trophies (separate implementation item)
- Matchmaking queue (out of scope — matches remain manual challenges)
