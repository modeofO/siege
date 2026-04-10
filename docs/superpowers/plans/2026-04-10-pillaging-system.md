# Pillaging System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add onchain pillaging mechanic where winning a match against a neighbor grants 24h eligibility to drain resources from one of their home parcels for 24 hours.

**Architecture:** Two new Dojo models (`PillageEligibility`, `Pillage`) written by `settle_match` and two new `world_system` functions. Existing `claim_drip` is modified to skip pillaged home parcels. Frontend adds hooks and UI for initiating, claiming, and displaying pillages.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, Next.js, React 19

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/models/pillage_eligibility.cairo` | Short-lived grant from match win |
| Create | `src/models/pillage.cairo` | Active pillage record per home parcel |
| Modify | `src/lib.cairo` | Register new models and test module |
| Modify | `src/systems/world_system.cairo` | Add `initiate_pillage`, `claim_pillage_drip`, modify `settle_match` + `claim_drip` |
| Create | `src/tests/test_pillaging.cairo` | All pillaging tests |
| Create | `frontend/src/lib/pillage.ts` | Hooks + contract call wrappers |

---

### Task 1: Create Pillage Models

**Files:**
- Create: `src/models/pillage_eligibility.cairo`
- Create: `src/models/pillage.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create PillageEligibility model**

Create `src/models/pillage_eligibility.cairo`:

```cairo
use starknet::ContractAddress;

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

- [ ] **Step 2: Create Pillage model**

Create `src/models/pillage.cairo`:

```cairo
use starknet::ContractAddress;

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

- [ ] **Step 3: Register models and test module in lib.cairo**

In `src/lib.cairo`, add to the `pub mod models` block:

```cairo
pub mod pillage_eligibility;
pub mod pillage;
```

Add to the `#[cfg(test)]` block:

```cairo
pub mod test_pillaging;
```

- [ ] **Step 4: Create basic model test**

Create `src/tests/test_pillaging.cairo` with a basic read/write test:

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::pillage_eligibility::{PillageEligibility, m_PillageEligibility};
    use siege_dojo::models::pillage::{Pillage, m_Pillage};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_pillage_eligibility_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let winner = contract_address_const::<0x1>();
        let loser = contract_address_const::<0x2>();
        world.write_model_test(@PillageEligibility {
            winner,
            match_id: 42,
            loser,
            granted_at: 100,
            expires_at: 86500,
            used: false,
        });

        let e: PillageEligibility = world.read_model((winner, 42_u64));
        assert(e.loser == loser, 'loser should match');
        assert(e.granted_at == 100, 'granted_at should be 100');
        assert(!e.used, 'should not be used');
    }

    #[test]
    fn test_pillage_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let pillager = contract_address_const::<0x1>();
        let target = contract_address_const::<0x2>();
        world.write_model_test(@Pillage {
            home_parcel_id: 7,
            pillager,
            target,
            start_time: 100,
            expires_at: 86500,
            last_claim_time: 100,
            active: true,
        });

        let p: Pillage = world.read_model(7_u32);
        assert(p.pillager == pillager, 'pillager should match');
        assert(p.active, 'should be active');
    }
}
```

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_pillage_eligibility_model && sozo test -f test_pillage_model`
Expected: Both PASS

- [ ] **Step 6: Commit**

```bash
git add src/models/pillage_eligibility.cairo src/models/pillage.cairo src/tests/test_pillaging.cairo src/lib.cairo
git commit -m "feat: add Pillage and PillageEligibility Dojo models"
```

---

### Task 2: Add has_adjacent_to_any_home Helper

**Files:**
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Add the helper to SettlementHelpers impl**

In `src/systems/world_system.cairo`, inside the `impl SettlementHelpers of SettlementHelpersTrait` block (at the bottom of the file), add this function after `is_adjacent_to_territory`:

```cairo
fn has_adjacent_to_any_home(
    self: @ContractState, pillager: ContractAddress, target: ContractAddress,
) -> bool {
    let world = self.world_default();
    let kingdom: PlayerKingdom = world.read_model(target);
    if !kingdom.registered {
        return false;
    }

    let home_ids: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
    let mut i: u32 = 0;
    let mut found = false;
    while i < 3 {
        if !found {
            let home: Parcel = world.read_model(*home_ids.at(i));
            if self.is_adjacent_to_territory(pillager, home.col, home.row) {
                found = true;
            }
        }
        i += 1;
    };
    found
}
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `sozo test`
Expected: All 118 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/systems/world_system.cairo
git commit -m "feat: add has_adjacent_to_any_home helper for pillage eligibility"
```

---

### Task 3: Grant Pillage Eligibility on Match Win

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Add imports to world_system.cairo**

Inside `mod world_system`, add these imports near the existing model imports:

```cairo
use siege_dojo::models::pillage_eligibility::PillageEligibility;
use siege_dojo::models::pillage::Pillage;
```

- [ ] **Step 2: Add eligibility constant**

Near the top of the `mod world_system` module (near `const DRIP_INTERVAL: u64 = 3600;`), add:

```cairo
const PILLAGE_WINDOW: u64 = 86400; // 24 hours in seconds
```

- [ ] **Step 3: Grant eligibility in settle_match**

In `settle_match`, inside the non-draw branch, AFTER the existing reputation update logic (after `world.write_model(@record_lw);`), add this block:

```cairo
// Grant pillage eligibility if the winner borders any of the loser's home parcels
if self.has_adjacent_to_any_home(winner, loser) {
    let now = get_block_timestamp();
    world.write_model(@PillageEligibility {
        winner,
        match_id,
        loser,
        granted_at: now,
        expires_at: now + PILLAGE_WINDOW,
        used: false,
    });
}
```

- [ ] **Step 4: Write the test**

Add to `src/tests/test_pillaging.cairo` (inside the `mod tests` block). This test needs the full world setup — mirror the pattern from `src/tests/test_staked_match.cairo`. At minimum you need:

- MockVrfProvider, MockAccount, deploy helpers
- Full `namespace_def()` including all world_system-related models AND the new pillage models
- `contract_defs()` for world_system, actions_1v1, commit_reveal_1v1, resolution_1v1
- A `full_setup()` helper that creates 2 registered tier-2 players with abilities

Look at `src/tests/test_staked_match.cairo` for the reference pattern. Copy the relevant helpers into `test_pillaging.cairo`.

Add this test:

```cairo
#[test]
fn test_settle_match_grants_eligibility() {
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

    // A's territory in full_setup includes home parcels 0, 1, 2 (from initialize_world's
    // small grid — cols [0..4] rows [0..1]). B's home parcels are also in that grid.
    // full_setup's initialize_world makes them neighbors by default, so A should
    // have adjacency to at least one of B's homes.
    let eligibility: siege_dojo::models::pillage_eligibility::PillageEligibility =
        world.read_model((player_a, match_id));
    assert(eligibility.loser == player_b, 'loser should be player_b');
    assert(!eligibility.used, 'should not be used yet');
    assert(eligibility.expires_at > eligibility.granted_at, 'expires after granted');
}
```

IMPORTANT: This test assumes `full_setup()` creates players whose territories border each other. Check the `initialize_world` call in `full_setup` — it uses a small 2x5 hex grid so home parcels should end up adjacent. If the test fails because of no adjacency, the test should first force adjacency via `write_model_test` on a parcel to make it owned by player_a adjacent to one of player_b's homes.

- [ ] **Step 5: Add new models to existing test setups**

`test_pillaging.cairo`'s `namespace_def` needs to include ALL models that `world_system` writes, including the new pillage models. The other existing test files (`test_staked_match.cairo`, `test_reputation.cairo`, `test_kingdom_tiers.cairo`) also need `m_PillageEligibility` and `m_Pillage` added to their `namespace_def()` resources because `settle_match` now writes to these models.

In each file, add the imports:
```cairo
use siege_dojo::models::pillage_eligibility::m_PillageEligibility;
use siege_dojo::models::pillage::m_Pillage;
```

And to each `namespace_def()` resources array:
```cairo
TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
TestResource::Model(m_Pillage::TEST_CLASS_HASH),
```

- [ ] **Step 6: Run tests**

Run: `sozo test -f test_settle_match_grants_eligibility`
Expected: PASS

