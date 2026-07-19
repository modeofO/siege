# Matchmaking v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Queue-based auto-matching for unstaked 1v1 matches — single-slot on-chain queue, match-on-join, heartbeat staleness — with frontend "Find opponent" flow and MCP tools.

**Architecture:** New `matchmaking` Dojo contract holds a singleton `QueueSlot` plus per-player `QueueStatus`. `queue_for_match` pokes/enqueues/pairs in one entrypoint; pairing consumes VRF and calls `actions_1v1.create_match_1v1_delegated`. Clients discover pairing by polling their `QueueStatus` row via Torii SQL.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0 (build via `docker compose run --rm builder sozo build`), Next 16 frontend (bun), mcp-server-2 TypeScript (pnpm).

**Spec:** `docs/superpowers/specs/2026-07-18-matchmaking-design.md`

## Global Constraints

- Do NOT migrate or deploy contracts. Do NOT push to remote. Commit after every task.
- Commit format: `--author="ModeofO <modeofO@users.noreply.github.com>"` and body trailer `Co-authored-by: Claude <noreply@anthropic.com>`.
- All sozo commands via Docker builder: `docker compose run --rm builder sozo build` / `sozo test` (local sozo is too old).
- `STALE_SECONDS = 120` on-chain; frontend pokes every 60s, polls Torii every 3s.
- Frontend uses `BigInt(0)` not `0n`; Torii SQL only (no GraphQL); u64 columns compared with `sqlU64()`, addresses with `sqlAddr()`.
- Manifests do not contain `siege_dojo-matchmaking` until a future migrate — frontend and MCP MUST degrade gracefully when the address is missing (frontend hides the feature, MCP tool returns a clear error). This is what keeps both buildable and shippable pre-migrate.
- VRF: every `queue_for_match` tx is the multicall `[vrf.request_random(matchmaking), matchmaking.queue_for_match]`; the contract consumes unconditionally so the paymaster wrapper never reverts on unconsumed randomness. `leave_queue` is always bare (never consumes).

---

### Task 1: Queue models

**Files:**
- Create: `src/models/match_queue.cairo`
- Modify: `src/lib.cairo` (models block)

**Interfaces:**
- Produces: `QueueSlot { queue_id: u8 (key, always 0), player: ContractAddress, queued_at: u64 }`, `QueueStatus { player: ContractAddress (key), state: u8, queued_at: u64, matched_match_id: u64 }`. State codes: 0 idle, 1 queued, 2 matched. Model class hashes `m_QueueSlot`, `m_QueueStatus` for tests.

- [ ] **Step 1: Write `src/models/match_queue.cairo`**

```cairo
use starknet::ContractAddress;

// Single-slot matchmaking queue. With no compatibility filters (v1 is
// pair-anyone), the queue can never hold more than one fresh entry — the
// second arrival always matches the head — so one slot is sufficient and
// there is no unbounded scan.
#[dojo::model]
#[derive(Drop, Serde)]
pub struct QueueSlot {
    #[key]
    pub queue_id: u8, // always 0 (singleton)
    pub player: ContractAddress, // zero address = empty
    pub queued_at: u64,
}

// Per-player queue state, readable via Torii so each client can watch its own
// row and discover the match_id when the opponent's tx created the pairing.
// state: 0 = idle, 1 = queued, 2 = matched (matched_match_id valid).
#[dojo::model]
#[derive(Drop, Serde)]
pub struct QueueStatus {
    #[key]
    pub player: ContractAddress,
    pub state: u8,
    pub queued_at: u64,
    pub matched_match_id: u64,
}
```

- [ ] **Step 2: Register in `src/lib.cairo`**

In the `pub mod models` block, after `pub mod conquest_cooldown;` add:

```cairo
    pub mod match_queue;
```

- [ ] **Step 3: Build**

Run: `docker compose run --rm builder sozo build`
Expected: success (warnings ok, no errors).

- [ ] **Step 4: Commit**

```bash
git add src/models/match_queue.cairo src/lib.cairo
git commit -m "feat: QueueSlot + QueueStatus matchmaking models" --author="ModeofO <modeofO@users.noreply.github.com>"
```

(Include the Co-authored-by trailer in the body; same for all later commits.)

---

### Task 2: Matchmaking contract + delegated guard

**Files:**
- Create: `src/systems/matchmaking.cairo`
- Modify: `src/systems/actions_1v1.cairo:166-168` (delegated guard)
- Modify: `src/lib.cairo` (systems block)

**Interfaces:**
- Consumes: Task 1 models; `IActions1v1Dispatcher.create_match_1v1_delegated(player_a, player_b, random_value) -> u64`; `IVrfProviderDispatcher` + `Source` (both `pub` in `src/systems/actions_1v1.cairo`).
- Produces: `IMatchmaking { queue_for_match() -> u64, leave_queue() }`. `queue_for_match` returns the match_id when it paired, `0` when it enqueued or poked. `matchmaking::STALE_SECONDS = 120`.

