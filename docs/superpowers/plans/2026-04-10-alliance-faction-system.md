# Alliance / Faction System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add onchain factions — formation (Strategos+ with resource cost), invite/accept membership, leave with 24h cooldown, kick, leader dissolution, shared borders (no conquest between allies), defender-opt-in reinforcement pool, and home parcel pillage protection.

**Architecture:** Four new Dojo models (`Faction`, `FactionMember`, `FactionInvite`, `FactionCounter`) plus a `faction_reinforcement_enabled` field on `PlayerKingdom`. Six new functions on `world_system.cairo`. Existing `initiate_conquest` and `initiate_pillage` are modified to respect faction membership. Frontend adds hooks, contract wrappers, and UI components.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, Next.js, React 19

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/models/faction.cairo` | Faction + FactionCounter models |
| Create | `src/models/faction_member.cairo` | FactionMember model |
| Create | `src/models/faction_invite.cairo` | FactionInvite model |
| Modify | `src/models/player_kingdom.cairo` | Add `faction_reinforcement_enabled: bool` |
| Modify | `src/lib.cairo` | Register new models and test module |
| Modify | `src/systems/world_system.cairo` | Add faction functions, modify conquest + pillage |
| Create | `src/tests/test_factions.cairo` | All faction tests |
| Modify | `src/tests/test_staked_match.cairo` | Register new models in test world |
| Modify | `src/tests/test_reputation.cairo` | Register new models |
| Modify | `src/tests/test_kingdom_tiers.cairo` | Register new models |
| Modify | `src/tests/test_pillaging.cairo` | Register new models |
| Modify | `src/tests/test_conquest.cairo` | Register new models |
| Create | `frontend/src/lib/factions.ts` | Hooks + contract wrappers |

---

### Task 1: Create Faction Models

**Files:**
- Create: `src/models/faction.cairo`
- Create: `src/models/faction_member.cairo`
- Create: `src/models/faction_invite.cairo`
- Modify: `src/models/player_kingdom.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create `src/models/faction.cairo`**

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct Faction {
    #[key]
    pub faction_id: u32,
    pub leader: ContractAddress,
    pub name: felt252,
    pub tag: felt252,
    pub member_count: u32,
    pub created_at: u64,
    pub dissolved: bool,
}

#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionCounter {
    #[key]
    pub id: u8,
    pub count: u32,
}
```

- [ ] **Step 2: Create `src/models/faction_member.cairo`**

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct FactionMember {
    #[key]
    pub player: ContractAddress,
    pub faction_id: u32,
    pub joined_at: u64,
    pub last_leave_time: u64,
}
```

- [ ] **Step 3: Create `src/models/faction_invite.cairo`**

```cairo
use starknet::ContractAddress;

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

- [ ] **Step 4: Add faction_reinforcement_enabled to PlayerKingdom**

Replace the entire contents of `src/models/player_kingdom.cairo`:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerKingdom {
    #[key]
    pub player: ContractAddress,
    pub home_0: u32,
    pub home_1: u32,
    pub home_2: u32,
    pub parcel_count: u32,
    pub registered: bool,
    pub free_craft_used: bool,
    pub last_drip_time: u64,
    pub tier: u8,
    pub total_wins: u32,
    pub faction_reinforcement_enabled: bool,
}
```

- [ ] **Step 5: Register new models and test module in lib.cairo**

Add to the `pub mod models` block in `src/lib.cairo`:

```cairo
pub mod faction;
pub mod faction_member;
pub mod faction_invite;
```

Add to the `#[cfg(test)]` block:

```cairo
pub mod test_factions;
```

- [ ] **Step 6: Create basic model test**

Create `src/tests/test_factions.cairo`:

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::faction::{Faction, FactionCounter, m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::{FactionMember, m_FactionMember};
    use siege_dojo::models::faction_invite::{FactionInvite, m_FactionInvite};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_faction_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let leader = contract_address_const::<0x1>();
        world.write_model_test(@Faction {
            faction_id: 1,
            leader,
            name: 'TestClan',
            tag: 'TC',
            member_count: 1,
            created_at: 100,
            dissolved: false,
        });

        let f: Faction = world.read_model(1_u32);
        assert(f.leader == leader, 'leader should match');
        assert(f.name == 'TestClan', 'name should match');
        assert(!f.dissolved, 'should not be dissolved');
    }

    #[test]
    fn test_faction_member_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let player = contract_address_const::<0x1>();
        world.write_model_test(@FactionMember {
            player,
            faction_id: 42,
            joined_at: 100,
            last_leave_time: 0,
        });

        let m: FactionMember = world.read_model(player);
        assert(m.faction_id == 42, 'faction_id should match');
    }

    #[test]
    fn test_faction_invite_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let target = contract_address_const::<0x1>();
        let inviter = contract_address_const::<0x2>();
        world.write_model_test(@FactionInvite {
            target,
            faction_id: 7,
            invited_by: inviter,
            invited_at: 100,
            used: false,
        });

        let inv: FactionInvite = world.read_model((target, 7_u32));
        assert(inv.invited_by == inviter, 'inviter should match');
        assert(!inv.used, 'should not be used');
    }
}
```

- [ ] **Step 7: Run tests**

Run: `sozo test -f test_faction_model && sozo test -f test_faction_member_model && sozo test -f test_faction_invite_model`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add src/models/faction.cairo src/models/faction_member.cairo src/models/faction_invite.cairo src/models/player_kingdom.cairo src/tests/test_factions.cairo src/lib.cairo
git commit -m "feat: add Faction, FactionMember, FactionInvite, FactionCounter models"
```