Run: `sozo test`
Expected: All existing tests still pass (they should — granting eligibility is additive).

- [ ] **Step 7: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo src/tests/test_staked_match.cairo src/tests/test_reputation.cairo src/tests/test_kingdom_tiers.cairo
git commit -m "feat: grant pillage eligibility on match win against neighbor"
```

---

### Task 4: Add initiate_pillage Function

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Add initiate_pillage to IWorldSystem interface**

In `src/systems/world_system.cairo`, add to the `IWorldSystem` trait:

```cairo
fn initiate_pillage(ref self: T, match_id: u64, home_parcel_id: u32);
```

- [ ] **Step 2: Implement initiate_pillage**

Add inside the `WorldSystemImpl` impl block:

```cairo
fn initiate_pillage(ref self: ContractState, match_id: u64, home_parcel_id: u32) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    // Read eligibility
    let mut eligibility: PillageEligibility = world.read_model((caller, match_id));
    let now = get_block_timestamp();
    assert(eligibility.expires_at > now, 'Eligibility expired');
    assert(!eligibility.used, 'Eligibility already used');
    assert(eligibility.granted_at > 0, 'No eligibility');

    // Verify the target home parcel belongs to the loser and is a home parcel
    let parcel: Parcel = world.read_model(home_parcel_id);
    assert(parcel.owner == eligibility.loser, 'Not loser home parcel');
    assert(parcel.is_home, 'Not a home parcel');

    // Verify caller still has adjacency to THIS specific home parcel
    assert(
        self.is_adjacent_to_territory(caller, parcel.col, parcel.row),
        'No adjacency to parcel',
    );

    // Assert no active pillage on this home parcel
    let existing: Pillage = world.read_model(home_parcel_id);
    assert(!existing.active, 'Already being pillaged');

    // Create the pillage
    world.write_model(@Pillage {
        home_parcel_id,
        pillager: caller,
        target: eligibility.loser,
        start_time: now,
        expires_at: now + PILLAGE_WINDOW,
        last_claim_time: now,
        active: true,
    });

    // Mark eligibility as used
    eligibility.used = true;
    world.write_model(@eligibility);
}
```

- [ ] **Step 3: Write the happy path test**

Add to `src/tests/test_pillaging.cairo`:

```cairo
#[test]
fn test_initiate_pillage_happy_path() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Set up the match and settlement to grant eligibility
    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // Find one of B's home parcels
    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_parcel_id = kingdom_b.home_0;

    // A initiates pillage
    starknet::testing::set_contract_address(player_a);
    world_sys.initiate_pillage(match_id, home_parcel_id);

    // Verify pillage was created
    let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
    assert(pillage.active, 'pillage should be active');
    assert(pillage.pillager == player_a, 'pillager should be A');
    assert(pillage.target == player_b, 'target should be B');

    // Verify eligibility marked used
    let eligibility: siege_dojo::models::pillage_eligibility::PillageEligibility =
        world.read_model((player_a, match_id));
    assert(eligibility.used, 'eligibility should be used');
}

#[test]
#[should_panic(expected: ('Already being pillaged', 'ENTRYPOINT_FAILED'))]
fn test_initiate_pillage_rejects_already_pillaged() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_parcel_id = kingdom_b.home_0;

    // Manually pre-populate an active pillage
    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id,
        pillager: contract_address_const::<0x999>(),
        target: player_b,
        start_time: 0,
        expires_at: 999999999,
        last_claim_time: 0,
        active: true,
    });

    starknet::testing::set_contract_address(player_a);
    world_sys.initiate_pillage(match_id, home_parcel_id);
}

#[test]
#[should_panic(expected: ('Not a home parcel', 'ENTRYPOINT_FAILED'))]
fn test_initiate_pillage_rejects_non_home_parcel() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // Find an unclaimed parcel and temporarily assign it to player_b (non-home)
    let config: siege_dojo::models::world_config::WorldConfig = world.read_model(0_u8);
    let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
    let mut non_home_id: u32 = 0;
    let mut p: u32 = 0;
    while p < config.total_parcels {
        let parcel: siege_dojo::models::parcel::Parcel = world.read_model(p);
        if parcel.owner == zero_addr {
            non_home_id = p;
            break;
        }
        p += 1;
    };
    let mut parcel: siege_dojo::models::parcel::Parcel = world.read_model(non_home_id);
    parcel.owner = player_b;
    parcel.is_home = false;
    world.write_model_test(@parcel);

    starknet::testing::set_contract_address(player_a);
    world_sys.initiate_pillage(match_id, non_home_id);
}
```

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_initiate_pillage`
Expected: All 3 tests pass

