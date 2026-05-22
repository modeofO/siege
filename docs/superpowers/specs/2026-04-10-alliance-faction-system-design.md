> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Alliance / Faction System Design

**Date:** 2026-04-10
**Status:** Approved design
**Depends on:** Kingdom tiers, conquest, pillaging (all completed)

## Scope

Formation, membership, shared borders, conquest reinforcement (defender opt-in), pillage protection. Deferred: resource gifting (nice-to-have, ERC-20 transfers work from wallets already), campaign coordination (campaigns don't exist yet), faction reputation and leaderboards (not enough player data to be meaningful).

## Data Models

### Faction — the guild itself

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Faction {
    #[key]
    pub faction_id: u32,
    pub leader: ContractAddress,
    pub name: felt252,        // up to 31 ASCII chars
    pub tag: felt252,          // short tag (2-5 chars)
    pub member_count: u32,
    pub created_at: u64,
    pub dissolved: bool,
}
```

### FactionMember — per-player membership

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionMember {
    #[key]
    pub player: ContractAddress,
    pub faction_id: u32,       // 0 = not in a faction
    pub joined_at: u64,
    pub last_leave_time: u64,  // for 24h cooldown after leaving/being kicked
}
```

A player is in at most one faction. `faction_id == 0` means "not in a faction."

### FactionInvite — pending invitation record

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionInvite {
    #[key]
    pub target: ContractAddress,
    #[key]
    pub faction_id: u32,
    pub invited_by: ContractAddress,
    pub invited_at: u64,
    pub used: bool,
}
```

### FactionCounter — global ID counter

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionCounter {
    #[key]
    pub id: u8,  // always 0
    pub count: u32,
}
```

Faction IDs start at 1. `0` is the sentinel for "no faction" in `FactionMember`.

### PlayerKingdom field addition

Add one field to the existing `PlayerKingdom` model:

```cairo
pub faction_reinforcement_enabled: bool,  // default false
```

Default is `false` so opting in is explicit.

## Formation Cost

Creating a faction requires:
- **Kingdom tier ≥ Strategos** (tier 1)
- **30 Iron + 30 Stone + 20 Wood** (burned via existing `burn_upgrade_resources` helper)

Rationale: Strategos gate ensures the leader has already invested in the game (10+ match wins + initial upgrade). The resource cost prevents spam and creates a meaningful investment.

## Contract Functions

### `create_faction(name: felt252, tag: felt252) -> u32`

1. Assert caller is registered
2. Assert caller's `PlayerKingdom.tier >= 1` (Strategos)
3. Assert caller is not already in a faction (`FactionMember.faction_id == 0` or 0-default)
4. Burn resources: 30 Iron, 30 Stone, 20 Wood
5. Read `FactionCounter`, increment `count`, use new value as `faction_id`
6. Write new `Faction` with `leader = caller`, `member_count = 1`, `created_at = now`, `dissolved = false`
7. Write caller's `FactionMember` with `faction_id = new_id`, `joined_at = now`
8. Return `faction_id`

**Validation:** Frontend enforces name ≤31 chars, tag 2-5 chars, uniqueness advisory. Contract accepts any `felt252` (which naturally caps at 31 chars).

### `invite_member(target: ContractAddress)`

1. Assert caller is in a faction (`FactionMember.faction_id > 0`)
2. Read the caller's `Faction` — assert `caller == faction.leader`
3. Assert faction is not dissolved
4. Assert target != caller
5. Assert target is registered
6. Write `FactionInvite` keyed by `(target, faction_id)` with `invited_by = caller`, `invited_at = now`, `used = false`

An existing unused invite is overwritten (no-op if already present and still valid).

### `accept_invite(faction_id: u32)`

1. Assert `faction_id > 0`
2. Read `FactionInvite((caller, faction_id))` — assert it exists (`invited_at > 0`) and `!used`
3. Assert caller is not already in a faction
4. Read `Faction(faction_id)` — assert `!dissolved`
5. Assert 24h cooldown: `now >= caller's FactionMember.last_leave_time + 86400` (skip if `last_leave_time == 0`)
6. Write caller's `FactionMember` with `faction_id`, `joined_at = now`
7. Increment `Faction.member_count`
8. Mark invite as `used = true`

### `leave_faction()`

1. Read caller's `FactionMember` — assert `faction_id > 0`
2. Read `Faction(faction_id)` — assert not already dissolved
3. **Leader edge case:** if `caller == faction.leader`, set `faction.dissolved = true` and write back
4. Decrement `Faction.member_count`
5. Write caller's `FactionMember.faction_id = 0`, `last_leave_time = now`

When a leader leaves, the faction dissolves. Other members' `FactionMember.faction_id` stays pointing to the dissolved faction, but the lazy check `faction.dissolved == true` handles orphaned members when reading. For clean display, the frontend queries `Faction.dissolved` when resolving membership.

### `kick_member(target: ContractAddress)`

1. Assert caller is in a faction
2. Read `Faction(caller's faction_id)` — assert `caller == faction.leader`
3. Assert target is a member of the same faction
4. Write target's `FactionMember.faction_id = 0`, `last_leave_time = now`
5. Decrement `Faction.member_count`

The kicked player eats the 24h cooldown too.

### `set_faction_reinforcement(enabled: bool)`

1. Assert caller is registered
2. Write `PlayerKingdom.faction_reinforcement_enabled = enabled`

## Existing System Modifications

### `initiate_conquest` — block friendly fire

After reading `target.owner` (the defender), add:

```cairo
let attacker_member: FactionMember = world.read_model(attacker);
let defender_member: FactionMember = world.read_model(defender);
if attacker_member.faction_id != 0 && attacker_member.faction_id == defender_member.faction_id {
    panic!("Cannot conquest faction ally");
}
```

Cannot attack a member of your own faction.

### `initiate_conquest` — faction reinforcement pool

When the defender has `faction_reinforcement_enabled == true` AND is in a faction (`faction_id != 0`):

During the existing parcel iteration (which already checks adjacency), build an array of ally-contributed preset 0 slots. Then the VRF pool becomes defender's existing presets + ally presets.

The pool size is `defender.preset_count + ally_count`. The VRF roll maps `random_value % total` to either a defender preset slot (0..preset_count) or an ally preset (preset_count..preset_count+ally_count).

**Implementation note:** Since we iterate parcels once for adjacency, we can collect ally preset 0 data in the same loop without O(n²). For each parcel:
- If it belongs to a faction ally (different player, same `faction_id`), and its owner is adjacent to the target, read their `PresetDefense.p0_*` and append to the ally pool array.

Ally presets contributing are always their slot 0 (no opt-in complexity). If an ally wants their reinforcement to use a specific allocation, they should set it as their preset 0.

### `initiate_pillage` — block if any ally borders the target home parcel

Before the "no existing pillage" check in `initiate_pillage`, add:

```cairo
let target_member: FactionMember = world.read_model(parcel.owner);
if target_member.faction_id != 0 {
    let config: WorldConfig = world.read_model(0_u8);
    let mut p: u32 = 0;
    let mut protected = false;
    while p < config.total_parcels {
        if !protected {
            let ally_parcel: Parcel = world.read_model(p);
            if ally_parcel.owner.is_non_zero() && ally_parcel.owner != parcel.owner {
                let ally_member: FactionMember = world.read_model(ally_parcel.owner);
                if ally_member.faction_id == target_member.faction_id {
                    if siege_dojo::utils::hex::is_neighbor(
                        ally_parcel.col, ally_parcel.row, parcel.col, parcel.row
                    ) {
                        protected = true;
                    }
                }
            }
        }
        p += 1;
    };
    assert(!protected, 'Home protected by ally');
}
```

**Emergent strategy:**
- Defenders want friendly homes clustered around their own
- Rival factions clear out protecting allies via conquest before initiating pillage
- Home parcels of allies can never be conquered, so clustered faction homes form impenetrable pillage shields

## Frontend

### `frontend/src/lib/factions.ts`

Hooks and contract wrappers.

**Hooks:**

- `useFaction(factionId)` — reads `Faction` + all `FactionMember` models with `faction_id == factionId`. Returns faction info, member list, leader flag.
- `usePlayerFaction(playerAddress)` — reads the player's `FactionMember`. Returns their current faction (or null if `faction_id == 0` or the faction is dissolved), `last_leave_time`, and derived cooldown remaining.
- `usePendingInvites(playerAddress)` — reads all `FactionInvite` records for the player where `used == false`.
- `useAllFactions()` — lists all non-dissolved factions for the browser.

**Contract wrappers:**

```typescript
createFaction(account, name, tag): Promise<string>
inviteMember(account, target): Promise<string>
acceptInvite(account, factionId): Promise<string>
leaveFaction(account): Promise<string>
kickMember(account, target): Promise<string>
setFactionReinforcement(account, enabled): Promise<string>
```

### UI Components

**Faction Browser** — list of all non-dissolved factions with member count, tag, leader. Click to see roster.

**My Faction Panel** — if in a faction: name, tag, leader, members (with activity indicator derived from recent match history). Leave button; leader sees Kick buttons next to each member.

**Invite Manager** — if player has pending invites, show them with Accept buttons.

**Create Faction Dialog** — gated on Strategos tier. Shows cost (30 Iron + 30 Stone + 20 Wood), name input (≤31 chars), tag input (2-5 chars). Warns on uniqueness collision (advisory, based on client-side check of `useAllFactions`).

**Reinforcement Toggle** — switch in kingdom settings for `faction_reinforcement_enabled`. Displays the current state and warns the player that enabling lets ally presets enter their conquest defense pool.

### World Map Visual Cues

- Faction members' territories tinted by the faction's deterministic color (derived from `faction_id`)
- Faction tag shown next to player names on parcels
- Home parcels of faction members with a subtle shield icon when they have adjacent faction allies (hint at pillage protection)

## Testing

Cairo tests in `src/tests/test_factions.cairo`:

- `test_create_faction_happy_path` — Strategos player with resources creates faction
- `test_create_faction_rejects_polis` — tier 0 fails
- `test_create_faction_rejects_insufficient_resources` — fails without the cost
- `test_invite_member_then_accept` — leader invites, target accepts, membership written
- `test_accept_invite_rejects_without_invite` — no invite fails
- `test_accept_invite_rejects_during_cooldown` — recent leave fails
- `test_leave_faction_decrements_count` — member_count decreases
- `test_leader_leave_dissolves_faction` — leader leaving sets dissolved flag
- `test_kick_member_sets_cooldown` — kicked player has last_leave_time set
- `test_conquest_blocks_friendly_fire` — can't attack faction ally
- `test_conquest_reinforcement_expands_pool` — opt-in defender's conquest pool includes ally preset 0
- `test_conquest_reinforcement_disabled_by_default` — without opt-in, only defender's presets are used
- `test_pillage_blocked_by_ally_adjacency` — ally bordering home parcel blocks pillage
- `test_pillage_allowed_when_no_ally_borders` — without nearby ally, pillage succeeds

## Implementation Priority

1. Models: `Faction`, `FactionMember`, `FactionInvite`, `FactionCounter`, `PlayerKingdom` field addition
2. `create_faction` + formation tests
3. Invite + accept flow + tests
4. `leave_faction` + leader dissolution + tests
5. `kick_member` + cooldown tests
6. `set_faction_reinforcement` + toggle test
7. `initiate_conquest` friendly fire block + test
8. `initiate_conquest` reinforcement pool + tests
9. `initiate_pillage` protection check + tests
10. Frontend `factions.ts` hooks and wrappers
11. UI components (browser, panel, invites, create dialog, toggle)
12. World map visual cues (faction coloring)

## What This Does NOT Include

- Resource gifting UI (ERC-20 transferFrom works from wallets; skip dedicated faction transfer UI for MVP)
- Campaign coordination (campaigns don't exist yet)
- Faction reputation and leaderboards (not enough data to be meaningful)
- Leadership transfer (leader leaving dissolves the faction — simpler model)
- Member activity tracking for reinforcement (adjacency is the only gate)
- Auto-kick inactive members (leader can kick manually if needed)