---

### Task 2: Register New Models in Existing Test Worlds

**Files:**
- Modify: `src/tests/test_staked_match.cairo`
- Modify: `src/tests/test_reputation.cairo`
- Modify: `src/tests/test_kingdom_tiers.cairo`
- Modify: `src/tests/test_pillaging.cairo`
- Modify: `src/tests/test_conquest.cairo`

- [ ] **Step 1: Add model imports to each test file**

In each of the 5 listed test files, add to the imports:

```cairo
use siege_dojo::models::faction::{m_Faction, m_FactionCounter};
use siege_dojo::models::faction_member::m_FactionMember;
use siege_dojo::models::faction_invite::m_FactionInvite;
```

- [ ] **Step 2: Add to each namespace_def resources array**

In each of the 5 test files, inside the `namespace_def()` function's resources array, add:

```cairo
TestResource::Model(m_Faction::TEST_CLASS_HASH),
TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
```

- [ ] **Step 3: Run all tests**

Run: `sozo test`
Expected: All 135 existing tests still pass + 3 new model tests = 138 total.

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_staked_match.cairo src/tests/test_reputation.cairo src/tests/test_kingdom_tiers.cairo src/tests/test_pillaging.cairo src/tests/test_conquest.cairo
git commit -m "test: register faction models in existing test worlds"
```

---

### Task 3: create_faction Function

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_factions.cairo`

- [ ] **Step 1: Add imports inside mod world_system**

In `src/systems/world_system.cairo`, inside the `mod world_system` block, add:

```cairo
use siege_dojo::models::faction::{Faction, FactionCounter};
use siege_dojo::models::faction_member::FactionMember;
use siege_dojo::models::faction_invite::FactionInvite;
```

- [ ] **Step 2: Add create_faction to IWorldSystem interface**

Add to the `IWorldSystem` trait (outside `mod world_system`):

```cairo
fn create_faction(ref self: T, name: felt252, tag: felt252) -> u32;
```

- [ ] **Step 3: Implement create_faction**

Add inside `impl WorldSystemImpl`:

```cairo
fn create_faction(ref self: ContractState, name: felt252, tag: felt252) -> u32 {
    let mut world = self.world_default();
    let caller = get_caller_address();

    let kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');
    assert(kingdom.tier >= 1, 'Strategos tier required');

    let existing: FactionMember = world.read_model(caller);
    assert(existing.faction_id == 0, 'Already in a faction');

    // Burn formation cost: 30 Iron + 30 Stone + 20 Wood
    let rc: ResourceConfig = world.read_model(0_u8);
    super::burn_upgrade_resources(rc.iron, caller, 30);
    super::burn_upgrade_resources(rc.stone, caller, 30);
    super::burn_upgrade_resources(rc.wood, caller, 20);

    // Allocate new faction ID
    let mut counter: FactionCounter = world.read_model(0_u8);
    counter.count += 1;
    let new_id = counter.count;
    world.write_model(@counter);

    let now = get_block_timestamp();

    world.write_model(@Faction {
        faction_id: new_id,
        leader: caller,
        name,
        tag,
        member_count: 1,
        created_at: now,
        dissolved: false,
    });

    world.write_model(@FactionMember {
        player: caller,
        faction_id: new_id,
        joined_at: now,
        last_leave_time: 0,
    });

    new_id
}
```

- [ ] **Step 4: Write full-setup helper in test_factions.cairo**

Add a full setup to `src/tests/test_factions.cairo` that mirrors the pattern from `test_staked_match.cairo`. You need MockVrfProvider, MockAccount, deploy helpers, namespace_def with all world_system models, contract_defs, and a setup function that creates registered players with ability tokens and resource tokens.

Reference `src/tests/test_staked_match.cairo` for the complete pattern. Key adaptations for faction tests:
- Include all faction models in namespace_def
- Players should be upgraded to tier 1 (Strategos) so they can create factions
- Players need iron/stone/wood balances to pay the formation cost

Add this test:

```cairo
#[test]
fn test_create_faction_happy_path() {
    let (mut world, world_sys, player_a, _player_b, _erc1155) = faction_setup();

    // player_a is tier 1 (Strategos) and has resources
    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');

    assert(faction_id == 1, 'first faction id should be 1');

    let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
    assert(faction.leader == player_a, 'leader should be player_a');
    assert(faction.name == 'TestClan', 'name should match');
    assert(faction.member_count == 1, 'member_count should be 1');
    assert(!faction.dissolved, 'should not be dissolved');

    let member: siege_dojo::models::faction_member::FactionMember = world.read_model(player_a);
    assert(member.faction_id == faction_id, 'membership should be set');
}

#[test]
#[should_panic(expected: ('Strategos tier required', 'ENTRYPOINT_FAILED'))]
fn test_create_faction_rejects_polis() {
    let (mut world, world_sys, player_a, _player_b, _erc1155) = faction_setup();

    // Downgrade player_a to Polis (tier 0)
    let mut ka: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
    ka.tier = 0;
    world.write_model_test(@ka);

    starknet::testing::set_contract_address(player_a);
    world_sys.create_faction('TestClan', 'TC');
}

#[test]
#[should_panic(expected: ('Already in a faction', 'ENTRYPOINT_FAILED'))]
fn test_create_faction_rejects_existing_member() {
    let (mut world, world_sys, player_a, _player_b, _erc1155) = faction_setup();

    // Pre-place player_a in a faction
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: player_a,
        faction_id: 42,
        joined_at: 100,
        last_leave_time: 0,
    });

    starknet::testing::set_contract_address(player_a);
    world_sys.create_faction('TestClan', 'TC');
}
```