- [ ] **Step 1: Write `src/systems/matchmaking.cairo`**

```cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait IMatchmaking<T> {
    // Returns the created match_id when the caller was paired with the
    // waiting player, or 0 when the caller was enqueued (or poked).
    fn queue_for_match(ref self: T) -> u64;
    fn leave_queue(ref self: T);
}

#[dojo::contract]
pub mod matchmaking {
    use core::num::traits::Zero;
    use starknet::{get_block_timestamp, get_caller_address, get_contract_address};
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorageTrait;
    use siege_dojo::models::match_queue::{QueueSlot, QueueStatus};
    use siege_dojo::models::player_kingdom::PlayerKingdom;
    use siege_dojo::models::resource_config::ResourceConfig;
    use siege_dojo::systems::actions_1v1::{
        IActions1v1Dispatcher, IActions1v1DispatcherTrait,
        IVrfProviderDispatcher, IVrfProviderDispatcherTrait, Source,
    };

    const VRF_PROVIDER_ADDRESS: felt252 =
        0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f;

    // A queue entry is dead this many seconds after its last poke. The
    // frontend re-pokes every 60s while the search UI is open, so a fresh
    // entry implies a live client.
    pub const STALE_SECONDS: u64 = 120;

    pub const QUEUE_STATE_IDLE: u8 = 0;
    pub const QUEUE_STATE_QUEUED: u8 = 1;
    pub const QUEUE_STATE_MATCHED: u8 = 2;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn set_queued(
        ref world: dojo::world::WorldStorage,
        player: starknet::ContractAddress,
        now: u64,
    ) {
        let mut status: QueueStatus = world.read_model(player);
        status.state = QUEUE_STATE_QUEUED;
        status.queued_at = now;
        world.write_model(@status);
    }

    #[abi(embed_v0)]
    impl MatchmakingImpl of super::IMatchmaking<ContractState> {
        fn queue_for_match(ref self: ContractState) -> u64 {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            // Same spam guard as create_match_1v1: queueing is free, so gate
            // it on having a registered Hold.
            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            // Consume VRF unconditionally. Clients always send the
            // [request_random, queue_for_match] multicall, and the Cartridge
            // paymaster wrapper reverts on an unconsumed request — consuming
            // on every path (poke/enqueue/match) keeps the wrap valid. The
            // randomness is only used when a match is actually created.
            let config: ResourceConfig = world.read_model(0_u8);
            let vrf_addr = if config.vrf_provider.is_non_zero() {
                config.vrf_provider
            } else {
                VRF_PROVIDER_ADDRESS.try_into().unwrap()
            };
            let vrf = IVrfProviderDispatcher { contract_address: vrf_addr };
            let random_value = vrf.consume_random(Source::Nonce(get_contract_address()));

            let mut slot: QueueSlot = world.read_model(0_u8);

            // Poke: caller is already the waiting head — refresh heartbeat.
            if slot.player == caller {
                slot.queued_at = now;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            let head_empty = slot.player.is_zero();
            let head_stale = !head_empty && now > slot.queued_at + STALE_SECONDS;

            // Enqueue: nobody (live) is waiting.
            if head_empty || head_stale {
                if head_stale {
                    let mut old: QueueStatus = world.read_model(slot.player);
                    if old.state == QUEUE_STATE_QUEUED {
                        old.state = QUEUE_STATE_IDLE;
                        world.write_model(@old);
                    }
                }
                slot.player = caller;
                slot.queued_at = now;
                world.write_model(@slot);
                set_queued(ref world, caller, now);
                return 0;
            }

            // Match: a live head is waiting. Waiting player becomes player_a.
            let opponent = slot.player;
            let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
            let actions = IActions1v1Dispatcher { contract_address: actions_addr };
            let match_id = actions.create_match_1v1_delegated(opponent, caller, random_value);

            slot.player = Zero::zero();
            slot.queued_at = 0;
            world.write_model(@slot);

            world.write_model(@QueueStatus {
                player: opponent,
                state: QUEUE_STATE_MATCHED,
                queued_at: 0,
                matched_match_id: match_id,
            });
            world.write_model(@QueueStatus {
                player: caller,
                state: QUEUE_STATE_MATCHED,
                queued_at: 0,
                matched_match_id: match_id,
            });

            match_id
        }

        fn leave_queue(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut slot: QueueSlot = world.read_model(0_u8);
            if slot.player == caller {
                slot.player = Zero::zero();
                slot.queued_at = 0;
                world.write_model(@slot);
            }
            // Only clear a queued status — a matched status keeps its
            // matched_match_id so a client that raced leave vs match still
            // finds its game.
            let mut status: QueueStatus = world.read_model(caller);
            if status.state == QUEUE_STATE_QUEUED {
                status.state = QUEUE_STATE_IDLE;
                world.write_model(@status);
            }
        }
    }
}
```

