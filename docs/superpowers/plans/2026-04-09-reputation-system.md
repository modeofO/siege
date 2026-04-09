# Reputation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an onchain reputation system that tracks match records, rival relationships, win streaks, and matchmaking brackets — all updated automatically when matches are settled.

**Architecture:** Two new Dojo models (`PlayerReputation`, `MatchRecord`) written by `settle_match` in `world_system.cairo`. A pure function `calculate_bracket` determines bracket from win/loss totals. Frontend adds hooks to query reputation data and displays brackets, rivals, and mismatch warnings.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, Next.js, React 19, Tailwind 4

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/models/player_reputation.cairo` | Per-player aggregate stats: losses, streak, bracket |
| Create | `src/models/match_record.cairo` | Per player-pair head-to-head record |
| Modify | `src/lib.cairo` | Register new models and test module |
| Modify | `src/systems/world_system.cairo` | Update reputation on settlement |
| Create | `src/tests/test_reputation.cairo` | All reputation tests |
| Create | `frontend/src/lib/reputation.ts` | Bracket constants, rival logic, hooks |
| Modify | `frontend/src/lib/contracts1v1.ts` | No changes needed (settlement already exists) |

---

### Task 1: Create PlayerReputation and MatchRecord Models

**Files:**
- Create: `src/models/player_reputation.cairo`
- Create: `src/models/match_record.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create PlayerReputation model**

Create `src/models/player_reputation.cairo`:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerReputation {
    #[key]
    pub player: ContractAddress,
    pub total_losses: u32,
    pub current_streak: i32,
    pub best_streak: u32,
    pub bracket: u8,
}
```

- [ ] **Step 2: Create MatchRecord model**

Create `src/models/match_record.cairo`:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchRecord {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub opponent: ContractAddress,
    pub wins: u32,
    pub losses: u32,
    pub last_match_id: u64,
}
```

- [ ] **Step 3: Register models in lib.cairo**

Add to the `pub mod models` block in `src/lib.cairo`:

```cairo
pub mod player_reputation;
pub mod match_record;
```

- [ ] **Step 4: Write a basic read/write test**

Create `src/tests/test_reputation.cairo`:

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::player_reputation::{PlayerReputation, m_PlayerReputation};
    use siege_dojo::models::match_record::{MatchRecord, m_MatchRecord};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH),
                TestResource::Model(m_MatchRecord::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_player_reputation_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let player = contract_address_const::<0x1>();
        world.write_model_test(@PlayerReputation {
            player,
            total_losses: 5,
            current_streak: 3,
            best_streak: 7,
            bracket: 2,
        });

        let rep: PlayerReputation = world.read_model(player);
        assert(rep.total_losses == 5, 'losses should be 5');
        assert(rep.current_streak == 3, 'streak should be 3');
        assert(rep.best_streak == 7, 'best_streak should be 7');
        assert(rep.bracket == 2, 'bracket should be 2');
    }

    #[test]
    fn test_match_record_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let player = contract_address_const::<0x1>();
        let opponent = contract_address_const::<0x2>();
        world.write_model_test(@MatchRecord {
            player,
            opponent,
            wins: 3,
            losses: 2,
            last_match_id: 42,
        });

        let record: MatchRecord = world.read_model((player, opponent));
        assert(record.wins == 3, 'wins should be 3');
        assert(record.losses == 2, 'losses should be 2');
        assert(record.last_match_id == 42, 'last_match_id should be 42');
    }
}
```

- [ ] **Step 5: Register test module in lib.cairo**

Add to the `#[cfg(test)]` block in `src/lib.cairo`:

```cairo
pub mod test_reputation;
```

- [ ] **Step 6: Run tests**

Run: `sozo test -f test_player_reputation_model && sozo test -f test_match_record_model`
Expected: Both PASS

- [ ] **Step 7: Commit**

```bash
git add src/models/player_reputation.cairo src/models/match_record.cairo src/tests/test_reputation.cairo src/lib.cairo
git commit -m "feat: add PlayerReputation and MatchRecord Dojo models"
```

---

### Task 2: Add calculate_bracket Function

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_reputation.cairo`

- [ ] **Step 1: Write tests for bracket calculation**

Add to `src/tests/test_reputation.cairo` (inside the `mod tests` block):

```cairo
use siege_dojo::systems::world_system::calculate_bracket;

#[test]
fn test_bracket_newcomer() {
    // 0-9 matches = Bracket 0
    assert(calculate_bracket(3, 2) == 0, '5 matches: newcomer');
    assert(calculate_bracket(0, 0) == 0, '0 matches: newcomer');
    assert(calculate_bracket(5, 4) == 0, '9 matches: newcomer');
}