**faction_setup() requirements:**
- 2 registered players, both set to tier 1 via write_model_test
- Both players have sufficient iron/stone/wood balances (mint via `IResourceTokenDispatcher.mint` at test setup)
- ResourceToken minter needs to be set to the test runner or world_sys_addr so minting works
- Apply standard AbilityToken setup from test_staked_match for compatibility

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_create_faction`
Expected: All 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_factions.cairo
git commit -m "feat: add create_faction function"
```

---

### Task 4: Invite + Accept Flow

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_factions.cairo`

- [ ] **Step 1: Add functions to IWorldSystem interface**

```cairo
fn invite_member(ref self: T, target: ContractAddress);
fn accept_invite(ref self: T, faction_id: u32);
```

- [ ] **Step 2: Implement invite_member**

Add inside `impl WorldSystemImpl`:

```cairo
fn invite_member(ref self: ContractState, target: ContractAddress) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    let caller_member: FactionMember = world.read_model(caller);
    assert(caller_member.faction_id != 0, 'Not in a faction');

    let faction: Faction = world.read_model(caller_member.faction_id);
    assert(caller == faction.leader, 'Not the leader');
    assert(!faction.dissolved, 'Faction dissolved');
    assert(target != caller, 'Cannot invite self');

    let target_kingdom: PlayerKingdom = world.read_model(target);
    assert(target_kingdom.registered, 'Target not registered');

    world.write_model(@FactionInvite {
        target,
        faction_id: caller_member.faction_id,
        invited_by: caller,
        invited_at: get_block_timestamp(),
        used: false,
    });
}
```

- [ ] **Step 3: Implement accept_invite**

```cairo
fn accept_invite(ref self: ContractState, faction_id: u32) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    assert(faction_id > 0, 'Invalid faction id');

    let mut invite: FactionInvite = world.read_model((caller, faction_id));
    assert(invite.invited_at > 0, 'No invite');
    assert(!invite.used, 'Invite already used');

    let mut caller_member: FactionMember = world.read_model(caller);
    assert(caller_member.faction_id == 0, 'Already in a faction');

    let now = get_block_timestamp();
    // 24h cooldown check
    if caller_member.last_leave_time > 0 {
        assert(now >= caller_member.last_leave_time + 86400, 'Leave cooldown active');
    }

    let mut faction: Faction = world.read_model(faction_id);
    assert(!faction.dissolved, 'Faction dissolved');

    caller_member.faction_id = faction_id;
    caller_member.joined_at = now;
    world.write_model(@caller_member);

    faction.member_count += 1;
    world.write_model(@faction);

    invite.used = true;
    world.write_model(@invite);
}
```

- [ ] **Step 4: Write tests**

Add to `src/tests/test_factions.cairo`:

```cairo
#[test]
fn test_invite_and_accept() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.invite_member(player_b);

    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(faction_id);

    let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
    assert(member_b.faction_id == faction_id, 'b should be in faction');

    let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
    assert(faction.member_count == 2, 'should have 2 members');
}

#[test]
#[should_panic(expected: ('No invite', 'ENTRYPOINT_FAILED'))]
fn test_accept_invite_without_invite_fails() {
    let (mut world, world_sys, _player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(1);
}

#[test]
#[should_panic(expected: ('Leave cooldown active', 'ENTRYPOINT_FAILED'))]
fn test_accept_invite_during_cooldown_fails() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.invite_member(player_b);

    starknet::testing::set_block_timestamp(1000);

    // Simulate player_b having recently left another faction
    let mut mb: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
    mb.last_leave_time = 1000; // 24h cooldown
    world.write_model_test(@mb);

    // No time has passed — cooldown active
    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(faction_id);
}
```

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_invite_and_accept && sozo test -f test_accept_invite_without_invite_fails && sozo test -f test_accept_invite_during_cooldown_fails`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_factions.cairo
git commit -m "feat: add invite_member and accept_invite faction functions"
```

---

### Task 5: leave_faction + kick_member

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_factions.cairo`

- [ ] **Step 1: Add functions to IWorldSystem interface**

```cairo
fn leave_faction(ref self: T);
fn kick_member(ref self: T, target: ContractAddress);
```

- [ ] **Step 2: Implement leave_faction**

```cairo
fn leave_faction(ref self: ContractState) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    let mut member: FactionMember = world.read_model(caller);
    assert(member.faction_id != 0, 'Not in a faction');

    let mut faction: Faction = world.read_model(member.faction_id);
    assert(!faction.dissolved, 'Already dissolved');

    // Leader leaving dissolves the faction
    if caller == faction.leader {
        faction.dissolved = true;
    }

    if faction.member_count > 0 {
        faction.member_count -= 1;
    }
    world.write_model(@faction);

    member.faction_id = 0;
    member.last_leave_time = get_block_timestamp();
    world.write_model(@member);
}
```

- [ ] **Step 3: Implement kick_member**