- [ ] **Step 2: Extend delegated guard in `src/systems/actions_1v1.cairo`**

Replace lines 166-168 (inside `create_match_1v1_delegated`):

```cairo
            let caller = get_caller_address();
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
            assert(caller == world_sys_addr, 'Only world_system');
```

with:

```cairo
            let caller = get_caller_address();
            let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
            // matchmaking may be absent (older deployments, some test worlds)
            // — dns returns Option, never unwrap it here.
            let from_matchmaking = match world.dns(@"matchmaking") {
                Option::Some((mm_addr, _)) => caller == mm_addr,
                Option::None => false,
            };
            assert(caller == world_sys_addr || from_matchmaking, 'Unauthorized delegate');
```

Note the existing staked-match tests spawn worlds without a matchmaking
contract — the `Option::None => false` arm is what keeps them passing.

- [ ] **Step 3: Register in `src/lib.cairo`**

In `pub mod systems`, after `pub mod conquest;` add:

```cairo
    pub mod matchmaking;
```

- [ ] **Step 4: Build**

Run: `docker compose run --rm builder sozo build`
Expected: success.

- [ ] **Step 5: Run existing tests (guard regression)**

Run: `docker compose run --rm builder sozo test`
Expected: all ~172 existing tests pass — especially `test_staked_match` (world_system delegated path still authorized).

- [ ] **Step 6: Commit**

```bash
git add src/systems/matchmaking.cairo src/systems/actions_1v1.cairo src/lib.cairo
git commit -m "feat: matchmaking contract — single-slot queue, match-on-join"
```

---

### Task 3: Cairo tests

**Files:**
- Create: `src/tests/test_matchmaking.cairo`
- Modify: `src/lib.cairo` (tests block)

**Interfaces:**
- Consumes: Task 1 models, Task 2 `IMatchmakingDispatcher`; `MockVrfProvider` re-used from `siege_dojo::tests::test_staked_match`.

- [ ] **Step 1: Write `src/tests/test_matchmaking.cairo`**