#[test]
fn test_bracket_developing() {
    // 10+ matches, any win rate = Bracket 1
    assert(calculate_bracket(5, 5) == 1, '10 matches 50%: developing');
    assert(calculate_bracket(2, 8) == 1, '10 matches 20%: developing');
    assert(calculate_bracket(15, 14) == 1, '29 matches: developing');
}

#[test]
fn test_bracket_experienced() {
    // 30+ matches AND >40% win rate = Bracket 2
    assert(calculate_bracket(15, 15) == 2, '30 matches 50%: experienced');
    assert(calculate_bracket(13, 17) == 2, '30 matches 43%: experienced');
    // 30+ matches but <=40% = stays at Bracket 1
    assert(calculate_bracket(12, 18) == 1, '30 matches 40%: still developing');
}

#[test]
fn test_bracket_veteran() {
    // 60+ matches AND >50% win rate = Bracket 3
    assert(calculate_bracket(35, 25) == 3, '60 matches 58%: veteran');
    // 60+ matches but <=50% = Bracket 2 (if >40%) or Bracket 1
    assert(calculate_bracket(30, 30) == 2, '60 matches 50%: experienced');
}

#[test]
fn test_bracket_elite() {
    // 100+ matches AND >55% win rate = Bracket 4
    assert(calculate_bracket(60, 40) == 4, '100 matches 60%: elite');
    assert(calculate_bracket(56, 44) == 4, '100 matches 56%: elite');
    // 100+ matches but <=55% = Bracket 3 (if >50%) or lower
    assert(calculate_bracket(55, 45) == 3, '100 matches 55%: veteran');
    assert(calculate_bracket(40, 60) == 1, '100 matches 40%: developing');
}

#[test]
fn test_bracket_drop() {
    // Player with 200 matches and 45% win rate should be Bracket 2 (not higher)
    assert(calculate_bracket(90, 110) == 2, '200 matches 45%: experienced');
    // Player with 200 matches and 30% win rate drops to Bracket 1
    assert(calculate_bracket(60, 140) == 1, '200 matches 30%: developing');
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_bracket_newcomer`
Expected: FAIL — `calculate_bracket` doesn't exist

- [ ] **Step 3: Add calculate_bracket to world_system.cairo**

Add this public function outside the `mod world_system` block (alongside `tier_ability_slots` and the other helper functions):

```cairo
pub fn calculate_bracket(total_wins: u32, total_losses: u32) -> u8 {
    let total = total_wins + total_losses;
    if total < 10 {
        return 0;
    }
    let win_rate_pct = (total_wins * 100) / total;
    if total >= 100 && win_rate_pct > 55 {
        return 4;
    }
    if total >= 60 && win_rate_pct > 50 {
        return 3;
    }
    if total >= 30 && win_rate_pct > 40 {
        return 2;
    }
    1
}
```

- [ ] **Step 4: Run all bracket tests**

Run: `sozo test -f test_bracket_`
Expected: All 6 bracket tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_reputation.cairo
git commit -m "feat: add calculate_bracket function for reputation brackets"
```

---

### Task 3: Update settle_match to Write Reputation

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_reputation.cairo`

- [ ] **Step 1: Write the test**

Add a full-setup test to `src/tests/test_reputation.cairo`. This needs the complete world setup (mirrors `test_staked_match.cairo` and `test_kingdom_tiers.cairo` patterns). Add the necessary imports, MockVrfProvider, MockAccount, deploy helpers, namespace_def with all models, contract_defs, and full_setup function.

The full_setup must include `m_PlayerReputation` and `m_MatchRecord` in the namespace_def resources array.

Test:

```cairo
#[test]
fn test_settle_updates_reputation() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    // Player A wins
    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });

    world_sys.settle_match(match_id);

    // Check PlayerReputation
    let rep_a: PlayerReputation = world.read_model(player_a);
    assert(rep_a.total_losses == 0, 'a should have 0 losses');
    assert(rep_a.current_streak == 1, 'a streak should be 1');
    assert(rep_a.best_streak == 1, 'a best streak should be 1');

    let rep_b: PlayerReputation = world.read_model(player_b);
    assert(rep_b.total_losses == 1, 'b should have 1 loss');
    assert(rep_b.current_streak == -1, 'b streak should be -1');

    // Check MatchRecord
    let record_ab: MatchRecord = world.read_model((player_a, player_b));
    assert(record_ab.wins == 1, 'a->b wins should be 1');
    assert(record_ab.losses == 0, 'a->b losses should be 0');
    assert(record_ab.last_match_id == match_id, 'last_match_id should match');

    let record_ba: MatchRecord = world.read_model((player_b, player_a));
    assert(record_ba.wins == 0, 'b->a wins should be 0');
    assert(record_ba.losses == 1, 'b->a losses should be 1');
}