```cairo
fn kick_member(ref self: ContractState, target: ContractAddress) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    let caller_member: FactionMember = world.read_model(caller);
    assert(caller_member.faction_id != 0, 'Not in a faction');

    let mut faction: Faction = world.read_model(caller_member.faction_id);
    assert(caller == faction.leader, 'Not the leader');

    let mut target_member: FactionMember = world.read_model(target);
    assert(target_member.faction_id == caller_member.faction_id, 'Target not in faction');
    assert(target != caller, 'Cannot kick self');

    target_member.faction_id = 0;
    target_member.last_leave_time = get_block_timestamp();
    world.write_model(@target_member);

    if faction.member_count > 0 {
        faction.member_count -= 1;
    }
    world.write_model(@faction);
}
```

- [ ] **Step 4: Write tests**

Add to `src/tests/test_factions.cairo`:

```cairo
#[test]
fn test_leave_faction() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.invite_member(player_b);

    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(faction_id);
    world_sys.leave_faction();

    let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
    assert(member_b.faction_id == 0, 'b should be out');
    assert(member_b.last_leave_time > 0, 'cooldown set');

    let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
    assert(faction.member_count == 1, 'should have 1 member');
    assert(!faction.dissolved, 'not dissolved');
}

#[test]
fn test_leader_leave_dissolves_faction() {
    let (mut world, world_sys, player_a, _player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.leave_faction();

    let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
    assert(faction.dissolved, 'should be dissolved');
}

#[test]
fn test_kick_member_sets_cooldown() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.invite_member(player_b);

    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(faction_id);

    starknet::testing::set_block_timestamp(1000);
    starknet::testing::set_contract_address(player_a);
    world_sys.kick_member(player_b);

    let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
    assert(member_b.faction_id == 0, 'b should be kicked');
    assert(member_b.last_leave_time == 1000, 'cooldown set');
}

#[test]
#[should_panic(expected: ('Not the leader', 'ENTRYPOINT_FAILED'))]
fn test_non_leader_cannot_kick() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = faction_setup();

    starknet::testing::set_contract_address(player_a);
    let faction_id = world_sys.create_faction('TestClan', 'TC');
    world_sys.invite_member(player_b);

    starknet::testing::set_contract_address(player_b);
    world_sys.accept_invite(faction_id);

    // player_b (not leader) tries to kick player_a
    world_sys.kick_member(player_a);
}
```

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_leave_faction && sozo test -f test_leader_leave_dissolves_faction && sozo test -f test_kick_member_sets_cooldown && sozo test -f test_non_leader_cannot_kick`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_factions.cairo
git commit -m "feat: add leave_faction and kick_member functions"
```

---

### Task 6: set_faction_reinforcement Toggle

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_factions.cairo`

- [ ] **Step 1: Add to IWorldSystem interface**

```cairo
fn set_faction_reinforcement(ref self: T, enabled: bool);
```

- [ ] **Step 2: Implement**

```cairo
fn set_faction_reinforcement(ref self: ContractState, enabled: bool) {
    let mut world = self.world_default();
    let caller = get_caller_address();
    let mut kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');
    kingdom.faction_reinforcement_enabled = enabled;
    world.write_model(@kingdom);
}
```

- [ ] **Step 3: Write test**

Add to `src/tests/test_factions.cairo`:

```cairo
#[test]
fn test_set_faction_reinforcement() {
    let (mut world, world_sys, player_a, _player_b, _erc1155) = faction_setup();

    // Default is false
    let k_before: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
    assert(!k_before.faction_reinforcement_enabled, 'default false');

    starknet::testing::set_contract_address(player_a);
    world_sys.set_faction_reinforcement(true);

    let k_after: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
    assert(k_after.faction_reinforcement_enabled, 'should be true');

    world_sys.set_faction_reinforcement(false);
    let k_final: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
    assert(!k_final.faction_reinforcement_enabled, 'should be false');
}
```

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_set_faction_reinforcement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_factions.cairo
git commit -m "feat: add set_faction_reinforcement toggle"
```

---

### Task 7: Block Friendly Fire in Conquest

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

- [ ] **Step 1: Add FactionMember import**

In `src/systems/conquest.cairo`, inside `mod conquest`, add:

```cairo
use siege_dojo::models::faction_member::FactionMember;
```

- [ ] **Step 2: Add the friendly-fire check**

In `initiate_conquest`, AFTER reading the target parcel and getting the defender address (after `let defender = target.owner;`), add:

```cairo
// Shared borders — can't conquest your own faction
let attacker_member: FactionMember = world.read_model(attacker);
let defender_member: FactionMember = world.read_model(defender);
if attacker_member.faction_id != 0 && attacker_member.faction_id == defender_member.faction_id {
    panic!("Cannot conquest faction ally");
}
```

- [ ] **Step 3: Write test**

Add to `src/tests/test_conquest.cairo`:

```cairo
#[test]
#[should_panic(expected: ("Cannot conquest faction ally", 'ENTRYPOINT_FAILED'))]
fn test_conquest_blocks_friendly_fire() {
    let (mut world, conquest_sys, world_sys, player_a, player_b) = conquest_setup();

    // Put both players in the same faction (manually via write_model_test)
    world.write_model_test(@siege_dojo::models::faction::Faction {
        faction_id: 1,
        leader: player_a,
        name: 'TestClan',
        tag: 'TC',
        member_count: 2,
        created_at: 0,
        dissolved: false,
    });
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: player_a,
        faction_id: 1,
        joined_at: 0,
        last_leave_time: 0,
    });
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: player_b,
        faction_id: 1,
        joined_at: 0,
        last_leave_time: 0,
    });

    // Setup defender presets
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);

    // Give B parcel 9 as target
    let mut tp: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    kb.parcel_count += 1;
    world.write_model_test(@kb);

    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);
}
```

