# Phase 2B: Ability Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tactical ability activation to 1v1 matches — players commit an ability per round, and resolution applies its combat effect.

**Architecture:** Extend the existing commit-reveal-resolution pipeline. The Poseidon hash grows from 14 to 16 elements (adding `ability_id` and `ability_target`). A new `MatchAbilities1v1` model tracks which abilities each player brought and which have been used. `RoundMoves1v1` gains 4 new fields for per-round ability data. Resolution applies 5 ability effects in a defined order integrated into the existing damage calculation.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0

**Note:** This plan does NOT implement ability staking or escrow. Players "declare" their 3 abilities at match creation. The world system plan handles token transfers.

---

### Task 1: Models — MatchAbilities1v1 + RoundMoves1v1 Extension

Create the new model for tracking brought/used abilities per match, and extend RoundMoves1v1 with per-round ability activation fields.

**Files:**
- Create: `src/models/match_abilities_1v1.cairo`
- Modify: `src/models/round_moves_1v1.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create MatchAbilities1v1 model**

```cairo
// src/models/match_abilities_1v1.cairo

#[dojo::model]
#[derive(Drop, Serde)]
pub struct MatchAbilities1v1 {
    #[key]
    pub match_id: u64,
    // Abilities each player brought (ability type IDs 1-5, 0 = empty slot)
    pub a_ability_1: u8,
    pub a_ability_2: u8,
    pub a_ability_3: u8,
    pub b_ability_1: u8,
    pub b_ability_2: u8,
    pub b_ability_3: u8,
    // Track which slots have been used (one-time per match)
    pub a_used_1: bool,
    pub a_used_2: bool,
    pub a_used_3: bool,
    pub b_used_1: bool,
    pub b_used_2: bool,
    pub b_used_3: bool,
}
```

- [ ] **Step 2: Add ability fields to RoundMoves1v1**

Add these 4 fields to the end of `src/models/round_moves_1v1.cairo`:

```cairo
#[dojo::model]
#[derive(Drop, Serde)]
pub struct RoundMoves1v1 {
    #[key]
    pub match_id: u64,
    #[key]
    pub round: u32,
    pub commit_count: u8,
    pub reveal_count: u8,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub a_p0: u8, pub a_p1: u8, pub a_p2: u8,
    pub a_g0: u8, pub a_g1: u8, pub a_g2: u8,
    pub a_repair: u8,
    pub a_nc0: u8, pub a_nc1: u8, pub a_nc2: u8,
    pub b_p0: u8, pub b_p1: u8, pub b_p2: u8,
    pub b_g0: u8, pub b_g1: u8, pub b_g2: u8,
    pub b_repair: u8,
    pub b_nc0: u8, pub b_nc1: u8, pub b_nc2: u8,
    // Ability activation per round (Phase 2B)
    pub a_ability_id: u8,    // 0 = none, 1-5 = ability activated
    pub a_ability_target: u8, // 0-2 = target gate (Siege Sword only)
    pub b_ability_id: u8,
    pub b_ability_target: u8,
}
```

- [ ] **Step 3: Register new model in lib.cairo**

Add to the `pub mod models` block in `src/lib.cairo`:

```cairo
    pub mod match_abilities_1v1;
```

- [ ] **Step 4: Verify build compiles**

Run: `sozo build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/models/match_abilities_1v1.cairo src/models/round_moves_1v1.cairo src/lib.cairo
git commit -m "feat: add MatchAbilities1v1 model + ability fields on RoundMoves1v1"
```

---

### Task 2: Commit-Reveal — 16-Element Hash + Ability Validation

Update the commit-reveal contract to accept ability parameters, hash them into the commitment, and validate/track usage on reveal.

**Files:**
- Modify: `src/systems/commit_reveal_1v1.cairo`
- Modify: `src/tests/test_commit_reveal_1v1.cairo`

**Important:** The hash changes from 14 to 16 elements. ALL existing tests that compute hashes must be updated.

- [ ] **Step 1: Update the test hash helper and write ability tests**

In `src/tests/test_commit_reveal_1v1.cairo`, update `hash_1v1_move` to accept ability params and add new tests:

```cairo
    fn hash_1v1_move(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
        h = h.update(ability_id.into()); h = h.update(ability_target.into());
        h.finalize()
    }