Setup fabricates registration via `write_model_test` (no world init / parcels / token deploys needed — `queue_for_match` only reads `PlayerKingdom.registered`):

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::matchmaking::{
        matchmaking, IMatchmakingDispatcher, IMatchmakingDispatcherTrait,
    };
    use siege_dojo::models::match_queue::{QueueSlot, m_QueueSlot, QueueStatus, m_QueueStatus};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::events::e_MatchCreated1v1;
    use siege_dojo::tests::test_staked_match::MockVrfProvider;

    const T0: u64 = 1000;

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_QueueSlot::TEST_CLASS_HASH),
                TestResource::Model(m_QueueStatus::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(matchmaking::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"matchmaking")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn register(mut world: dojo::world::WorldStorage, player: starknet::ContractAddress) {
        let mut k: PlayerKingdom = world.read_model(player);
        k.registered = true;
        world.write_model_test(@k);
    }

    fn setup() -> (dojo::world::WorldStorage, IMatchmakingDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        // Point ResourceConfig.vrf_provider at the mock so consume_random works.
        let mock_vrf = deploy_mock_vrf();
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.vrf_provider = mock_vrf;
        world.write_model_test(@rc);

        let (mm_addr, _) = world.dns(@"matchmaking").unwrap();
        starknet::testing::set_block_timestamp(T0);
        (world, IMatchmakingDispatcher { contract_address: mm_addr })
    }

    fn player(n: felt252) -> starknet::ContractAddress {
        match n {
            0 => contract_address_const::<0xA1>(),
            1 => contract_address_const::<0xB2>(),
            _ => contract_address_const::<0xC3>(),
        }
    }

    #[test]
    fn test_enqueue_into_empty_slot() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        let result = mm.queue_for_match();
        assert(result == 0, 'should enqueue, not match');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'a should be head');
        assert(slot.queued_at == T0, 'queued_at = now');

        let status: QueueStatus = world.read_model(a);
        assert(status.state == 1, 'status queued');
        assert(status.queued_at == T0, 'status queued_at');
    }

    #[test]
    fn test_second_player_pairs() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();
        assert(match_id != 0, 'should create match');

        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.player_a == a, 'waiting player is a');
        assert(state.player_b == b, 'joiner is b');
        assert(state.status == MatchStatus::Active, 'match active');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');

        let sa: QueueStatus = world.read_model(a);
        let sb: QueueStatus = world.read_model(b);
        assert(sa.state == 2, 'a matched');
        assert(sb.state == 2, 'b matched');
        assert(sa.matched_match_id == match_id, 'a match id');
        assert(sb.matched_match_id == match_id, 'b match id');
    }

    #[test]
    fn test_poke_refreshes_without_self_match() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        starknet::testing::set_block_timestamp(T0 + 60);
        let result = mm.queue_for_match();
        assert(result == 0, 'poke never matches self');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == a, 'still head');
        assert(slot.queued_at == T0 + 60, 'heartbeat refreshed');
    }

    #[test]
    fn test_stale_head_replaced() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        // Past STALE_SECONDS — b must NOT be matched with the dead head.
        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS + 1);
        starknet::testing::set_contract_address(b);
        let result = mm.queue_for_match();
        assert(result == 0, 'stale head not matched');

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == b, 'b replaced stale head');

        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'stale a idled');
    }

    #[test]
    fn test_exactly_at_threshold_still_fresh() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();

        // now == queued_at + STALE_SECONDS is still fresh (strict >).
        starknet::testing::set_block_timestamp(T0 + matchmaking::STALE_SECONDS);
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();
        assert(match_id != 0, 'boundary entry still fresh');
    }

    #[test]
    fn test_leave_queue() {
        let (mut world, mm) = setup();
        let a = player(0);
        register(world, a);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        mm.leave_queue();

        let slot: QueueSlot = world.read_model(0_u8);
        assert(slot.player == contract_address_const::<0>(), 'slot cleared');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 0, 'status idle');

        // Idempotent when not queued.
        mm.leave_queue();
    }

    #[test]
    fn test_leave_queue_preserves_matched_status() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        starknet::testing::set_contract_address(b);
        let match_id = mm.queue_for_match();

        // a raced a cancel against b's pairing tx and lost — matched status
        // must survive so a's client still finds the game.
        starknet::testing::set_contract_address(a);
        mm.leave_queue();
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 2, 'matched survives leave');
        assert(sa.matched_match_id == match_id, 'match id kept');
    }

    #[test]
    fn test_requeue_after_match() {
        let (mut world, mm) = setup();
        let a = player(0);
        let b = player(1);
        register(world, a);
        register(world, b);

        starknet::testing::set_contract_address(a);
        mm.queue_for_match();
        starknet::testing::set_contract_address(b);
        let first_id = mm.queue_for_match();

        // Both queue again — new match, ids differ, statuses overwritten.
        starknet::testing::set_contract_address(a);
        let r = mm.queue_for_match();
        assert(r == 0, 'a enqueued again');
        let sa: QueueStatus = world.read_model(a);
        assert(sa.state == 1, 'a back to queued');

        starknet::testing::set_contract_address(b);
        let second_id = mm.queue_for_match();
        assert(second_id != 0, 'second match created');
        assert(second_id != first_id, 'new match id');
    }

    #[test]
    #[should_panic(expected: ('Not registered', 'ENTRYPOINT_FAILED'))]
    fn test_unregistered_caller_reverts() {
        let (_world, mm) = setup();
        starknet::testing::set_contract_address(player(2));
        mm.queue_for_match();
    }

    #[test]
    #[should_panic(expected: ('Unauthorized delegate', 'ENTRYPOINT_FAILED'))]
    fn test_delegated_guard_rejects_direct_caller() {
        let (mut world, _mm) = setup();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions = IActions1v1Dispatcher { contract_address: actions_addr };
        starknet::testing::set_contract_address(player(2));
        actions.create_match_1v1_delegated(player(0), player(1), 0);
    }
}
```

- [ ] **Step 2: Register in `src/lib.cairo`**

In the `#[cfg(test)] pub mod tests` block, after `pub mod test_factions;` add:

```cairo
    pub mod test_matchmaking;
```

- [ ] **Step 3: Run the new tests, expect pass**

Run: `docker compose run --rm builder sozo test -f test_matchmaking`
Expected: 10 tests pass. If `should_panic` expected tuples mismatch the actual panic shape, copy the exact tuple format used by existing guard tests (grep `should_panic` in `src/tests/test_staked_match.cairo`) and adjust.

- [ ] **Step 4: Run full suite**

Run: `docker compose run --rm builder sozo test`
Expected: all tests pass (existing ~172 + 10 new).

- [ ] **Step 5: Commit**

```bash
git add src/tests/test_matchmaking.cairo src/lib.cairo
git commit -m "test: matchmaking queue coverage — pair, poke, stale, guard"
```

---

### Task 4: Frontend lib + session policies

**Files:**
- Modify: `frontend/src/lib/contractAddresses.ts`
- Create: `frontend/src/lib/matchmaking.ts`
- Modify: `frontend/src/lib/sessionPolicies.ts`