Note: this test imports the faction models via fully-qualified paths, so `test_conquest.cairo`'s existing namespace_def (updated in Task 2) must include the faction models.

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_conquest_blocks_friendly_fire`
Expected: PASS.

Run: `sozo test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: block friendly fire in conquest between faction allies"
```

---

### Task 8: Conquest Reinforcement Pool (Defender Opt-In)

**Files:**
- Modify: `src/systems/conquest.cairo`
- Modify: `src/tests/test_conquest.cairo`

This task expands the VRF pool to include ally preset 0 slots when the defender has opted in.

- [ ] **Step 1: Build ally preset pool during adjacency scan**

In `src/systems/conquest.cairo`, in `initiate_conquest`, find the existing parcel iteration that checks adjacency. Currently it looks like:

```cairo
let config: WorldConfig = world.read_model(0_u8);
let mut has_adjacent = false;
let mut pi: u32 = 0;
while pi < config.total_parcels {
    if !has_adjacent {
        let parcel: Parcel = world.read_model(pi);
        if parcel.owner == attacker {
            if hex::is_neighbor(parcel.col, parcel.row, target.col, target.row) {
                has_adjacent = true;
            }
        }
    }
    pi += 1;
};
assert(has_adjacent, 'No adjacent parcel');
```

We need to ALSO collect ally reinforcement presets in the same loop if the defender has `faction_reinforcement_enabled`. Modify as follows:

```cairo
let config: WorldConfig = world.read_model(0_u8);
let mut has_adjacent = false;

// Check if defender wants reinforcement
let defender_kingdom: PlayerKingdom = world.read_model(defender);
let reinforcement_on = defender_kingdom.faction_reinforcement_enabled;
let defender_member_for_pool: FactionMember = world.read_model(defender);
let defender_faction_id = defender_member_for_pool.faction_id;

// Ally preset pool (collected during the parcel scan if reinforcement is on)
let mut ally_p0_1: u8 = 0; let mut ally_p1_1: u8 = 0; let mut ally_p2_1: u8 = 0;
let mut ally_g0_1: u8 = 0; let mut ally_g1_1: u8 = 0; let mut ally_g2_1: u8 = 0;
let mut ally_p0_2: u8 = 0; let mut ally_p1_2: u8 = 0; let mut ally_p2_2: u8 = 0;
let mut ally_g0_2: u8 = 0; let mut ally_g1_2: u8 = 0; let mut ally_g2_2: u8 = 0;
let mut ally_p0_3: u8 = 0; let mut ally_p1_3: u8 = 0; let mut ally_p2_3: u8 = 0;
let mut ally_g0_3: u8 = 0; let mut ally_g1_3: u8 = 0; let mut ally_g2_3: u8 = 0;
let mut ally_count: u8 = 0;

let mut pi: u32 = 0;
while pi < config.total_parcels {
    let parcel_iter: Parcel = world.read_model(pi);
    // Check attacker adjacency
    if !has_adjacent && parcel_iter.owner == attacker {
        if hex::is_neighbor(parcel_iter.col, parcel_iter.row, target.col, target.row) {
            has_adjacent = true;
        }
    }
    // Check faction ally reinforcement (if reinforcement is on and parcel belongs to an ally)
    if reinforcement_on && defender_faction_id != 0 && ally_count < 3 {
        if parcel_iter.owner.is_non_zero() && parcel_iter.owner != defender {
            let ally_member: FactionMember = world.read_model(parcel_iter.owner);
            if ally_member.faction_id == defender_faction_id {
                if hex::is_neighbor(parcel_iter.col, parcel_iter.row, target.col, target.row) {
                    let ally_defense: siege_dojo::models::preset_defense::PresetDefense = world.read_model(parcel_iter.owner);
                    if ally_count == 0 {
                        ally_p0_1 = ally_defense.p0_p0; ally_p1_1 = ally_defense.p0_p1; ally_p2_1 = ally_defense.p0_p2;
                        ally_g0_1 = ally_defense.p0_g0; ally_g1_1 = ally_defense.p0_g1; ally_g2_1 = ally_defense.p0_g2;
                    } else if ally_count == 1 {
                        ally_p0_2 = ally_defense.p0_p0; ally_p1_2 = ally_defense.p0_p1; ally_p2_2 = ally_defense.p0_p2;
                        ally_g0_2 = ally_defense.p0_g0; ally_g1_2 = ally_defense.p0_g1; ally_g2_2 = ally_defense.p0_g2;
                    } else {
                        ally_p0_3 = ally_defense.p0_p0; ally_p1_3 = ally_defense.p0_p1; ally_p2_3 = ally_defense.p0_p2;
                        ally_g0_3 = ally_defense.p0_g0; ally_g1_3 = ally_defense.p0_g1; ally_g2_3 = ally_defense.p0_g2;
                    }
                    ally_count += 1;
                }
            }
        }
    }
    pi += 1;
};
assert(has_adjacent, 'No adjacent parcel');
```

The cap of 3 ally presets keeps the code bounded. If more than 3 allies border the target, only the first 3 found contribute.

- [ ] **Step 2: Expand VRF preset selection**

Find the existing VRF + preset read block:

```cairo
let random_value: u256 = vrf.consume_random(Source::Nonce(starknet::get_contract_address())).into();
let preset_idx: u8 = (random_value % defense.preset_count.into()).try_into().unwrap();