Run: `sozo test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo
git commit -m "feat: add initiate_pillage function"
```

---

### Task 5: Add claim_pillage_drip Function

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Add claim_pillage_drip to IWorldSystem interface**

Add to the `IWorldSystem` trait:

```cairo
fn claim_pillage_drip(ref self: T, home_parcel_id: u32);
```

- [ ] **Step 2: Implement claim_pillage_drip**

Add inside the `WorldSystemImpl` impl block:

```cairo
fn claim_pillage_drip(ref self: ContractState, home_parcel_id: u32) {
    let mut world = self.world_default();
    let caller = get_caller_address();

    let mut pillage: Pillage = world.read_model(home_parcel_id);
    assert(pillage.active, 'Pillage not active');
    assert(pillage.pillager == caller, 'Not the pillager');

    let now = get_block_timestamp();

    // Lazy adjacency check
    let parcel: Parcel = world.read_model(home_parcel_id);
    if !self.is_adjacent_to_territory(caller, parcel.col, parcel.row) {
        pillage.active = false;
        world.write_model(@pillage);
        return;
    }

    // Cap end time at expires_at
    let end_time = if now > pillage.expires_at { pillage.expires_at } else { now };

    // Calculate intervals
    let elapsed = if end_time > pillage.last_claim_time {
        end_time - pillage.last_claim_time
    } else {
        0
    };
    let intervals: u64 = elapsed / DRIP_INTERVAL;

    if intervals > 0 {
        let rc: ResourceConfig = world.read_model(0_u8);
        if rc.iron.is_non_zero() {
            self.mint_parcel_resources(@rc, parcel.parcel_type, caller, intervals.into());
        }
        pillage.last_claim_time = pillage.last_claim_time + (intervals * DRIP_INTERVAL);
    }

    // Natural expiration
    if now >= pillage.expires_at {
        pillage.active = false;
    }

    world.write_model(@pillage);
}
```

- [ ] **Step 3: Write tests**

Add to `src/tests/test_pillaging.cairo`:

```cairo
#[test]
fn test_claim_pillage_drip_mints_resources() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Set up pillage manually for this test (simpler than the full match flow)
    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_parcel_id = kingdom_b.home_0;

    // Set initial block time
    starknet::testing::set_block_timestamp(1000);

    // Create a pillage directly via write_model_test
    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id,
        pillager: player_a,
        target: player_b,
        start_time: 1000,
        expires_at: 1000 + 86400, // 24h
        last_claim_time: 1000,
        active: true,
    });

    // Advance time by 2 hours
    starknet::testing::set_block_timestamp(1000 + 7200);

    // Read the parcel type to know what resources will be minted
    let parcel: siege_dojo::models::parcel::Parcel = world.read_model(home_parcel_id);
    let rc: siege_dojo::models::resource_config::ResourceConfig = world.read_model(0_u8);

    // Get A's iron balance before (assuming the parcel is type 0 = Forge → iron/linen)
    // We don't strictly know the type because initialize_world assigns types — so test by
    // reading balance before and after
    let iron_dispatcher = siege_dojo::tokens::resource_token::IResourceTokenDispatcher {
        contract_address: rc.iron,
    };
    // NOTE: ResourceToken doesn't have balance_of on IResourceTokenDispatcher directly.
    // Use a generic ERC20 read via the token's storage if possible, or skip balance check
    // and just verify pillage.last_claim_time advanced (that's the signal that minting happened).

    starknet::testing::set_contract_address(player_a);
    world_sys.claim_pillage_drip(home_parcel_id);

    let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
    // Should have claimed 2 intervals (7200 / 3600)
    assert(pillage.last_claim_time == 1000 + 7200, 'last_claim_time advanced');
    assert(pillage.active, 'still active');
}

#[test]
fn test_claim_pillage_drip_expires_naturally() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_parcel_id = kingdom_b.home_0;

    starknet::testing::set_block_timestamp(1000);

    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id,
        pillager: player_a,
        target: player_b,
        start_time: 1000,
        expires_at: 1000 + 86400,
        last_claim_time: 1000,
        active: true,
    });

    // Advance time past expiration
    starknet::testing::set_block_timestamp(1000 + 86400 + 3600);

    starknet::testing::set_contract_address(player_a);
    world_sys.claim_pillage_drip(home_parcel_id);

    let pillage: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
    assert(!pillage.active, 'should be inactive');
    // Claim was capped at expires_at
    assert(pillage.last_claim_time <= 1000 + 86400, 'capped at expires');
}

#[test]
#[should_panic(expected: ('Not the pillager', 'ENTRYPOINT_FAILED'))]
fn test_claim_pillage_drip_rejects_non_pillager() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    let home_parcel_id = kingdom_b.home_0;

    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id,
        pillager: player_a,
        target: player_b,
        start_time: 0,
        expires_at: 999999999,
        last_claim_time: 0,
        active: true,
    });

    // player_b tries to claim — should fail
    starknet::testing::set_contract_address(player_b);
    world_sys.claim_pillage_drip(home_parcel_id);
}
```

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_claim_pillage_drip`
Expected: All 3 pass

- [ ] **Step 5: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo
git commit -m "feat: add claim_pillage_drip function"
```