**Interfaces:**
- Consumes: `vrfRequestRandomCall`, `waitForReceiptOrThrow`, `extractErrorMsg` from `contracts1v1.ts`; `resilientExecute` from `controllerSession`; `toriiSql`, `sqlAddr`, `toNum` from `toriiSql.ts`.
- Produces: `MATCHMAKING_ADDRESS: string` (empty pre-migrate); `queueForMatch(account)`, `leaveQueue(account)`, `fetchQueueStatus(address): Promise<QueueStatusRow | null>` with `QueueStatusRow = { state: number; queuedAt: number; matchedMatchId: number }`.

- [ ] **Step 1: Add address to `frontend/src/lib/contractAddresses.ts`**

Append after the `CRAFTING_1V1_ADDRESS` block:

```ts
// Matchmaking ships before its first migrate — the manifest has no
// siege_dojo-matchmaking tag yet, so this resolves to "" and the frontend
// hides the Find Opponent flow until a deploy adds it.
export const MATCHMAKING_ADDRESS = contractAddress(
  "siege_dojo-matchmaking",
  "NEXT_PUBLIC_MATCHMAKING_ADDRESS",
);
```

- [ ] **Step 2: Create `frontend/src/lib/matchmaking.ts`**

```ts
import type { AccountInterface, UniversalDetails } from "starknet";
import { MATCHMAKING_ADDRESS } from "@/lib/contractAddresses";
import { vrfRequestRandomCall, waitForReceiptOrThrow } from "@/lib/contracts1v1";
import { resilientExecute } from "@/lib/controllerSession";
import { toriiSql, sqlAddr, toNum } from "@/lib/toriiSql";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// QueueStatus.state codes (matchmaking.cairo)
export const QUEUE_IDLE = 0;
export const QUEUE_QUEUED = 1;
export const QUEUE_MATCHED = 2;

// Contract heartbeat window is 120s; poke at half that so one dropped tx
// doesn't stale us out.
export const POKE_INTERVAL_MS = 60_000;
export const POLL_INTERVAL_MS = 3_000;

export interface QueueStatusRow {
  state: number;
  queuedAt: number;
  matchedMatchId: number;
}

// Joins the queue, pokes the heartbeat, or — when someone is waiting —
// creates the match in this tx. The contract consumes the VRF request
// unconditionally, so the wrap is always valid.
export async function queueForMatch(account: AccountInterface) {
  const tx = await resilientExecute(
    account,
    [
      vrfRequestRandomCall(MATCHMAKING_ADDRESS),
      { contractAddress: MATCHMAKING_ADDRESS, entrypoint: "queue_for_match", calldata: [] },
    ],
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Queue for match");
  return tx;
}

// Bare call — leave_queue never consumes randomness, so a VRF wrap would
// revert on the unconsumed request.
export async function leaveQueue(account: AccountInterface) {
  const tx = await resilientExecute(
    account,
    { contractAddress: MATCHMAKING_ADDRESS, entrypoint: "leave_queue", calldata: [] },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Leave queue");
  return tx;
}

export async function fetchQueueStatus(address: string): Promise<QueueStatusRow | null> {
  const rows = await toriiSql<{ state: unknown; queued_at: unknown; matched_match_id: unknown }>(
    `SELECT state, queued_at, matched_match_id FROM "siege_dojo-QueueStatus" WHERE player = ${sqlAddr(address)} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    state: toNum(row.state),
    queuedAt: toNum(row.queued_at),
    matchedMatchId: toNum(row.matched_match_id),
  };
}
```

- [ ] **Step 3: Add session policies in `frontend/src/lib/sessionPolicies.ts`**

Import the address (extend the existing `contractAddresses` import list):

```ts
  MATCHMAKING_ADDRESS,
```

Then inside `SESSION_POLICIES.contracts`, after the `[CONQUEST_ADDRESS]` block, add:

```ts
    // Pre-migrate the manifest has no matchmaking address — an empty key
    // would break the whole policy object, so add it conditionally.
    ...(MATCHMAKING_ADDRESS
      ? {
          [MATCHMAKING_ADDRESS]: {
            methods: [
              { name: "Find Match", entrypoint: "queue_for_match" },
              { name: "Leave Matchmaking Queue", entrypoint: "leave_queue" },
            ],
          },
        }
      : {}),
```

- [ ] **Step 4: Lint + build**

Run: `cd frontend && bun run lint && bun run build`
Expected: both pass (MATCHMAKING_ADDRESS is "" — nothing references it at render time yet).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/contractAddresses.ts frontend/src/lib/matchmaking.ts frontend/src/lib/sessionPolicies.ts
git commit -m "feat: frontend matchmaking lib + session policies"
```

---

### Task 5: Find Opponent UI

**Files:**
- Create: `frontend/src/components/FindOpponent.tsx`
- Modify: `frontend/src/app/match-1v1/create/page.tsx`