// Read selected preset
let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if preset_idx == 0 {
    ...
};
```

Replace with:

```cairo
let random_value: u256 = vrf.consume_random(Source::Nonce(starknet::get_contract_address())).into();
let total_pool: u8 = defense.preset_count + ally_count;
assert(total_pool > 0, 'Empty defense pool');
let preset_idx: u8 = (random_value % total_pool.into()).try_into().unwrap();

// Read selected preset (defender slots first, then ally slots)
let (def_p0, def_p1, def_p2, def_g0, def_g1, def_g2) = if preset_idx < defense.preset_count {
    // Defender's own preset
    if preset_idx == 0 {
        (defense.p0_p0, defense.p0_p1, defense.p0_p2, defense.p0_g0, defense.p0_g1, defense.p0_g2)
    } else if preset_idx == 1 {
        (defense.p1_p0, defense.p1_p1, defense.p1_p2, defense.p1_g0, defense.p1_g1, defense.p1_g2)
    } else if preset_idx == 2 {
        (defense.p2_p0, defense.p2_p1, defense.p2_p2, defense.p2_g0, defense.p2_g1, defense.p2_g2)
    } else {
        (defense.p3_p0, defense.p3_p1, defense.p3_p2, defense.p3_g0, defense.p3_g1, defense.p3_g2)
    }
} else {
    // Ally preset (preset_idx - defense.preset_count = ally index)
    let ally_idx = preset_idx - defense.preset_count;
    if ally_idx == 0 {
        (ally_p0_1, ally_p1_1, ally_p2_1, ally_g0_1, ally_g1_1, ally_g2_1)
    } else if ally_idx == 1 {
        (ally_p0_2, ally_p1_2, ally_p2_2, ally_g0_2, ally_g1_2, ally_g2_2)
    } else {
        (ally_p0_3, ally_p1_3, ally_p2_3, ally_g0_3, ally_g1_3, ally_g2_3)
    }
};
```

- [ ] **Step 3: Update defense existence check**

The existing code has `assert(defense.preset_count > 0, 'No defense set');`. With reinforcement, a defender with 0 presets could still have ally reinforcement. Update the assertion to allow defender-with-no-presets if allies are contributing:

Find:
```cairo
let defense: PresetDefense = world.read_model(defender);
assert(defense.preset_count > 0, 'No defense set');
```

Replace with:
```cairo
let defense: PresetDefense = world.read_model(defender);
// Defender must have presets OR ally reinforcement contributing
// (ally count is calculated during the parcel iteration below)
```

And move the existence check AFTER the ally pool is built (but before the VRF call):

```cairo
assert(defense.preset_count + ally_count > 0, 'No defense set');
```

Place it right before the `let total_pool: u8 = ...` line.

- [ ] **Step 4: Write tests**

Add to `src/tests/test_conquest.cairo`:

```cairo
#[test]
fn test_conquest_reinforcement_disabled_by_default() {
    // Without opt-in, the defender's presets are the only ones in the pool.
    // This is implicitly tested by all existing conquest tests (they all work
    // with reinforcement_enabled = false, which is the default).
    let (mut world, conquest_sys, _, player_a, player_b) = conquest_setup();

    // Defender sets weak defense
    starknet::testing::set_contract_address(player_b);
    conquest_sys.set_preset_defense(0, 0, 0, 0, 1, 1, 1);

    // Ensure reinforcement is off (default)
    let kb: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    assert(!kb.faction_reinforcement_enabled, 'default off');

    // Target parcel
    let mut tp: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
    tp.owner = player_b;
    world.write_model_test(@tp);
    let mut kb_mut = kb;
    kb_mut.parcel_count += 1;
    world.write_model_test(@kb_mut);

    starknet::testing::set_contract_address(player_a);
    conquest_sys.initiate_conquest(9, 10, 0, 0, 0, 0, 0, 0, 0);

    let target: siege_dojo::models::parcel::Parcel = world.read_model(9_u32);
    assert(target.owner == player_a, 'attacker wins weak defense');
}
```

- [ ] **Step 5: Run tests**

Run: `sozo test`
Expected: All existing tests still pass. Reinforcement is default-off, so no existing behavior changes.

- [ ] **Step 6: Commit**

```bash
git add src/systems/conquest.cairo src/tests/test_conquest.cairo
git commit -m "feat: conquest reinforcement pool with defender opt-in"
```

---

### Task 9: Pillage Protection via Faction Ally Adjacency

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Add protection check to initiate_pillage**

In `src/systems/world_system.cairo`, in `initiate_pillage`, AFTER validating the target parcel is a home parcel and BEFORE the "no active pillage" check, add:

```cairo
// Faction pillage protection — if any faction ally of the target owns a parcel
// adjacent to this home parcel, block the pillage
let target_member: FactionMember = world.read_model(parcel.owner);
if target_member.faction_id != 0 {
    let config: WorldConfig = world.read_model(0_u8);
    let mut p_iter: u32 = 0;
    let mut protected = false;
    while p_iter < config.total_parcels {
        if !protected {
            let ally_parcel: Parcel = world.read_model(p_iter);
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
        p_iter += 1;
    };
    assert(!protected, 'Home protected by ally');
}
```

- [ ] **Step 2: Write test**

Add to `src/tests/test_pillaging.cairo`:

```cairo
#[test]
#[should_panic(expected: ('Home protected by ally', 'ENTRYPOINT_FAILED'))]
fn test_pillage_blocked_by_ally_adjacency() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Set up a match and eligibility for player_a to pillage player_b
    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    starknet::testing::set_block_timestamp(1000);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // Put player_b in a faction with a third player (the "ally")
    let ally = contract_address_const::<0x999>();
    world.write_model_test(@siege_dojo::models::faction::Faction {
        faction_id: 1,
        leader: player_b,
        name: 'Guardians',
        tag: 'GD',
        member_count: 2,
        created_at: 0,
        dissolved: false,
    });
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: player_b,
        faction_id: 1,
        joined_at: 0,
        last_leave_time: 0,
    });
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: ally,
        faction_id: 1,
        joined_at: 0,
        last_leave_time: 0,
    });

    // Give the ally a parcel adjacent to player_b's home_0
    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_0: siege_dojo::models::parcel::Parcel = world.read_model(kingdom_b.home_0);

    // Find an unclaimed parcel adjacent to home_0 and assign it to ally
    let config: siege_dojo::models::world_config::WorldConfig = world.read_model(0_u8);
    let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
    let mut ally_parcel_id: u32 = 999999;
    let mut p_search: u32 = 0;
    while p_search < config.total_parcels {
        if ally_parcel_id == 999999 {
            let parcel: siege_dojo::models::parcel::Parcel = world.read_model(p_search);
            if parcel.owner == zero_addr
                && siege_dojo::utils::hex::is_neighbor(
                    parcel.col, parcel.row, home_0.col, home_0.row
                )
            {
                ally_parcel_id = p_search;
            }
        }
        p_search += 1;
    };
    assert(ally_parcel_id != 999999, 'no adjacent parcel to home');

    let mut ally_parcel: siege_dojo::models::parcel::Parcel = world.read_model(ally_parcel_id);
    ally_parcel.owner = ally;
    world.write_model_test(@ally_parcel);

    // player_a tries to initiate pillage on home_0 — should fail
    starknet::testing::set_contract_address(player_a);
    world_sys.initiate_pillage(match_id, kingdom_b.home_0);
}