#[test]
fn test_settle_draw_ignores_reputation() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    // Draw
    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 25, vault_b_hp: 25,
        current_round: 10,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });

    world_sys.settle_match(match_id);

    let rep_a: PlayerReputation = world.read_model(player_a);
    assert(rep_a.total_losses == 0, 'a losses should be 0');
    assert(rep_a.current_streak == 0, 'a streak should be 0');

    let record_ab: MatchRecord = world.read_model((player_a, player_b));
    assert(record_ab.wins == 0, 'record should be empty');
    assert(record_ab.losses == 0, 'record should be empty');
}

#[test]
fn test_streak_tracking() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Play 3 matches, A wins all
    let mut i: u32 = 0;
    while i < 3 {
        starknet::testing::set_contract_address(player_a);
        let mid = world_sys.create_staked_match(player_b, array![1]);
        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(mid, array![2]);

        world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
            match_id: mid, player_a, player_b,
            vault_a_hp: 30, vault_b_hp: 0,
            current_round: 5,
            status: siege_dojo::models::match_state::MatchStatus::Finished,
        });
        world_sys.settle_match(mid);
        i += 1;
    };

    let rep_a: PlayerReputation = world.read_model(player_a);
    assert(rep_a.current_streak == 3, 'a streak should be 3');
    assert(rep_a.best_streak == 3, 'a best should be 3');

    let rep_b: PlayerReputation = world.read_model(player_b);
    assert(rep_b.current_streak == -3, 'b streak should be -3');
    assert(rep_b.total_losses == 3, 'b losses should be 3');
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_settle_updates_reputation`
Expected: FAIL — settle_match doesn't write reputation models

- [ ] **Step 3: Add reputation imports to world_system.cairo**

Add to the imports inside `mod world_system`:

```cairo
use siege_dojo::models::player_reputation::PlayerReputation;
use siege_dojo::models::match_record::MatchRecord;
```

- [ ] **Step 4: Add reputation update logic to settle_match**

In `settle_match`, inside the non-draw branch (`else` after the draw check), AFTER the existing `winner_kingdom.total_wins` increment and `world.write_model(@winner_kingdom)`, add:

```cairo
// Update reputation
let mut rep_winner: PlayerReputation = world.read_model(winner);
let mut rep_loser: PlayerReputation = world.read_model(loser);

// Loser stats
rep_loser.total_losses += 1;
if rep_loser.current_streak < 0 {
    rep_loser.current_streak -= 1;
} else {
    rep_loser.current_streak = -1;
}

// Winner stats (total_wins already in PlayerKingdom)
if rep_winner.current_streak > 0 {
    rep_winner.current_streak += 1;
} else {
    rep_winner.current_streak = 1;
}
let streak_u32: u32 = rep_winner.current_streak.try_into().unwrap();
if streak_u32 > rep_winner.best_streak {
    rep_winner.best_streak = streak_u32;
}

// Recalculate brackets
rep_winner.bracket = super::calculate_bracket(winner_kingdom.total_wins, rep_winner.total_losses);
let loser_kingdom: PlayerKingdom = world.read_model(loser);
rep_loser.bracket = super::calculate_bracket(loser_kingdom.total_wins, rep_loser.total_losses);

world.write_model(@rep_winner);
world.write_model(@rep_loser);

// Update match records (bidirectional)
let mut record_wl: MatchRecord = world.read_model((winner, loser));
record_wl.wins += 1;
record_wl.last_match_id = match_id;
world.write_model(@record_wl);

let mut record_lw: MatchRecord = world.read_model((loser, winner));
record_lw.losses += 1;
record_lw.last_match_id = match_id;
world.write_model(@record_lw);
```

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_settle_updates_reputation && sozo test -f test_settle_draw_ignores_reputation && sozo test -f test_streak_tracking`
Expected: All PASS

- [ ] **Step 6: Run ALL tests**

Run: `sozo test`
Expected: All pass. The new models need to be registered in any test namespace_def that includes world_system. If `test_staked_match.cairo` or `test_kingdom_tiers.cairo` fail because the world_system now reads/writes the new models, add `m_PlayerReputation` and `m_MatchRecord` to their namespace_def resource arrays.