**Interfaces:**
- Consumes: Task 4 (`queueForMatch`, `leaveQueue`, `fetchQueueStatus`, `QUEUE_MATCHED`, `POKE_INTERVAL_MS`, `POLL_INTERVAL_MS`, `MATCHMAKING_ADDRESS`); `useAccount` from `@/app/providers`; `extractErrorMsg` from contracts1v1.
- Produces: `<FindOpponent />` self-contained panel; create page gains a third mode `"find"`.

- [ ] **Step 1: Create `frontend/src/components/FindOpponent.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/app/providers";
import { extractErrorMsg } from "@/lib/contracts1v1";
import {
  queueForMatch,
  leaveQueue,
  fetchQueueStatus,
  QUEUE_MATCHED,
  POKE_INTERVAL_MS,
  POLL_INTERVAL_MS,
} from "@/lib/matchmaking";

type Phase = "idle" | "starting" | "searching" | "matched";

export function FindOpponent({ registered }: { registered: boolean }) {
  const { account, address } = useAccount();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  // Match ids are monotonic — anything newer than what we saw before
  // queueing is OUR pairing, so a stale matched row can't false-positive.
  const prevMatchedRef = useRef(0);
  const searchingRef = useRef(false);

  useEffect(() => {
    if (phase !== "searching" || !account || !address) return;
    searchingRef.current = true;

    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    const poll = setInterval(async () => {
      if (!searchingRef.current) return;
      const status = await fetchQueueStatus(address);
      if (
        searchingRef.current &&
        status &&
        status.state === QUEUE_MATCHED &&
        status.matchedMatchId > prevMatchedRef.current
      ) {
        searchingRef.current = false;
        setPhase("matched");
        router.push(`/match-1v1/${status.matchedMatchId}`);
      }
    }, POLL_INTERVAL_MS);

    // Heartbeat: contract entries go stale after 120s; re-poke at 60s.
    const poke = setInterval(async () => {
      if (!searchingRef.current) return;
      try {
        await queueForMatch(account);
      } catch (e) {
        console.warn("[FindOpponent] poke failed:", extractErrorMsg(e));
      }
    }, POKE_INTERVAL_MS);

    return () => {
      searchingRef.current = false;
      clearInterval(tick);
      clearInterval(poll);
      clearInterval(poke);
    };
  }, [phase, account, address, router]);

  const handleFind = async () => {
    if (!account || !address) return;
    setError("");
    setPhase("starting");
    try {
      const before = await fetchQueueStatus(address);
      prevMatchedRef.current = before?.matchedMatchId ?? 0;
      await queueForMatch(account);
      setPhase("searching");
    } catch (e) {
      setError(extractErrorMsg(e));
      setPhase("idle");
    }
  };

  const handleCancel = async () => {
    searchingRef.current = false;
    setPhase("idle");
    setElapsed(0);
    if (!account) return;
    try {
      await leaveQueue(account);
    } catch (e) {
      console.warn("[FindOpponent] leave_queue failed:", extractErrorMsg(e));
    }
  };

  if (!registered) {
    return (
      <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
        Finding a match requires a Hold in the Marches.
      </div>
    );
  }

  if (phase === "searching" || phase === "matched") {
    return (
      <div className="space-y-4 text-center">
        <div className="text-sm text-[#ffd700] tracking-wider animate-pulse">
          {phase === "matched" ? "OPPONENT FOUND — ENTERING MATCH..." : "SEARCHING FOR OPPONENT..."}
        </div>
        <div className="text-xs text-[#6a6a7a]">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} — first player to queue up
          gets matched with you instantly. Keep this page open.
        </div>
        {phase === "searching" && (
          <button
            onClick={handleCancel}
            className="px-6 py-2 border border-[#2a2a3a] text-[#6a6a7a] rounded text-sm hover:border-[#ff3344]/40 hover:text-[#ff3344] transition-colors"
          >
            CANCEL SEARCH
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-[#6a6a7a] leading-relaxed">
        Queue up and get paired with the next player looking for a practice match. If someone is
        already waiting, the match starts immediately.
      </div>
      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}
      <button
        onClick={handleFind}
        disabled={!account || phase === "starting"}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {phase === "starting" ? "JOINING QUEUE..." : "FIND OPPONENT"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the `find` mode into `frontend/src/app/match-1v1/create/page.tsx`**

1. Add imports:

```tsx
import { FindOpponent } from "@/components/FindOpponent";
import { MATCHMAKING_ADDRESS } from "@/lib/contractAddresses";
```

2. Change the mode type (line 32):

```tsx
type Mode = "practice" | "staked" | "find";
```

3. In the mode-toggle grid, make it 3 columns when matchmaking is deployed and
   add the button. Replace `<div className="grid grid-cols-2 gap-2">` with:

```tsx
      <div className={`grid ${MATCHMAKING_ADDRESS ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
```

and add after the STAKED button:

```tsx
        {MATCHMAKING_ADDRESS && (
          <button
            onClick={() => setMode("find")}
            className={`py-2 px-3 border rounded text-sm tracking-wider transition-colors ${
              mode === "find"
                ? "border-[#ffd700] bg-[#ffd700]/10 text-[#ffd700]"
                : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#4a4a5a]"
            }`}
          >
            FIND
          </button>
        )}
```

4. Extend the mode description ternary under the toggle:

```tsx
        {mode === "practice"
          ? "Practice match. No abilities wagered, no parcels transferred. Reputation unchanged until the winner settles."
          : mode === "find"
            ? "Auto-match with the next player in the queue. Practice rules — nothing wagered."
            : "Stake 1–" +
              maxSlots +
              " ability tokens. Winner takes both sides' escrow. Losing releases your furthest-from-home parcel."}
```

5. Render the find panel instead of the opponent/wager/create controls when
   `mode === "find"`. Wrap the existing blocks — Opponent input, staked wager
   picker, "You will be Player A" note, error, and CREATE button — in
   `{mode !== "find" && (<> ... </>)}`, and add before them:

```tsx
      {mode === "find" && <FindOpponent registered={kingdom.registered} />}
```

(The `Not registered` warning block that links to /world stays outside the
conditional — it applies to all modes.)

- [ ] **Step 3: Lint, test, build**

Run: `cd frontend && bun run lint && bun run test && bun run build`
Expected: all pass. Watch for `react-hooks/set-state-in-effect` — the effect above only calls setState from interval callbacks, which is allowed; do not add synchronous setState to the effect body.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FindOpponent.tsx frontend/src/app/match-1v1/create/page.tsx
git commit -m "feat: Find Opponent matchmaking flow on create page"
```

---

### Task 6: MCP server tools

**Files:**
- Modify: `mcp-server-2/src/config.ts` (SiegeContracts + loadConfig)
- Modify: `mcp-server-2/src/policies.ts` (buildPolicies)
- Modify: `mcp-server-2/src/state.ts` (QueueStatusData + query)
- Modify: `mcp-server-2/src/tools.ts` (3 new tools)

**Interfaces:**
- Consumes: `execute`, `call`, `vrfRequestRandom` (tx.ts); `register` pattern in `registerSiegeTools`; `ctx.config.contracts`, `ctx.state`, `ctx.agentAddress`.
- Produces: `SiegeContracts.matchmaking: string | null`; `StateClient.queueStatus(player): Promise<QueueStatusData | null>`; tools `siege_queue_for_match`, `siege_leave_queue`, `siege_queue_status`.

- [ ] **Step 1: `config.ts` — optional matchmaking address**

In `SiegeContracts` add:

```ts
  // null until the deployed manifest includes siege_dojo-matchmaking
  matchmaking: string | null;
```

Below `findContract`, add:

```ts
function findContractOptional(manifest: DojoManifest, tag: string): string | null {
  return manifest.contracts.find((c) => c.tag === tag)?.address ?? null;
}
```

In `loadConfig`'s `contracts` object add:

```ts
    matchmaking: findContractOptional(manifest, "siege_dojo-matchmaking"),
```

(`findContract` throws on a missing tag — using it here would kill MCP startup
on every pre-migrate manifest, which is why the optional variant exists.)

- [ ] **Step 2: `policies.ts` — session coverage**

In `buildPolicies`, after the `policies` object literal is built (before `if (abilityTokenAddress)`), add:

```ts
  if (contracts.matchmaking) {
    policies.contracts[contracts.matchmaking] = {
      methods: [
        m("queue_for_match", "Join the matchmaking queue, poke the heartbeat, or get paired"),
        m("leave_queue", "Leave the matchmaking queue"),
        ...DOJO_METHODS,
      ],
    };
  }
```

- [ ] **Step 3: `state.ts` — QueueStatus query**

With the other interfaces add:

```ts
export interface QueueStatusData {
  state: number; // 0 idle, 1 queued, 2 matched
  queued_at: number;
  matched_match_id: number;
}
```

In `StateClient` (near `findLatestMatchForPlayers`, reusing its address-normalization shape):

```ts
  async queueStatus(player: string): Promise<QueueStatusData | null> {
    const norm = "0x" + player.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT state, queued_at, matched_match_id FROM "siege_dojo-QueueStatus" WHERE player = '${norm}' LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      state: toNum(row.state),
      queued_at: toNum(row.queued_at),
      matched_match_id: toNum(row.matched_match_id),
    };
  }