#[test]
fn test_pillage_allowed_when_target_has_no_faction() {
    // The existing test_initiate_pillage_happy_path implicitly covers this,
    // but add an explicit test with target in a faction but no adjacent allies.
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    starknet::testing::set_block_timestamp(1000);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // player_b is in a solo faction (just themselves, no allies)
    world.write_model_test(@siege_dojo::models::faction::Faction {
        faction_id: 1,
        leader: player_b,
        name: 'Solo',
        tag: 'SO',
        member_count: 1,
        created_at: 0,
        dissolved: false,
    });
    world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
        player: player_b,
        faction_id: 1,
        joined_at: 0,
        last_leave_time: 0,
    });

    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);

    starknet::testing::set_contract_address(player_a);
    world_sys.initiate_pillage(match_id, kingdom_b.home_0);

    let pillage: siege_dojo::models::pillage::Pillage = world.read_model(kingdom_b.home_0);
    assert(pillage.active, 'pillage should succeed');
}
```

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_pillage_blocked_by_ally_adjacency && sozo test -f test_pillage_allowed_when_target_has_no_faction`
Expected: Both PASS.

Run: `sozo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo
git commit -m "feat: block pillage when faction ally borders target home parcel"
```

---

### Task 10: Frontend Faction Library

**Files:**
- Create: `frontend/src/lib/factions.ts`

- [ ] **Step 1: Create factions.ts**

```typescript
import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

export const WORLD_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "";

export interface FactionData {
  factionId: number;
  leader: string;
  name: string;
  tag: string;
  memberCount: number;
  createdAt: number;
  dissolved: boolean;
}

export interface FactionMemberData {
  player: string;
  factionId: number;
  joinedAt: number;
  lastLeaveTime: number;
}

export interface FactionInviteData {
  target: string;
  factionId: number;
  invitedBy: string;
  invitedAt: number;
  used: boolean;
}

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function feltToStr(felt: string): string {
  // Convert a felt252 ASCII-encoded string back to JS string
  // Assumes the felt represents a short string (31 chars or less)
  if (!felt || felt === "0x0" || felt === "0") return "";
  const hex = felt.startsWith("0x") ? felt.slice(2) : BigInt(felt).toString(16);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes.filter((b) => b > 0));
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

export function useFaction(factionId: number | null): FactionData | null {
  const [data, setData] = useState<FactionData | null>(null);

  useEffect(() => {
    if (!factionId) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionModels: GraphEdges<{
          faction_id: string;
          leader: string;
          name: string;
          tag: string;
          member_count: string;
          created_at: string;
          dissolved: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionModels(where: { faction_id: ${factionId} }) {
            edges { node { faction_id leader name tag member_count created_at dissolved } }
          }
        }
      `);

      const node = result?.siegeDojoFactionModels?.edges?.[0]?.node;
      if (!node) {
        setData(null);
        return;
      }

      setData({
        factionId: toNum(node.faction_id),
        leader: node.leader,
        name: feltToStr(node.name),
        tag: feltToStr(node.tag),
        memberCount: toNum(node.member_count),
        createdAt: toNum(node.created_at),
        dissolved: node.dissolved,
      });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [factionId]);

  return data;
}