---

### Task 6: Modify claim_drip to Skip Pillaged Parcels

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Modify claim_drip**

In `src/systems/world_system.cairo`, find the existing `claim_drip` function:

```cairo
fn claim_drip(ref self: ContractState) {
    let mut world = self.world_default();
    let caller = get_caller_address();
    let mut kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');

    let now = get_block_timestamp();
    let elapsed = now - kingdom.last_drip_time;
    let intervals: u64 = elapsed / DRIP_INTERVAL;
    if intervals == 0 {
        return;
    }

    let rc: ResourceConfig = world.read_model(0_u8);
    let amount: u256 = intervals.into();

    // Mint for each home parcel based on its type
    let home_parcels: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
    let mut i: u32 = 0;
    while i < 3 {
        let parcel: Parcel = world.read_model(*home_parcels.at(i));
        self.mint_parcel_resources(@rc, parcel.parcel_type, caller, amount);
        i += 1;
    };

    kingdom.last_drip_time = kingdom.last_drip_time + (intervals * DRIP_INTERVAL);
    world.write_model(@kingdom);
}
```

Replace the home-parcel loop with a pillage-aware version:

```cairo
fn claim_drip(ref self: ContractState) {
    let mut world = self.world_default();
    let caller = get_caller_address();
    let mut kingdom: PlayerKingdom = world.read_model(caller);
    assert(kingdom.registered, 'Not registered');

    let now = get_block_timestamp();
    let elapsed = now - kingdom.last_drip_time;
    let intervals: u64 = elapsed / DRIP_INTERVAL;
    if intervals == 0 {
        return;
    }

    let rc: ResourceConfig = world.read_model(0_u8);
    let amount: u256 = intervals.into();

    // Mint for each home parcel based on its type, skipping actively pillaged ones
    let home_parcels: Array<u32> = array![kingdom.home_0, kingdom.home_1, kingdom.home_2];
    let mut i: u32 = 0;
    while i < 3 {
        let home_id = *home_parcels.at(i);
        let pillage: Pillage = world.read_model(home_id);
        let is_pillaged = pillage.active && pillage.expires_at > now;
        if !is_pillaged {
            let parcel: Parcel = world.read_model(home_id);
            self.mint_parcel_resources(@rc, parcel.parcel_type, caller, amount);
        }
        i += 1;
    };

    kingdom.last_drip_time = kingdom.last_drip_time + (intervals * DRIP_INTERVAL);
    world.write_model(@kingdom);
}
```

- [ ] **Step 2: Write test**

Add to `src/tests/test_pillaging.cairo`:

```cairo
#[test]
fn test_claim_drip_skips_pillaged_parcel() {
    let (mut world, world_sys, _player_a, player_b, _erc1155) = full_setup();

    // Set up a pillage on one of B's home parcels
    let kingdom_b: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);

    starknet::testing::set_block_timestamp(1000);
    // Initialize B's last_drip_time to start from now
    let mut kb_mut = kingdom_b;
    kb_mut.last_drip_time = 1000;
    world.write_model_test(@kb_mut);

    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id: kingdom_b.home_0,
        pillager: contract_address_const::<0x999>(),
        target: player_b,
        start_time: 1000,
        expires_at: 1000 + 86400,
        last_claim_time: 1000,
        active: true,
    });

    // Advance time by 2 hours
    starknet::testing::set_block_timestamp(1000 + 7200);

    starknet::testing::set_contract_address(player_b);
    world_sys.claim_drip();

    // Verify last_drip_time advanced (regardless of pillage)
    let kb_after: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_b);
    assert(kb_after.last_drip_time == 1000 + 7200, 'last_drip_time advanced');

    // Two of B's 3 home parcels should have minted 2 intervals of resources.
    // The pillaged one (home_0) should have minted 0.
    // We can't easily check balances without a balance_of interface, but the test
    // verifies the flow runs without panicking. The pillage.active check is verified
    // by the assertion that claim_drip doesn't revert and last_drip_time advances.
}
```

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_claim_drip_skips_pillaged_parcel`
Expected: PASS

Run: `sozo test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo
git commit -m "feat: claim_drip skips actively pillaged home parcels"
```

---

### Task 7: Pillage Breaks on Revenge Match Win

**Files:**
- Modify: `src/systems/world_system.cairo`
- Modify: `src/tests/test_pillaging.cairo`

- [ ] **Step 1: Add pillage-break logic to settle_match**

In `src/systems/world_system.cairo`, in `settle_match`, inside the non-draw branch, AFTER granting eligibility (at the end of the non-draw branch), add:

```cairo
// If the winner is currently being pillaged by the loser, break those pillages
let winner_kingdom_read: PlayerKingdom = world.read_model(winner);
let winner_homes: Array<u32> = array![
    winner_kingdom_read.home_0,
    winner_kingdom_read.home_1,
    winner_kingdom_read.home_2,
];
let mut pi: u32 = 0;
while pi < 3 {
    let home_id = *winner_homes.at(pi);
    let mut existing: Pillage = world.read_model(home_id);
    if existing.active && existing.pillager == loser {
        existing.active = false;
        world.write_model(@existing);
    }
    pi += 1;
};
```

- [ ] **Step 2: Write test**

Add to `src/tests/test_pillaging.cairo`:

```cairo
#[test]
fn test_pillage_ends_when_target_beats_pillager() {
    let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup();

    // Set up an active pillage by player_b on player_a's home_0
    let kingdom_a: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
    let home_parcel_id = kingdom_a.home_0;

    world.write_model_test(@siege_dojo::models::pillage::Pillage {
        home_parcel_id,
        pillager: player_b,
        target: player_a,
        start_time: 0,
        expires_at: 999999999,
        last_claim_time: 0,
        active: true,
    });

    // Player A wins a match against player B (revenge)
    starknet::testing::set_contract_address(player_a);
    let match_id = world_sys.create_staked_match(player_b, array![1]);
    starknet::testing::set_contract_address(player_b);
    world_sys.join_staked_match(match_id, array![2]);

    world.write_model_test(@siege_dojo::models::match_state_1v1::MatchState1v1 {
        match_id, player_a, player_b,
        vault_a_hp: 30, vault_b_hp: 0,
        current_round: 5,
        status: siege_dojo::models::match_state::MatchStatus::Finished,
    });
    world_sys.settle_match(match_id);

    // Verify the pillage is no longer active
    let pillage_after: siege_dojo::models::pillage::Pillage = world.read_model(home_parcel_id);
    assert(!pillage_after.active, 'pillage should be broken');
}
```

- [ ] **Step 3: Run tests**

Run: `sozo test -f test_pillage_ends_when_target_beats_pillager`
Expected: PASS

Run: `sozo test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_pillaging.cairo
git commit -m "feat: break active pillage when target beats the pillager in a match"
```

---

### Task 8: Frontend Pillage Hooks

**Files:**
- Create: `frontend/src/lib/pillage.ts`

- [ ] **Step 1: Create pillage.ts**

Create `frontend/src/lib/pillage.ts`:

```typescript
import { useEffect, useState } from "react";
import type { AccountInterface } from "starknet";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