```

- [ ] **Step 4: `tools.ts` — three tools**

Add immediately after the `siege_create_match` registration (ends `tools.ts:1597`). Shared helper first (place above the `register(` calls, near other helpers in `registerSiegeTools` scope):

```ts
  const requireMatchmaking = (ctx: { config: { contracts: { matchmaking: string | null } } }): string => {
    const addr = ctx.config.contracts.matchmaking;
    if (!addr) {
      throw new Error(
        "matchmaking contract not found in manifest — not deployed on this network yet",
      );
    }
    return addr;
  };
```

```ts
  register(
    "siege_queue_for_match",
    {
      description:
        "Join the 1v1 matchmaking queue (practice rules, no stakes). Submits vRNG request_random + matchmaking.queue_for_match. If another player is already waiting, THIS tx creates the match and the result includes match_id. Otherwise you are enqueued: re-call this tool every ~60 seconds as a heartbeat (entries go stale after 120s) and poll siege_queue_status until state=matched. Requires a registered Hold.",
      inputSchema: {},
      requiresSigner: true,
    },
    async (_args, ctx) => {
      const mm = requireMatchmaking(ctx);
      const tx = await execute(ctx.signer!, [
        vrfRequestRandom(ctx.config.vrfAddress, mm),
        call(mm, "queue_for_match", []),
      ]);
      // Give Torii a moment, then report where we landed.
      if (ctx.agentAddress) {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const status = await ctx.state.queueStatus(ctx.agentAddress).catch(() => null);
          if (status?.state === 2) {
            ctx.watchMatch(status.matched_match_id);
            return { tx_hash: tx, result: "matched", match_id: status.matched_match_id };
          }
          if (status?.state === 1) {
            return {
              tx_hash: tx,
              result: "queued",
              guidance: "Re-call siege_queue_for_match every ~60s (heartbeat) and poll siege_queue_status for state=matched.",
            };
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      return { tx_hash: tx, result: "submitted", warning: "QueueStatus not yet indexed by Torii — poll siege_queue_status" };
    },
  );

  register(
    "siege_leave_queue",
    {
      description: "Leave the 1v1 matchmaking queue. Safe to call when not queued.",
      inputSchema: {},
      requiresSigner: true,
    },
    async (_args, ctx) => {
      const mm = requireMatchmaking(ctx);
      const tx = await execute(ctx.signer!, [call(mm, "leave_queue", [])]);
      return { tx_hash: tx };
    },
  );

  register(
    "siege_queue_status",
    {
      description:
        "Read a player's matchmaking QueueStatus (state: 0 idle / 1 queued / 2 matched, matched_match_id). Defaults to the signing account.",
      inputSchema: {
        player: z.string().min(3).optional().describe("Address to check; defaults to the agent account"),
      },
      requiresSigner: false,
    },
    async ({ player }, ctx) => {
      const addr = player ?? ctx.agentAddress;
      if (!addr) throw new Error("No player address given and agent not yet authenticated");
      const status = await ctx.state.queueStatus(addr);
      if (!status) return { player: addr, state: "idle", note: "no QueueStatus row — never queued" };
      const label = status.state === 2 ? "matched" : status.state === 1 ? "queued" : "idle";
      return { player: addr, state: label, ...status };
    },
  );
```

- [ ] **Step 5: Build + test**

Run: `cd mcp-server-2 && pnpm run build && pnpm run test`
Expected: build clean, all tests pass. If a policies test snapshot asserts the exact contract set, update it to include matchmaking-when-present.

- [ ] **Step 6: Commit**

```bash
git add mcp-server-2/src/config.ts mcp-server-2/src/policies.ts mcp-server-2/src/state.ts mcp-server-2/src/tools.ts
git commit -m "feat: MCP matchmaking tools — queue, leave, status"
```

---

### Task 7: Docs + final sweep

**Files:**
- Modify: `CLAUDE.md` (active systems + a short matchmaking paragraph)

- [ ] **Step 1: Update CLAUDE.md**

In "Active systems" add `matchmaking` to the 1v1 line:

```markdown
- 1v1 commit-reveal battles: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`, `matchmaking`.
```

After the "Core Battle Rules" section's budget paragraph, add:

```markdown
Matchmaking (unstaked only): `matchmaking.queue_for_match` is a single-slot
queue — poke if already head, enqueue if the slot is empty/stale (120 s
heartbeat window, clients re-poke every 60 s), otherwise pair with the waiting
player via `create_match_1v1_delegated` (waiting player = player_a). Clients
always send the `[vrf request_random, queue_for_match]` multicall (the
contract consumes unconditionally); `leave_queue` is always bare. Pairing is
discovered by polling the `QueueStatus` model. Not yet migrated/deployed.
```

- [ ] **Step 2: Full verification sweep**

```bash
docker compose run --rm builder sozo test
cd frontend && bun run lint && bun run test && bun run build
cd ../mcp-server-2 && pnpm run build && pnpm run test
```

Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: matchmaking system notes in CLAUDE.md"
```