```

Update all existing test calls to pass `0, 0` for the two new ability params. For example, `test_full_commit_reveal_cycle_1v1`:

```cairo
    #[test]
    fn test_full_commit_reveal_cycle_1v1() {
        let (mut world, _, cr_sys, match_id) = setup();

        let salt: felt252 = 42;
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal(match_id, salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        let state: siege_dojo::models::match_state_1v1::MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 47, 'vault_a should be 47');
        assert(state.vault_b_hp == 47, 'vault_b should be 47');
        assert(state.current_round == 2, 'should advance to round 2');
    }
```

Update `test_over_budget_rejected_1v1` and `test_invalid_hash_rejected_1v1` the same way (add `0, 0` ability params to hash_1v1_move calls and reveal calls).

Add new ability-specific tests:

```cairo
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};

    // Update namespace_def to include MatchAbilities1v1:
    // Add: TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),

    #[test]
    fn test_reveal_with_ability_stores_activation() {
        let (mut world, _, cr_sys, match_id) = setup();

        // Set up abilities for the match (player A has Siege Sword in slot 1)
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 1, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        let salt: felt252 = 42;
        // Player A activates ability 1 (Siege Sword) targeting gate 0
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);

        // Verify ability stored in RoundMoves1v1
        let rm: RoundMoves1v1 = world.read_model((match_id, 1_u32));
        assert(rm.a_ability_id == 1, 'a_ability_id should be 1');
        assert(rm.a_ability_target == 0, 'a_ability_target should be 0');

        // Verify ability marked as used
        let abilities: MatchAbilities1v1 = world.read_model(match_id);
        assert(abilities.a_used_1, 'slot 1 should be used');
    }

    #[test]
    #[should_panic(expected: ('Ability not available',))]
    fn test_reveal_ability_not_in_set() {
        let (mut world, _, cr_sys, match_id) = setup();

        // Player A has no abilities
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        let salt: felt252 = 42;
        // Try to activate ability 1 without having it
        let h_a = hash_1v1_move(salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
        let h_b = hash_1v1_move(salt, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, 3, 2, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_commit_reveal_1v1`
Expected: FAIL — reveal() signature doesn't match yet.

- [ ] **Step 3: Update ICommitReveal1v1 trait**

In `src/systems/commit_reveal_1v1.cairo`, update the trait:

```cairo
#[starknet::interface]
pub trait ICommitReveal1v1<T> {
    fn commit(ref self: T, match_id: u64, commitment: felt252);
    fn reveal(
        ref self: T,
        match_id: u64,
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    );
    fn force_timeout(ref self: T, match_id: u64);
}
```

- [ ] **Step 4: Update reveal() implementation**

In the `reveal` function body inside `commit_reveal_1v1` module:

Add import at top of module:
```cairo
    use siege_dojo::models::match_abilities_1v1::MatchAbilities1v1;
```

Update the hash computation to include ability fields (after trap2, before finalize):
```cairo
            h = h.update(ability_id.into());
            h = h.update(ability_target.into());
```

After the trap validation block and before `c.revealed = true`, add ability validation:

```cairo
            // Ability validation
            if ability_id > 0 {
                assert(ability_id <= 5, 'Invalid ability ID');
                assert(ability_target <= 2, 'Invalid ability target');

                let mut abilities: MatchAbilities1v1 = world.read_model(match_id);

                if is_player_a {
                    // Find the ability in player A's slots and verify not used
                    let mut found = false;
                    if abilities.a_ability_1 == ability_id && !abilities.a_used_1 {
                        abilities.a_used_1 = true;
                        found = true;
                    } else if abilities.a_ability_2 == ability_id && !abilities.a_used_2 {
                        abilities.a_used_2 = true;
                        found = true;
                    } else if abilities.a_ability_3 == ability_id && !abilities.a_used_3 {
                        abilities.a_used_3 = true;
                        found = true;
                    }
                    assert(found, 'Ability not available');
                } else {
                    let mut found = false;
                    if abilities.b_ability_1 == ability_id && !abilities.b_used_1 {
                        abilities.b_used_1 = true;
                        found = true;
                    } else if abilities.b_ability_2 == ability_id && !abilities.b_used_2 {
                        abilities.b_used_2 = true;
                        found = true;
                    } else if abilities.b_ability_3 == ability_id && !abilities.b_used_3 {
                        abilities.b_used_3 = true;
                        found = true;
                    }
                    assert(found, 'Ability not available');
                }

                world.write_model(@abilities);
            }
```

Update the RoundMoves1v1 write to include ability fields:

```cairo
            if role == ROLE_A {
                rm.a_p0 = p0; rm.a_p1 = p1; rm.a_p2 = p2;
                rm.a_g0 = g0; rm.a_g1 = g1; rm.a_g2 = g2;
                rm.a_repair = repair;
                rm.a_nc0 = nc0; rm.a_nc1 = nc1; rm.a_nc2 = nc2;
                rm.a_ability_id = ability_id;
                rm.a_ability_target = ability_target;
            } else {
                rm.b_p0 = p0; rm.b_p1 = p1; rm.b_p2 = p2;
                rm.b_g0 = g0; rm.b_g1 = g1; rm.b_g2 = g2;
                rm.b_repair = repair;
                rm.b_nc0 = nc0; rm.b_nc1 = nc1; rm.b_nc2 = nc2;
                rm.b_ability_id = ability_id;
                rm.b_ability_target = ability_target;
            }
```

- [ ] **Step 5: Run tests**

Run: `sozo test -f test_commit_reveal_1v1`
Expected: All tests PASS (existing tests pass with 0,0 ability params; new ability tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/systems/commit_reveal_1v1.cairo src/tests/test_commit_reveal_1v1.cairo src/models/match_abilities_1v1.cairo
git commit -m "feat: 16-element commit hash with ability validation on reveal"
```

---

### Task 3: Resolution — Apply Ability Effects

Integrate ability effects into the resolution pipeline. This is the core gameplay change.

**Files:**
- Modify: `src/systems/resolution_1v1.cairo`
- Modify: `src/tests/test_resolution_1v1.cairo` (or create `src/tests/test_abilities_1v1.cairo`)

**Resolution order:**
1. Gate modifiers (existing)
2. **Fortify** — double defense values
3. **Siege Sword** — set attack on target gate to 10
4. Gate damage calc (existing)
5. **Stone Cloak** — zero all gate damage to this player + zero overflow to this player
6. Overflow/Reflection (existing)
7. **Hex** — reduce opponent's total damage by 7
8. Repair (existing)
9. **Ember Blast** — 5 direct vault damage
10. Traps (existing)

- [ ] **Step 1: Write ability resolution tests**

Create `src/tests/test_abilities_1v1.cairo` and register it in `src/lib.cairo` under `#[cfg(test)] pub mod tests`:

```cairo
    pub mod test_abilities_1v1;
```

```cairo
// src/tests/test_abilities_1v1.cairo

#[starknet::contract]
pub mod MockVrfProvider {
    use starknet::ContractAddress;
    #[derive(Drop, Copy, Clone, Serde)]
    pub enum Source { Nonce: ContractAddress, Salt: felt252 }
    #[storage]
    struct Storage {}
    #[constructor]
    fn constructor(ref self: ContractState) {}
    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn consume_random(ref self: ContractState, source: Source) -> felt252 { 0 }
    }
}

#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::{contract_address_const, testing};
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::{commit_reveal_1v1, ICommitReveal1v1Dispatcher, ICommitReveal1v1DispatcherTrait};
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::m_ResourceConfig;
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    use super::MockVrfProvider;

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn hash_move(
        salt: felt252,
        p0: u8, p1: u8, p2: u8, g0: u8, g1: u8, g2: u8,
        repair: u8, nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
        h = h.update(ability_id.into()); h = h.update(ability_target.into());
        h.finalize()
    }

    fn setup() -> (dojo::world::WorldStorage, IActions1v1Dispatcher, ICommitReveal1v1Dispatcher, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let mock_vrf_addr = deploy_mock_vrf();
        actions_sys.set_vrf_provider(mock_vrf_addr);

        let player_a = contract_address_const::<0x1>();
        let player_b = contract_address_const::<0x2>();
        let match_id = actions_sys.create_match_1v1(player_a, player_b);

        (world, actions_sys, cr_sys, match_id)
    }

    /// Helper: commit + reveal for both players in one call
    fn play_round(
        world: @dojo::world::WorldStorage,
        cr_sys: ICommitReveal1v1Dispatcher,
        match_id: u64,
        salt: felt252,
        // Player A allocations
        a_p0: u8, a_p1: u8, a_p2: u8, a_g0: u8, a_g1: u8, a_g2: u8,
        a_repair: u8, a_nc0: u8, a_nc1: u8, a_nc2: u8,
        a_ability_id: u8, a_ability_target: u8,
        // Player B allocations
        b_p0: u8, b_p1: u8, b_p2: u8, b_g0: u8, b_g1: u8, b_g2: u8,
        b_repair: u8, b_nc0: u8, b_nc1: u8, b_nc2: u8,
        b_ability_id: u8, b_ability_target: u8,
    ) {
        let h_a = hash_move(salt, a_p0, a_p1, a_p2, a_g0, a_g1, a_g2, a_repair, a_nc0, a_nc1, a_nc2, 0, 0, 0, a_ability_id, a_ability_target);
        let h_b = hash_move(salt, b_p0, b_p1, b_p2, b_g0, b_g1, b_g2, b_repair, b_nc0, b_nc1, b_nc2, 0, 0, 0, b_ability_id, b_ability_target);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(contract_address_const::<0x1>());
        cr_sys.reveal(match_id, salt, a_p0, a_p1, a_p2, a_g0, a_g1, a_g2, a_repair, a_nc0, a_nc1, a_nc2, 0, 0, 0, a_ability_id, a_ability_target);
        testing::set_contract_address(contract_address_const::<0x2>());
        cr_sys.reveal(match_id, salt, b_p0, b_p1, b_p2, b_g0, b_g1, b_g2, b_repair, b_nc0, b_nc1, b_nc2, 0, 0, 0, b_ability_id, b_ability_target);
    }

    #[test]
    fn test_siege_sword_overrides_attack() {
        let (mut world, _, cr_sys, match_id) = setup();

        // Player A has Siege Sword (ID 1)
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 1, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 0, b_ability_2: 0, b_ability_3: 0,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // A: atk [1,0,0], def [0,0,0], repair 0, nodes [0,0,0], ability=1 target=0
        // B: atk [0,0,0], def [5,5,0], repair 0, nodes [0,0,0], no ability
        // Siege Sword overrides A's p0 from 1 to 10
        // Damage to B gate 0: max(0, 10-5) = 5
        // Damage to B gate 1: max(0, 0-5) = 0
        // Damage to B gate 2: max(0, 0-0) = 0
        // Total damage to B: 5
        // B HP: 50 - 5 = 45
        play_round(
            @world, cr_sys, match_id, 42,
            1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, // A: atk 1/0/0, Siege Sword on gate 0
            0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0,  // B: def 5/5/0, no ability
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_a_hp == 50, 'a should be 50 (no dmg from b)');
        assert(state.vault_b_hp == 45, 'b should be 45 (5 from sword)');
    }

    #[test]
    fn test_stone_cloak_blocks_gate_damage() {
        let (mut world, _, cr_sys, match_id) = setup();

        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 2, b_ability_2: 0, b_ability_3: 0, // B has Stone Cloak
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // A: atk [5,3,2], def [0,0,0] = 10
        // B: atk [0,0,0], def [0,0,0], Stone Cloak active
        // Without cloak: B takes 5+3+2 = 10 damage
        // With cloak: B takes 0 gate damage
        play_round(
            @world, cr_sys, match_id, 42,
            5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, // A: full attack
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0,  // B: Stone Cloak (ID 2)
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'b should take 0 gate damage');
    }

    #[test]
    fn test_ember_blast_bypasses_gates() {
        let (mut world, _, cr_sys, match_id) = setup();

        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 3, a_ability_2: 0, a_ability_3: 0, // A has Ember Blast
            b_ability_1: 2, b_ability_2: 0, b_ability_3: 0, // B has Stone Cloak
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // A uses Ember Blast, B uses Stone Cloak
        // Stone Cloak blocks gate damage but NOT Ember Blast
        // B takes 5 direct damage from Ember Blast
        play_round(
            @world, cr_sys, match_id, 42,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, // A: Ember Blast (ID 3)
            0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 2, 0,  // B: Stone Cloak (ID 2)
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 45, 'b takes 5 from ember blast');
    }

    #[test]
    fn test_hex_reduces_damage() {
        let (mut world, _, cr_sys, match_id) = setup();

        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 4, b_ability_2: 0, b_ability_3: 0, // B has Hex
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // A: atk [5,3,2], def [0,0,0] = 10 budget
        // B: def [0,0,0], uses Hex
        // Without Hex: B takes 5+3+2 = 10 damage
        // With Hex: B takes max(0, 10-7) = 3 damage
        play_round(
            @world, cr_sys, match_id, 42,
            5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, // A: full attack
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0,  // B: Hex (ID 4)
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 47, 'b should take 3 (10-7 hex)');
    }

    #[test]
    fn test_fortify_doubles_defense() {
        let (mut world, _, cr_sys, match_id) = setup();

        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: 0, a_ability_2: 0, a_ability_3: 0,
            b_ability_1: 5, b_ability_2: 0, b_ability_3: 0, // B has Fortify
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        // A: atk [4,3,3], def [0,0,0] = 10
        // B: atk [0,0,0], def [3,3,4], Fortify → defense becomes [6,6,8]
        // Damage to B: max(0,4-6)+max(0,3-6)+max(0,3-8) = 0+0+0 = 0
        play_round(
            @world, cr_sys, match_id, 42,
            4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, // A: attack 4/3/3
            0, 0, 0, 3, 3, 4, 0, 0, 0, 0, 5, 0,  // B: def 3/3/4, Fortify (ID 5)
        );

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'b takes 0 (fortify doubles def)');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `sozo test -f test_abilities_1v1`
Expected: FAIL — resolution doesn't apply ability effects yet.

- [ ] **Step 3: Implement ability effects in resolution_1v1**

In `src/systems/resolution_1v1.cairo`, modify the `resolve_round` function. The changes integrate into the existing damage calculation:

After reading `rm` (RoundMoves1v1) and before the gate loop, read ability activations:

```cairo
            // Read ability activations
            let a_ability = rm.a_ability_id;
            let a_target = rm.a_ability_target;
            let b_ability = rm.b_ability_id;
            let b_target = rm.b_ability_target;
```

Inside the gate loop, AFTER modifier application (Narrow Pass, Mirror — existing lines 115-131) and BEFORE the damage calculation, add Fortify and Siege Sword. These must apply inside the loop because modifiers adjust the raw values first:

```cairo
                // --- ABILITY: Fortify (ID 5) — double defense after modifiers ---
                if a_ability == 5 {
                    ad = ad * 2;
                }
                if b_ability == 5 {
                    bd = bd * 2;
                }

                // --- ABILITY: Siege Sword (ID 1) — override attack on target gate to 10 ---
                if a_ability == 1 && g == a_target.into() {
                    aa = 10;
                }
                if b_ability == 1 && g == b_target.into() {
                    ba = 10;
                }
```

The rest of the gate loop (damage calculation, overflow) proceeds unchanged using the modified `aa`, `ad`, `ba`, `bd` values.

After the gate loop and overflow redistribution, before summing total damage, add Stone Cloak and Hex:

```cairo
            // --- ABILITY: Stone Cloak (ID 2) — zero all gate damage to this player ---
            if a_ability == 2 {
                damage_to_a = [0, 0, 0];
            }
            if b_ability == 2 {
                damage_to_b = [0, 0, 0];
            }
```

Stone Cloak should apply BEFORE overflow redistribution. Move it between the main gate loop and the overflow loop. In the existing code, the overflow loop starts at line 187. Insert Stone Cloak before it:

```cairo
            // --- ABILITY: Stone Cloak (ID 2) — zero gate damage + overflow before redistribution ---
            if a_ability == 2 {
                damage_to_a = [0, 0, 0];
                overflow_to_a = [0, 0, 0];
            }
            if b_ability == 2 {
                damage_to_b = [0, 0, 0];
                overflow_to_b = [0, 0, 0];
            }
```

After overflow redistribution and total damage calculation, apply Hex:

```cairo
            // --- ABILITY: Hex (ID 4) — reduce opponent's total damage by 7 ---
            let mut total_dmg_to_b: u8 = *damage_to_b.span()[0] + *damage_to_b.span()[1] + *damage_to_b.span()[2];
            let mut total_dmg_to_a: u8 = *damage_to_a.span()[0] + *damage_to_a.span()[1] + *damage_to_a.span()[2];

            if a_ability == 4 {
                // A uses Hex → reduce damage to A by 7
                if total_dmg_to_a > 7 {
                    total_dmg_to_a = total_dmg_to_a - 7;
                } else {
                    total_dmg_to_a = 0;
                }
            }
            if b_ability == 4 {
                // B uses Hex → reduce damage to B by 7
                if total_dmg_to_b > 7 {
                    total_dmg_to_b = total_dmg_to_b - 7;
                } else {
                    total_dmg_to_b = 0;
                }
            }
```

After repair and HP damage application, before trap damage, add Ember Blast:

```cairo
            // --- ABILITY: Ember Blast (ID 3) — 5 direct vault damage, post-repair ---
            if a_ability == 3 {
                // A uses Ember Blast → 5 damage to B's vault
                if hp_b > 5 { hp_b = hp_b - 5; } else { hp_b = 0; }
            }
            if b_ability == 3 {
                // B uses Ember Blast → 5 damage to A's vault
                if hp_a > 5 { hp_a = hp_a - 5; } else { hp_a = 0; }
            }
```

- [ ] **Step 4: Run tests**

Run: `sozo test -f test_abilities_1v1`
Expected: All 5 ability tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `sozo test`
Expected: All tests pass (existing tests unchanged because ability_id=0 triggers no effects).

- [ ] **Step 6: Commit**

```bash
git add src/systems/resolution_1v1.cairo src/tests/test_abilities_1v1.cairo src/lib.cairo
git commit -m "feat: ability effects in resolution (Siege Sword, Stone Cloak, Ember Blast, Hex, Fortify)"
```

---

### Task 4: Frontend — Update Crypto & Contract Calls

Update the frontend hash function and reveal call to include ability parameters.

**Files:**
- Modify: `frontend/src/lib/crypto.ts`
- Modify: `frontend/src/lib/contracts1v1.ts`

- [ ] **Step 1: Update computeCommitment1v1 for 16 elements**

In `frontend/src/lib/crypto.ts`, update the function signature and hash:

```typescript
/**
 * Compute Poseidon hash commitment for 1v1 move (all allocations in one hash)
 */
export function computeCommitment1v1(
  salt: string,
  p0: number, p1: number, p2: number,
  g0: number, g1: number, g2: number,
  repair: number,
  nc0: number, nc1: number, nc2: number,
  trap0: number, trap1: number, trap2: number,
  abilityId: number, abilityTarget: number,
): string {
  return hash.computePoseidonHashOnElements([
    salt,
    p0.toString(), p1.toString(), p2.toString(),
    g0.toString(), g1.toString(), g2.toString(),
    repair.toString(),
    nc0.toString(), nc1.toString(), nc2.toString(),
    trap0.toString(), trap1.toString(), trap2.toString(),
    abilityId.toString(), abilityTarget.toString(),
  ]);
}
```

- [ ] **Step 2: Update revealMove1v1 to include ability params**

In `frontend/src/lib/contracts1v1.ts`:

```typescript
export async function revealMove1v1(
  account: AccountInterface,
  matchId: string,
  salt: string,
  p0: string, p1: string, p2: string,
  g0: string, g1: string, g2: string,
  repair: string,
  nc0: string, nc1: string, nc2: string,
  trap0: string, trap1: string, trap2: string,
  abilityId: string, abilityTarget: string,
  includeVrf: boolean,
) {
  const revealCall = {
    contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
    entrypoint: "reveal",
    calldata: [matchId, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, abilityId, abilityTarget],
  };

  if (includeVrf) {
    return account.execute(
      [vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION), revealCall],
      TX_OPTS,
    );
  }

  return account.execute(revealCall, TX_OPTS);
}
```

- [ ] **Step 3: Update any callers of computeCommitment1v1 and revealMove1v1**

Search the frontend codebase for all call sites of `computeCommitment1v1` and `revealMove1v1`. Add `0, 0` (or the actual ability selection) as the last two arguments. Common locations:
- Component files that handle the commit/reveal UI
- `scripts/siege-cli/siege-cli.ts` if it uses these functions

Run: `grep -r "computeCommitment1v1\|revealMove1v1" frontend/src/ scripts/`

Update each call site to include the ability params.

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/crypto.ts frontend/src/lib/contracts1v1.ts
git commit -m "feat: update frontend crypto and contract calls for ability params"
```

---

## Open Items (Post-Plan)

1. **Frontend UI for ability selection** — the plan updates the data layer but not the UI components. A follow-up task should add ability selection to the round commit UI.
2. **CLI updates** — `scripts/siege-cli/siege-cli.ts` needs ability params in its commit/reveal flow.
3. **Match creation with abilities** — currently MatchAbilities1v1 is written manually in tests. A production flow needs the match creator to specify brought abilities (part of the world system plan).
4. **Ability effects in conquest** — the conquest contract needs its own ability application logic (separate from resolution_1v1).