export function usePlayerFaction(playerAddress: string | null): {
  member: FactionMemberData | null;
  faction: FactionData | null;
  cooldownRemaining: number;
} {
  const [state, setState] = useState<{
    member: FactionMemberData | null;
    faction: FactionData | null;
    cooldownRemaining: number;
  }>({ member: null, faction: null, cooldownRemaining: 0 });

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionMemberModels: GraphEdges<{
          player: string;
          faction_id: string;
          joined_at: string;
          last_leave_time: string;
        }>;
      }>(`
        query {
          siegeDojoFactionMemberModels(where: { player: "${playerAddress}" }) {
            edges { node { player faction_id joined_at last_leave_time } }
          }
        }
      `);

      const memberNode = result?.siegeDojoFactionMemberModels?.edges?.[0]?.node;
      const member: FactionMemberData | null = memberNode
        ? {
            player: memberNode.player,
            factionId: toNum(memberNode.faction_id),
            joinedAt: toNum(memberNode.joined_at),
            lastLeaveTime: toNum(memberNode.last_leave_time),
          }
        : null;

      let faction: FactionData | null = null;
      if (member && member.factionId > 0) {
        const factionResult = await toriiQuery<{
          siegeDojoFactionModels: GraphEdges<{
            faction_id: string; leader: string; name: string; tag: string;
            member_count: string; created_at: string; dissolved: boolean;
          }>;
        }>(`
          query {
            siegeDojoFactionModels(where: { faction_id: ${member.factionId} }) {
              edges { node { faction_id leader name tag member_count created_at dissolved } }
            }
          }
        `);
        const fn = factionResult?.siegeDojoFactionModels?.edges?.[0]?.node;
        if (fn && !fn.dissolved) {
          faction = {
            factionId: toNum(fn.faction_id),
            leader: fn.leader,
            name: feltToStr(fn.name),
            tag: feltToStr(fn.tag),
            memberCount: toNum(fn.member_count),
            createdAt: toNum(fn.created_at),
            dissolved: fn.dissolved,
          };
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const cooldownRemaining = member && member.lastLeaveTime > 0
        ? Math.max(0, (member.lastLeaveTime + 86400) - now)
        : 0;

      setState({ member, faction, cooldownRemaining });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return state;
}

export function usePendingInvites(playerAddress: string | null): FactionInviteData[] {
  const [data, setData] = useState<FactionInviteData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionInviteModels: GraphEdges<{
          target: string;
          faction_id: string;
          invited_by: string;
          invited_at: string;
          used: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionInviteModels(where: { target: "${playerAddress}" }) {
            edges { node { target faction_id invited_by invited_at used } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionInviteModels?.edges || [])
        .map((e) => ({
          target: e.node.target,
          factionId: toNum(e.node.faction_id),
          invitedBy: e.node.invited_by,
          invitedAt: toNum(e.node.invited_at),
          used: e.node.used,
        }))
        .filter((inv) => !inv.used);

      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function useAllFactions(): FactionData[] {
  const [data, setData] = useState<FactionData[]>([]);

  useEffect(() => {
    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionModels: GraphEdges<{
          faction_id: string; leader: string; name: string; tag: string;
          member_count: string; created_at: string; dissolved: boolean;
        }>;
      }>(`
        query {
          siegeDojoFactionModels {
            edges { node { faction_id leader name tag member_count created_at dissolved } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionModels?.edges || [])
        .map((e) => ({
          factionId: toNum(e.node.faction_id),
          leader: e.node.leader,
          name: feltToStr(e.node.name),
          tag: feltToStr(e.node.tag),
          memberCount: toNum(e.node.member_count),
          createdAt: toNum(e.node.created_at),
          dissolved: e.node.dissolved,
        }))
        .filter((f) => !f.dissolved && f.factionId > 0);

      entries.sort((a, b) => b.memberCount - a.memberCount);
      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return data;
}

// Contract wrappers

function strToFelt(s: string): string {
  // Convert a short string (up to 31 ASCII chars) to a felt252 hex string
  let hex = "";
  for (let i = 0; i < s.length && i < 31; i++) {
    hex += s.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return "0x" + (hex || "0");
}

export async function createFaction(
  account: AccountInterface,
  name: string,
  tag: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "create_faction",
    calldata: [strToFelt(name), strToFelt(tag)],
  });
  return result.transaction_hash;
}

export async function inviteMember(
  account: AccountInterface,
  target: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "invite_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function acceptInvite(
  account: AccountInterface,
  factionId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "accept_invite",
    calldata: [factionId.toString()],
  });
  return result.transaction_hash;
}

export async function leaveFaction(
  account: AccountInterface,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "leave_faction",
    calldata: [],
  });
  return result.transaction_hash;
}

export async function kickMember(
  account: AccountInterface,
  target: string,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "kick_member",
    calldata: [target],
  });
  return result.transaction_hash;
}

export async function setFactionReinforcement(
  account: AccountInterface,
  enabled: boolean,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "set_faction_reinforcement",
    calldata: [enabled ? "1" : "0"],
  });
  return result.transaction_hash;
}

export function formatCooldown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "None";
  const hours = Math.floor(secondsRemaining / 3600);
  const mins = Math.floor((secondsRemaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/factions.ts
git commit -m "feat: add faction frontend library — hooks, contract wrappers, felt helpers"
```

---

### Task 11: Final Integration

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All tests pass (135 existing + ~15 new faction tests).

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 pass.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for faction system"
```