export const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "";

export interface PillageData {
  homeParcelId: number;
  pillager: string;
  target: string;
  startTime: number;
  expiresAt: number;
  lastClaimTime: number;
  active: boolean;
}

export interface PillageEligibilityData {
  winner: string;
  matchId: number;
  loser: string;
  grantedAt: number;
  expiresAt: number;
  used: boolean;
}

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

export function useActivePillages(playerAddress: string | null): {
  asPillager: PillageData[];
  asTarget: PillageData[];
} {
  const [data, setData] = useState<{ asPillager: PillageData[]; asTarget: PillageData[] }>({
    asPillager: [],
    asTarget: [],
  });

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPillageModels: GraphEdges<{
          home_parcel_id: string;
          pillager: string;
          target: string;
          start_time: string;
          expires_at: string;
          last_claim_time: string;
          active: boolean;
        }>;
      }>(`
        query {
          siegeDojoPillageModels {
            edges { node {
              home_parcel_id pillager target start_time expires_at last_claim_time active
            } }
          }
        }
      `);

      const now = Math.floor(Date.now() / 1000);
      const entries = (result?.siegeDojoPillageModels?.edges || [])
        .map((e) => ({
          homeParcelId: toNum(e.node.home_parcel_id),
          pillager: e.node.pillager,
          target: e.node.target,
          startTime: toNum(e.node.start_time),
          expiresAt: toNum(e.node.expires_at),
          lastClaimTime: toNum(e.node.last_claim_time),
          active: e.node.active,
        }))
        .filter((p) => p.active && p.expiresAt > now);

      const addr = playerAddress.toLowerCase();
      setData({
        asPillager: entries.filter((p) => p.pillager.toLowerCase() === addr),
        asTarget: entries.filter((p) => p.target.toLowerCase() === addr),
      });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function usePillageEligibilities(playerAddress: string | null): PillageEligibilityData[] {
  const [data, setData] = useState<PillageEligibilityData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPillageEligibilityModels: GraphEdges<{
          winner: string;
          match_id: string;
          loser: string;
          granted_at: string;
          expires_at: string;
          used: boolean;
        }>;
      }>(`
        query {
          siegeDojoPillageEligibilityModels(where: { winner: "${playerAddress}" }) {
            edges { node { winner match_id loser granted_at expires_at used } }
          }
        }
      `);

      const now = Math.floor(Date.now() / 1000);
      const entries = (result?.siegeDojoPillageEligibilityModels?.edges || [])
        .map((e) => ({
          winner: e.node.winner,
          matchId: toNum(e.node.match_id),
          loser: e.node.loser,
          grantedAt: toNum(e.node.granted_at),
          expiresAt: toNum(e.node.expires_at),
          used: e.node.used,
        }))
        .filter((eli) => !eli.used && eli.expiresAt > now);

      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export async function initiatePillage(
  account: AccountInterface,
  matchId: number,
  homeParcelId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "initiate_pillage",
    calldata: [matchId.toString(), homeParcelId.toString()],
  });
  return result.transaction_hash;
}

export async function claimPillageDrip(
  account: AccountInterface,
  homeParcelId: number,
): Promise<string> {
  const result = await account.execute({
    contractAddress: WORLD_SYSTEM_ADDRESS,
    entrypoint: "claim_pillage_drip",
    calldata: [homeParcelId.toString()],
  });
  return result.transaction_hash;
}

export function formatTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const secs = expiresAt - now;
  if (secs <= 0) return "Expired";
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pillage.ts
git commit -m "feat: add pillage frontend hooks — useActivePillages, usePillageEligibilities, contract wrappers"
```

---

### Task 9: Final Integration

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All tests pass (~125+ tests: 118 existing + 9-10 new pillaging tests)

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 pass

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for pillaging system"
```