- [ ] **Step 7: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_reputation.cairo
git commit -m "feat: update settle_match to write reputation and match records"
```

---

### Task 4: Fix Existing Tests for New Models

**Files:**
- Modify: `src/tests/test_staked_match.cairo`
- Modify: `src/tests/test_kingdom_tiers.cairo`

After Task 3, any test file that uses `world_system` and calls `settle_match` may need the new models registered. The Dojo test world must know about all models that a contract writes.

- [ ] **Step 1: Run all tests to find failures**

Run: `sozo test`
Note which tests fail.

- [ ] **Step 2: Add model imports and registrations**

In each failing test file, add to the imports:

```cairo
use siege_dojo::models::player_reputation::m_PlayerReputation;
use siege_dojo::models::match_record::m_MatchRecord;
```

And add to the `namespace_def()` resources array:

```cairo
TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH),
TestResource::Model(m_MatchRecord::TEST_CLASS_HASH),
```

- [ ] **Step 3: Run all tests**

Run: `sozo test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_staked_match.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "fix: register reputation models in existing test worlds"
```

---

### Task 5: Frontend Reputation Hooks and Display

**Files:**
- Create: `frontend/src/lib/reputation.ts`

- [ ] **Step 1: Create reputation.ts**

Create `frontend/src/lib/reputation.ts`:

```typescript
import { useEffect, useState } from "react";

export const BRACKET_NAMES = ["Newcomer", "Developing", "Experienced", "Veteran", "Elite"] as const;
export type BracketName = (typeof BRACKET_NAMES)[number];

export function bracketName(bracket: number): BracketName {
  return BRACKET_NAMES[bracket] ?? "Newcomer";
}

export interface PlayerReputationData {
  totalWins: number;
  totalLosses: number;
  totalMatches: number;
  winRate: number; // 0-100
  currentStreak: number;
  bestStreak: number;
  bracket: number;
}

export interface MatchRecordData {
  opponent: string;
  wins: number;
  losses: number;
  totalMatches: number;
  lastMatchId: number;
  isRival: boolean;      // 5+ matches
  isBloodRival: boolean; // 10+ matches, 35-65% win rate
}

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

export function usePlayerReputation(playerAddress: string | null): PlayerReputationData | null {
  const [data, setData] = useState<PlayerReputationData | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      // Query both PlayerReputation and PlayerKingdom (for total_wins)
      const result = await toriiQuery<{
        siegeDojoPlayerReputationModels: GraphEdges<{
          total_losses: string;
          current_streak: string;
          best_streak: string;
          bracket: string;
        }>;
        siegeDojoPlayerKingdomModels: GraphEdges<{
          total_wins: string;
        }>;
      }>(`
        query {
          siegeDojoPlayerReputationModels(where: { player: "${playerAddress}" }) {
            edges { node { total_losses current_streak best_streak bracket } }
          }
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node { total_wins } }
          }
        }
      `);

      const rep = result?.siegeDojoPlayerReputationModels?.edges?.[0]?.node;
      const kingdom = result?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;

      const totalWins = toNum(kingdom?.total_wins);
      const totalLosses = toNum(rep?.total_losses);
      const totalMatches = totalWins + totalLosses;

      setData({
        totalWins,
        totalLosses,
        totalMatches,
        winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
        currentStreak: toNum(rep?.current_streak),
        bestStreak: toNum(rep?.best_streak),
        bracket: toNum(rep?.bracket),
      });
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function useMatchRecords(playerAddress: string | null): MatchRecordData[] {
  const [records, setRecords] = useState<MatchRecordData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      const result = await toriiQuery<{
        siegeDojoMatchRecordModels: GraphEdges<{
          opponent: string;
          wins: string;
          losses: string;
          last_match_id: string;
        }>;
      }>(`
        query {
          siegeDojoMatchRecordModels(where: { player: "${playerAddress}" }) {
            edges { node { opponent wins losses last_match_id } }
          }
        }
      `);

      const entries = (result?.siegeDojoMatchRecordModels?.edges || []).map((e) => {
        const wins = toNum(e.node.wins);
        const losses = toNum(e.node.losses);
        const totalMatches = wins + losses;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
        return {
          opponent: e.node.opponent,
          wins,
          losses,
          totalMatches,
          lastMatchId: toNum(e.node.last_match_id),
          isRival: totalMatches >= 5,
          isBloodRival: totalMatches >= 10 && winRate >= 35 && winRate <= 65,
        };
      });

      // Sort by total matches descending (most-played opponents first)
      entries.sort((a, b) => b.totalMatches - a.totalMatches);
      setRecords(entries);
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return records;
}

export function bracketMismatchWarning(myBracket: number, opponentBracket: number): string | null {
  const diff = Math.abs(myBracket - opponentBracket);
  if (diff < 2) return null;
  const direction = opponentBracket > myBracket ? "above" : "below";
  return `This opponent is ${diff} brackets ${direction} you`;
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All pass (no breaking changes)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/reputation.ts
git commit -m "feat: add reputation hooks — usePlayerReputation, useMatchRecords, bracket utils"
```

---

### Task 6: Final Integration Test

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All pass

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All pass

- [ ] **Step 3: Commit any fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: integration fixes for reputation system"
```
