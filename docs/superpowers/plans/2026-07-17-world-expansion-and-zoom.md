# World Expansion + Map Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operator-gated `expand_world` entrypoint so the live mainnet world can grow in place from 8×4 to 12×8 (and beyond), plus wheel/drag/pinch zoom-pan on the frontend hex map.

**Architecture:** New entrypoint on `world_system` derives current grid bounds by scanning existing parcels (grid is always a full rectangle) and appends missing cells. A network-aware script calls it. Frontend zoom is pure-function SVG viewBox math (`mapView.ts`) wired into `HexGrid.tsx` — no new dependencies.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0 (sozo via Docker builder), starknet.js 8.9.2 scripts run with `bun x tsx`, Next 16 / React 19 frontend, vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-world-expansion-and-zoom-design.md`

## Global Constraints

- Run sozo ONLY through Docker: `docker compose run --rm builder sozo build` / `sozo test`. Local sozo is too old.
- Frontend uses `BigInt(0)` style, never `0n`.
- `react-hooks/set-state-in-effect` lint is strict: no synchronous setState in a useEffect body. The plan's code avoids it by design (lazy `view ?? fitBox` state); keep it that way.
- Auth check for admin entrypoints is `world.dispatcher.is_owner(world.namespace_hash, get_caller_address())` with error `'Not world owner'` — same as `initialize_world`. There is no separate operator model.
- Grid rectangle invariant: `initialize_world` (as used by all init scripts) and `expand_world` both produce full rectangles. `expand_world` relies on this.
- Do not touch `frontend/src/bindings/typescript/*.gen.ts` (generated).
- Commits: author `ModeofO <modeofO@users.noreply.github.com>`, trailer `Co-authored-by: Claude <noreply@anthropic.com>`.
- No mainnet transactions without explicit user confirmation (Task 5 only).

---

### Task 1: `expand_world` entrypoint (Cairo, TDD)

**Files:**
- Modify: `src/systems/world_system.cairo` (interface at line ~5, impl after `initialize_world` which ends at line ~216)
- Create: `src/tests/test_expand_world.cairo`
- Modify: `src/lib.cairo:57` area (register test module)

**Interfaces:**
- Consumes: existing `Parcel`, `WorldConfig` models; `initialize_world` pattern at `src/systems/world_system.cairo:182-216`.
- Produces: `fn expand_world(ref self: T, new_cols: u16, new_rows: u16)` on `IWorldSystem` — Task 2's script and Task 5's runbook call this entrypoint with two felts calldata.

- [ ] **Step 1: Register the new test module**

In `src/lib.cairo`, inside `pub mod tests { ... }` (line 45), after `pub mod test_world;` add:

```cairo
    pub mod test_expand_world;
```

- [ ] **Step 2: Write failing tests**

Create `src/tests/test_expand_world.cairo`. The setup mirrors `src/tests/test_world.cairo` (same namespace_def / contract_defs — copy them exactly; they are proven to sync perms correctly). Full file:

```cairo
#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use starknet::SyscallResultTrait;

    use siege_dojo::systems::world_system::{world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait};
    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::models::player_cosmetics::{PlayerCosmetics, m_PlayerCosmetics};
    use siege_dojo::tokens::ability_token::{
        AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait,
    };

    use crate::tests::test_world::MockAccount;

    fn deploy_ability_token(admin: starknet::ContractAddress) -> IAbilityTokenDispatcher {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            calldata.span(),
            false,
        )
            .unwrap_syscall();
        IAbilityTokenDispatcher { contract_address: addr }
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            array![].span(),
            false,
        )
            .unwrap_syscall();
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
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerCosmetics::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ]
            .span()
    }

    fn setup() -> (dojo::world::WorldStorage, IWorldSystemDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        let ws = IWorldSystemDispatcher { contract_address: ws_addr };
        (world, ws)
    }

    // Init a full 2x2 rectangle: ids 0..3, row-major.
    fn init_2x2(ws: IWorldSystemDispatcher) {
        ws.initialize_world(
            array![0_u16, 1_u16, 0_u16, 1_u16],
            array![0_u16, 0_u16, 1_u16, 1_u16],
        );
    }

    #[test]
    fn test_expand_appends_missing_cells() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        ws.expand_world(3_u16, 3_u16);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 9, 'total should be 9');
        assert(config.next_parcel_id == 9, 'next_id should be 9');

        // New parcels (ids 4..8) are untyped, unowned, not home.
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        let mut i: u32 = 4;
        while i < 9 {
            let p: Parcel = world.read_model(i);
            assert(p.parcel_type == 255, 'new parcel should be untyped');
            assert(p.owner == zero_addr, 'new parcel should be unowned');
            assert(!p.is_home, 'new parcel not home');
            assert(p.col < 3 && p.row < 3, 'cell out of bounds');
            // Every appended cell is OUTSIDE the old 2x2 rectangle.
            assert(p.col >= 2 || p.row >= 2, 'cell overlaps old grid');
            i += 1;
        };
    }

    #[test]
    fn test_expand_preserves_existing_parcels() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        // Claim parcel 1 directly (simulates a live owner).
        let owner_addr: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
        let mut p1: Parcel = world.read_model(1_u32);
        p1.owner = owner_addr;
        p1.parcel_type = 2;
        p1.is_home = true;
        world.write_model_test(@p1);

        ws.expand_world(4_u16, 4_u16);

        let p1_after: Parcel = world.read_model(1_u32);
        assert(p1_after.owner == owner_addr, 'owner must survive expand');
        assert(p1_after.parcel_type == 2, 'type must survive expand');
        assert(p1_after.is_home, 'is_home must survive expand');
        assert(p1_after.col == 1 && p1_after.row == 0, 'position must survive');
    }

    #[test]
    fn test_multiple_incremental_expands() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        ws.expand_world(3_u16, 3_u16);
        ws.expand_world(4_u16, 4_u16);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 16, 'total should be 16');
        assert(config.next_parcel_id == 16, 'next_id should be 16');

        // All 16 cells of the 4x4 rectangle exist exactly once: check via
        // per-cell hit count over all parcel ids.
        let mut found: Felt252Dict<bool> = Default::default();
        let mut i: u32 = 0;
        while i < 16 {
            let p: Parcel = world.read_model(i);
            let cell_key: felt252 = (p.col.into() * 100 + p.row.into());
            assert(!found.get(cell_key), 'duplicate cell');
            found.insert(cell_key, true);
            assert(p.col < 4 && p.row < 4, 'cell out of 4x4');
            i += 1;
        };
    }

    #[test]
    #[should_panic(expected: ('Not world owner', 'ENTRYPOINT_FAILED'))]
    fn test_expand_non_owner_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        let rando = deploy_user();
        starknet::testing::set_contract_address(rando);
        ws.expand_world(3_u16, 3_u16);
    }

    #[test]
    #[should_panic(expected: ('Cannot shrink world', 'ENTRYPOINT_FAILED'))]
    fn test_expand_shrink_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        ws.expand_world(1_u16, 3_u16);
    }

    #[test]
    #[should_panic(expected: ('No growth', 'ENTRYPOINT_FAILED'))]
    fn test_expand_noop_reverts() {
        let (_world, ws) = setup();
        init_2x2(ws);
        ws.expand_world(2_u16, 2_u16);
    }

    #[test]
    #[should_panic(expected: ('World not initialized', 'ENTRYPOINT_FAILED'))]
    fn test_expand_before_init_reverts() {
        let (_world, ws) = setup();
        ws.expand_world(3_u16, 3_u16);
    }

    #[test]
    fn test_register_after_expand_uses_new_parcels() {
        let (mut world, ws) = setup();
        init_2x2(ws);

        // Ability token wiring (register_player mints starter abilities).
        let admin: starknet::ContractAddress = 0xADAD.try_into().unwrap();
        let ability_token = deploy_ability_token(admin);
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(ws_addr);
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token.contract_address;
        world.write_model_test(@rc);

        // Player A takes 3 of the 4 original parcels.
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        // Expand as the default (owner) caller.
        let owner: starknet::ContractAddress = 0.try_into().unwrap();
        starknet::testing::set_contract_address(owner);
        ws.expand_world(4_u16, 4_u16);

        // Player B can now register; only 1 original parcel was free, so at
        // least 2 of B's homes must be appended parcels (id >= 4).
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        ws.register_player(array![0_u8, 1_u8, 2_u8]);

        let kb: PlayerKingdom = world.read_model(player_b);
        assert(kb.registered, 'B should be registered');
        assert(kb.parcel_count == 3, 'B parcel_count should be 3');
        let mut on_new: u32 = 0;
        if kb.home_0 >= 4 { on_new += 1; }
        if kb.home_1 >= 4 { on_new += 1; }
        if kb.home_2 >= 4 { on_new += 1; }
        assert(on_new >= 2, 'B homes should use new parcels');
        let hb: Parcel = world.read_model(kb.home_0);
        assert(hb.owner == player_b, 'B home_0 owner wrong');
    }
}
```

Note: `use crate::tests::test_world::MockAccount;` — if the compiler rejects this path (module visibility), copy the 20-line `MockAccount` contract block from `src/tests/test_world.cairo:29-48` to the top of this file (outside `mod tests`) and `use super::MockAccount;` instead. `Felt252Dict<bool>` requires `use core::dict::Felt252DictTrait;` if not in prelude — add it if the build complains.

- [ ] **Step 3: Run tests, verify they fail to compile (no `expand_world`)**

Run: `docker compose run --rm builder sozo test`
Expected: compile error — `expand_world` not a member of `IWorldSystemDispatcher`.

- [ ] **Step 4: Add interface entry**

In `src/systems/world_system.cairo` line 5, after `initialize_world`:

```cairo
    fn expand_world(ref self: T, new_cols: u16, new_rows: u16);
```

- [ ] **Step 5: Implement `expand_world`**

In `src/systems/world_system.cairo`, immediately after the `initialize_world` function body (ends line ~216), inside `WorldSystemImpl`:

```cairo
        fn expand_world(ref self: ContractState, new_cols: u16, new_rows: u16) {
            let mut world = self.world_default();
            assert(
                world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
                'Not world owner',
            );
            let config: WorldConfig = world.read_model(0_u8);
            assert(config.initialized, 'World not initialized');

            // The grid is always a full rectangle (init scripts and this
            // entrypoint both maintain that), so current bounds are the max
            // col/row over existing parcels plus one.
            let mut cur_cols: u16 = 0;
            let mut cur_rows: u16 = 0;
            let mut i: u32 = 0;
            while i < config.total_parcels {
                let p: Parcel = world.read_model(i);
                if p.col + 1 > cur_cols {
                    cur_cols = p.col + 1;
                }
                if p.row + 1 > cur_rows {
                    cur_rows = p.row + 1;
                }
                i += 1;
            };

            assert(new_cols >= cur_cols && new_rows >= cur_rows, 'Cannot shrink world');
            assert(new_cols > cur_cols || new_rows > cur_rows, 'No growth');

            let mut next_id: u32 = config.next_parcel_id;
            let mut row: u16 = 0;
            while row < new_rows {
                let mut col: u16 = 0;
                while col < new_cols {
                    if col >= cur_cols || row >= cur_rows {
                        world.write_model(@Parcel {
                            parcel_id: next_id,
                            col,
                            row,
                            parcel_type: 255,
                            owner: 0.try_into().unwrap(),
                            is_home: false,
                        });
                        next_id += 1;
                    }
                    col += 1;
                };
                row += 1;
            };

            world.write_model(@WorldConfig {
                id: 0,
                total_parcels: next_id,
                next_parcel_id: next_id,
                initialized: true,
            });
        }
```

- [ ] **Step 6: Run full test suite, verify pass**

Run: `docker compose run --rm builder sozo test`
Expected: all tests pass, including the 8 new `test_expand_*` / `test_register_after_expand*` tests and all ~172 pre-existing tests.

- [ ] **Step 7: Commit**

```bash
git add src/systems/world_system.cairo src/tests/test_expand_world.cairo src/lib.cairo
git commit -m "feat: expand_world entrypoint for in-place grid growth" -m "Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 2: Expansion script + init dimension bumps

**Files:**
- Create: `scripts/expand-world.ts`
- Modify: `scripts/init-mainnet-world.ts:61-62` (`GRID_W`/`GRID_H`)
- Modify: `scripts/init-katana-world.ts:31-32` (`GRID_W`/`GRID_H`)
- Modify: `scripts/init-hex-world.sh:26-27` (`GRID_W`/`GRID_H`)

**Interfaces:**
- Consumes: `expand_world(new_cols: u16, new_rows: u16)` from Task 1; manifest tag `siege_dojo-world_system`.
- Produces: CLI `bun x tsx scripts/expand-world.ts <new_cols> <new_rows>` driven by env `RPC_URL`, `MANIFEST_PATH`, `DOJO_ACCOUNT_ADDRESS`, `DOJO_PRIVATE_KEY`. Task 5 runs it.

- [ ] **Step 1: Write `scripts/expand-world.ts`**

```typescript
// Grow the live hex world in place via world_system.expand_world.
//
// Network-aware: point MANIFEST_PATH + RPC_URL at the target network.
// Mainnet needs a v0_9 RPC (starknet.js 8.9.x speaks spec 0.9.0 only —
// Cartridge's mainnet RPC serves 0.10.2; use the Alchemy v0_9 endpoint,
// same as init-mainnet-world.ts).
//
// Usage:
//   source deploy.mainnet.env && \
//   RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo" \
//   MANIFEST_PATH=manifest_mainnet.json \
//   bun x tsx scripts/expand-world.ts 12 8
//
// Grow in steps (e.g. 96 -> 160 -> 300); one call appends
// new_cols*new_rows - cur_cols*cur_rows parcels in a single transaction.

import { Account, RpcProvider } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://siege-katana-production.up.railway.app";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  throw new Error("Set DOJO_ACCOUNT_ADDRESS / DOJO_PRIVATE_KEY (source deploy env first)");
}

const [colsArg, rowsArg] = process.argv.slice(2);
const newCols = Number(colsArg);
const newRows = Number(rowsArg);
if (!Number.isInteger(newCols) || !Number.isInteger(newRows) || newCols <= 0 || newRows <= 0) {
  throw new Error("Usage: bun x tsx scripts/expand-world.ts <new_cols> <new_rows>");
}

type Manifest = { contracts: { address: string; tag: string }[] };

async function main() {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const ws = manifest.contracts.find((c) => c.tag === "siege_dojo-world_system");
  if (!ws) throw new Error(`Missing siege_dojo-world_system in ${MANIFEST_PATH}`);

  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account(provider, ACCOUNT_ADDRESS, PRIVATE_KEY);

  console.log(`expand_world(${newCols}, ${newRows}) on ${ws.address} via ${RPC}`);
  const { transaction_hash } = await account.execute([
    {
      contractAddress: ws.address,
      entrypoint: "expand_world",
      calldata: [newCols.toString(), newRows.toString()],
    },
  ]);
  console.log(`tx: ${transaction_hash}`);
  await provider.waitForTransaction(transaction_hash);
  console.log("expand_world confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Bump grid dims in the three init scripts**

- `scripts/init-mainnet-world.ts:61-62`: `const GRID_W = 8;` → `const GRID_W = 12;`, `const GRID_H = 4;` → `const GRID_H = 8;`
- `scripts/init-katana-world.ts:31-32`: same change.
- `scripts/init-hex-world.sh:26-27`: `GRID_W=8` → `GRID_W=12`, `GRID_H=4` → `GRID_H=8`.

- [ ] **Step 3: Verify the script parses and fails cleanly without creds**

Run: `cd /Users/modeofo/Apps/siege && bun x tsx scripts/expand-world.ts 12 8`
Expected: throws `Set DOJO_ACCOUNT_ADDRESS / DOJO_PRIVATE_KEY (source deploy env first)` (env unset). No other output. This proves syntax + arg parsing without touching a network.

- [ ] **Step 4: Commit**

```bash
git add scripts/expand-world.ts scripts/init-mainnet-world.ts scripts/init-katana-world.ts scripts/init-hex-world.sh
git commit -m "feat: expand-world script; init grids start at 12x8" -m "Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: viewBox math module (frontend, TDD)

**Files:**
- Create: `frontend/src/lib/mapView.ts`
- Test: `frontend/src/lib/__tests__/mapView.test.ts`

**Interfaces:**
- Consumes: nothing project-specific (pure math).
- Produces (Task 4 imports these exact signatures):
  - `interface Box { x: number; y: number; w: number; h: number }`
  - `computeFitBox(points: { x: number; y: number }[], padding: number): Box`
  - `zoomAt(view: Box, fit: Box, factor: number, anchor: { x: number; y: number }): Box`
  - `pan(view: Box, fit: Box, dx: number, dy: number): Box`
  - `clampView(view: Box, fit: Box): Box`
  - `clientToView(view: Box, rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): { x: number; y: number }`
  - `boxToViewBox(b: Box): string`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/mapView.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeFitBox,
  zoomAt,
  pan,
  clampView,
  clientToView,
  boxToViewBox,
  type Box,
} from "../mapView";

const FIT: Box = { x: 0, y: 0, w: 400, h: 200 };

describe("computeFitBox", () => {
  it("bounds the points plus padding", () => {
    const box = computeFitBox(
      [
        { x: 10, y: 20 },
        { x: 110, y: 80 },
      ],
      5,
    );
    expect(box).toEqual({ x: 5, y: 15, w: 110, h: 70 });
  });
});

describe("zoomAt", () => {
  it("zooming in shrinks the view and keeps the anchor fixed", () => {
    const anchor = { x: 100, y: 50 };
    const v = zoomAt(FIT, FIT, 2, anchor);
    expect(v.w).toBeCloseTo(200);
    expect(v.h).toBeCloseTo(100);
    // Anchor stays at the same relative position: it was at 25% width from
    // the left; after zoom it must still map to the same world point.
    expect((anchor.x - v.x) / v.w).toBeCloseTo((anchor.x - FIT.x) / FIT.w);
    expect((anchor.y - v.y) / v.h).toBeCloseTo((anchor.y - FIT.y) / FIT.h);
  });

  it("clamps zoom-in at 4x fit scale", () => {
    let v: Box = { ...FIT };
    for (let i = 0; i < 20; i += 1) v = zoomAt(v, FIT, 2, { x: 200, y: 100 });
    expect(v.w).toBeCloseTo(FIT.w / 4);
  });

  it("clamps zoom-out at 0.5x fit scale", () => {
    let v: Box = { ...FIT };
    for (let i = 0; i < 20; i += 1) v = zoomAt(v, FIT, 0.5, { x: 200, y: 100 });
    expect(v.w).toBeCloseTo(FIT.w * 2);
  });
});

describe("pan / clampView", () => {
  it("pans by the given delta", () => {
    const zoomed = zoomAt(FIT, FIT, 2, { x: 200, y: 100 });
    const moved = pan(zoomed, FIT, 10, -5);
    expect(moved.x).toBeCloseTo(zoomed.x + 10);
    expect(moved.y).toBeCloseTo(zoomed.y - 5);
  });

  it("never lets the view centre leave the fit extent", () => {
    const zoomed = zoomAt(FIT, FIT, 4, { x: 0, y: 0 });
    const flung = pan(zoomed, FIT, -100000, -100000);
    expect(flung.x + flung.w / 2).toBeGreaterThanOrEqual(FIT.x);
    expect(flung.y + flung.h / 2).toBeGreaterThanOrEqual(FIT.y);
    const flungRight = pan(zoomed, FIT, 100000, 100000);
    expect(flungRight.x + flungRight.w / 2).toBeLessThanOrEqual(FIT.x + FIT.w);
    expect(flungRight.y + flungRight.h / 2).toBeLessThanOrEqual(FIT.y + FIT.h);
  });

  it("clampView preserves dimensions", () => {
    const clamped = clampView({ x: -9999, y: -9999, w: 100, h: 50 }, FIT);
    expect(clamped.w).toBe(100);
    expect(clamped.h).toBe(50);
  });
});

describe("clientToView", () => {
  it("maps the element centre to the view centre (aspect match)", () => {
    const rect = { left: 0, top: 0, width: 800, height: 400 };
    const p = clientToView(FIT, rect, 400, 200);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(100);
  });

  it("accounts for xMidYMid meet letterboxing on a wide element", () => {
    // Element 800x200 showing a 400x200 view: scale = max(400/800, 200/200)
    // = 1, content occupies the central 400px horizontally (200px offset).
    const rect = { left: 0, top: 0, width: 800, height: 200 };
    const atContentLeft = clientToView(FIT, rect, 200, 0);
    expect(atContentLeft.x).toBeCloseTo(0);
    const atContentRight = clientToView(FIT, rect, 600, 200);
    expect(atContentRight.x).toBeCloseTo(400);
  });
});

describe("boxToViewBox", () => {
  it("formats as 'x y w h'", () => {
    expect(boxToViewBox({ x: 1, y: 2, w: 3, h: 4 })).toBe("1 2 3 4");
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd frontend && bun run test -- src/lib/__tests__/mapView.test.ts`
Expected: FAIL — cannot resolve `../mapView`.

- [ ] **Step 3: Implement `frontend/src/lib/mapView.ts`**

```typescript
// Pure SVG viewBox math for the world map's zoom/pan. No DOM access — every
// function takes plain numbers so it is unit-testable.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Zoom scale is defined relative to the fit ("show everything") view:
// scale = fit.w / view.w. 1 = fit exactly, 4 = 4x magnification.
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

export function computeFitBox(points: { x: number; y: number }[], padding: number): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Keep the view centre inside the world extent so the map can never be
// panned fully out of sight. Dimensions are preserved.
export function clampView(view: Box, fit: Box): Box {
  const cx = Math.min(Math.max(view.x + view.w / 2, fit.x), fit.x + fit.w);
  const cy = Math.min(Math.max(view.y + view.h / 2, fit.y), fit.y + fit.h);
  return { x: cx - view.w / 2, y: cy - view.h / 2, w: view.w, h: view.h };
}

// factor > 1 zooms in. The world point under `anchor` stays put.
export function zoomAt(view: Box, fit: Box, factor: number, anchor: { x: number; y: number }): Box {
  const w = Math.min(Math.max(view.w / factor, fit.w / MAX_SCALE), fit.w / MIN_SCALE);
  const ratio = w / view.w;
  return clampView(
    {
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
      w,
      h: view.h * ratio,
    },
    fit,
  );
}

export function pan(view: Box, fit: Box, dx: number, dy: number): Box {
  return clampView({ x: view.x + dx, y: view.y + dy, w: view.w, h: view.h }, fit);
}

// Client (CSS pixel) coordinates -> viewBox coordinates for an <svg> with the
// default preserveAspectRatio="xMidYMid meet": content is uniformly scaled to
// fit and centred, so account for the letterbox offset.
export function clientToView(
  view: Box,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const scale = Math.max(view.w / rect.width, view.h / rect.height);
  const offX = (rect.width - view.w / scale) / 2;
  const offY = (rect.height - view.h / scale) / 2;
  return {
    x: view.x + (clientX - rect.left - offX) * scale,
    y: view.y + (clientY - rect.top - offY) * scale,
  };
}

export function boxToViewBox(b: Box): string {
  return `${b.x} ${b.y} ${b.w} ${b.h}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd frontend && bun run test -- src/lib/__tests__/mapView.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mapView.ts frontend/src/lib/__tests__/mapView.test.ts
git commit -m "feat: pure viewBox math for world map zoom/pan" -m "Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 4: Wire zoom/pan into HexGrid

**Files:**
- Modify: `frontend/src/components/HexGrid.tsx`

**Interfaces:**
- Consumes: everything Task 3 produces (`Box`, `computeFitBox`, `zoomAt`, `pan`, `clientToView`, `boxToViewBox`).
- Produces: no API change — `HexGridProps` is untouched. Behavior added: wheel zoom (cursor-anchored), pointer-drag pan, two-pointer pinch, fit button, drag-suppressed click selection.

Implementation notes (constraints, not options):

- **Wheel:** React 17+ attaches root wheel listeners passively, so `e.preventDefault()` in `onWheel` is ignored and the page scrolls. Attach a native non-passive listener in a `useEffect` on the svg ref.
- **Lint:** no setState inside useEffect bodies (`react-hooks/set-state-in-effect` fires on any synchronous one). The design needs none: view state is `Box | null`, `null` meaning "fit"; render uses `view ?? fitBox`. The fit button sets `null`. Never mirror `fitBox` into state.
- **Pinch/drag:** pointer events with `setPointerCapture`; track live pointers in a `useRef<Map<number, { x: number; y: number }>>`. One pointer = drag pan, two = pinch (factor = new distance / old distance, anchor = midpoint via `clientToView`).
- **Click suppression:** a `draggedRef` set true once cumulative movement exceeds 4px; `selectParcel` returns early when it is true (reset on pointer down).
- **Touch:** `style={{ touchAction: "none" }}` on the svg so the browser doesn't hijack pinch/drag.
- Existing tooltip, selection, cosmetics rendering unchanged.

- [ ] **Step 1: Apply the HexGrid changes**

In `frontend/src/components/HexGrid.tsx`:

Replace the import line `import { useState } from "react";` with:

```typescript
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
```

Add after the existing `hexRender` import:

```typescript
import {
  computeFitBox,
  zoomAt,
  pan,
  clientToView,
  boxToViewBox,
  type Box,
} from "@/lib/mapView";
```

Inside the component, replace the block computing `positions`/`padding`/`minX`..`viewBox` (currently after the `if (parcels.length === 0) return null;` guard, lines 101-109) with:

```typescript
  const fitBox = useMemo(() => {
    const positions = parcels.map((p) => hexToPixel(p.col, p.row));
    return computeFitBox(positions, HEX_SIZE * 2);
  }, [parcels]);

  const [view, setView] = useState<Box | null>(null);
  const activeView = view ?? fitBox;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const draggedRef = useRef(false);
  const fitRef = useRef(fitBox);
  fitRef.current = fitBox;

  // React's root-level wheel listener is passive, so preventDefault via
  // onWheel is ignored — attach a native non-passive listener instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.002);
      setView((v) => {
        const cur = v ?? fitRef.current;
        const anchor = clientToView(cur, rect, e.clientX, e.clientY);
        return zoomAt(cur, fitRef.current, factor, anchor);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) draggedRef.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pointers = pointersRef.current;

    if (pointers.size === 1) {
      const dxPx = e.clientX - prev.x;
      const dyPx = e.clientY - prev.y;
      if (Math.abs(dxPx) + Math.abs(dyPx) > 4) draggedRef.current = true;
      setView((v) => {
        const cur = v ?? fitRef.current;
        const scale = Math.max(cur.w / rect.width, cur.h / rect.height);
        return pan(cur, fitRef.current, -dxPx * scale, -dyPx * scale);
      });
    } else if (pointers.size === 2) {
      draggedRef.current = true;
      const [a, b] = [...pointers.entries()].map(([id, p]) =>
        id === e.pointerId ? { x: e.clientX, y: e.clientY } : p,
      );
      const [pa, pb] = [...pointers.values()];
      const prevDist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const newDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (prevDist > 0 && newDist > 0) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        setView((v) => {
          const cur = v ?? fitRef.current;
          const anchor = clientToView(cur, rect, midX, midY);
          return zoomAt(cur, fitRef.current, newDist / prevDist, anchor);
        });
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, []);

  const onPointerEnd = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
  }, []);
```

Change `selectParcel` to suppress drag-clicks:

```typescript
  const selectParcel = (parcel: ParcelData) => {
    if (draggedRef.current) return;
    const next = selectedParcel?.parcelId === parcel.parcelId ? null : parcel;
    if (onSelectParcel) onSelectParcel(next);
    else setInternalSelected(next);
  };
```

(`selectParcel` is currently declared before the `parcels.length === 0` guard; move it below the new hook block so `draggedRef` exists — or move the guard below the hooks. Hooks must not be behind the early return: put ALL hooks first, then the `if (parcels.length === 0) return null;` guard, then `selectParcel`.)

Replace the `<svg ...>` opening tag with:

```tsx
      <svg
        ref={svgRef}
        viewBox={boxToViewBox(activeView)}
        className="w-full max-h-[60vh]"
        style={{ background: "transparent", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
```

Add a fit button inside the outer `<div className="relative">`, right after the closing `</svg>`:

```tsx
      {view && (
        <button
          type="button"
          onClick={() => setView(null)}
          className="absolute top-2 left-2 bg-[#1a1714] border border-[#3d3428] rounded px-2 py-1 text-xs text-[#d4cfc6] hover:border-[#daa520]"
        >
          ⌖ Fit
        </button>
      )}
```

`hexToPixel` and `HEX_SIZE` are already imported from `@/lib/hexRender`.

- [ ] **Step 2: Lint + tests + build**

Run: `cd frontend && bun run lint && bun run test && bun run build`
Expected: lint clean (watch for `react-hooks/set-state-in-effect` and hooks-after-early-return violations — both are ordering bugs, fix by moving code, not by disabling rules), all vitest suites pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HexGrid.tsx
git commit -m "feat: wheel/drag/pinch zoom-pan on world hex map" -m "Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 5: Deploy + expand mainnet and katana (USER CONFIRMATION REQUIRED)

**Files:** none (operational task; `manifest_mainnet.json` / `manifest_katana.json` get regenerated by migrate).

**Interfaces:**
- Consumes: Task 1's deployed `expand_world`, Task 2's script.
- Produces: mainnet world at 12×8 = 96 parcels; katana dev world matching.

**STOP: get explicit user confirmation before any mainnet transaction in this task.**

- [ ] **Step 1: Build + full test suite**

```bash
docker compose run --rm builder sozo build -P mainnet
docker compose run --rm builder sozo test
```
Expected: build OK, all tests pass.

- [ ] **Step 2 (after user confirms): migrate mainnet**

```bash
source deploy.mainnet.env
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY \
  builder sozo -P mainnet migrate --use-blake2s-casm-class-hash
```
Expected: `world_system` upgraded in place (same address as `manifest_mainnet.json`). Writer grants persist across class upgrades — verify with the auth list if unsure; re-run the `auth grant writer` block from CLAUDE.md's mainnet section only if migrate output shows grants missing.

- [ ] **Step 3: Expand mainnet to 12×8**

```bash
source deploy.mainnet.env
RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo" \
  MANIFEST_PATH=manifest_mainnet.json \
  bun x tsx scripts/expand-world.ts 12 8
```
Expected: tx confirmed.

- [ ] **Step 4: Verify via Torii**

```bash
curl -s "https://siege-torii-mainnet-production.up.railway.app/sql?query=SELECT%20COUNT(*)%20FROM%20%22siege_dojo-Parcel%22"
```
Expected: 96 (allow a minute for indexing). Also verify the 2 existing players' 6 owned parcels are unchanged:

```bash
curl -s "https://siege-torii-mainnet-production.up.railway.app/sql?query=SELECT%20COUNT(*)%20as%20owned%20FROM%20%22siege_dojo-Parcel%22%20WHERE%20owner%20!=%20%270x0000000000000000000000000000000000000000000000000000000000000000%27"
```
Expected: 6.

- [ ] **Step 5: Katana dev environment**

```bash
docker compose run --rm builder sozo build -P katana
docker compose run --rm builder sozo -P katana migrate
MANIFEST_PATH=manifest_katana.json bun x tsx scripts/expand-world.ts 12 8
```
(Deployer on katana is dev account 0 with keys inline in `dojo_katana.toml` — export those as `DOJO_ACCOUNT_ADDRESS`/`DOJO_PRIVATE_KEY` for the script; katana's default `RPC_URL` in the script is already correct.)

- [ ] **Step 6: Commit regenerated manifests + push (frontend deploys via Vercel on push)**

```bash
git add manifest_mainnet.json manifest_katana.json
git commit -m "chore: manifests after expand_world migration" -m "Co-authored-by: Claude <noreply@anthropic.com>"
git push
```

---

## Adversarial Review Protocol (execution requirement)

After Tasks 1-4 are implemented, dispatch TWO independent reviewer subagents on **Opus 4.8** (`model: opus`). Both must be prompted to ASSUME THE CODE IS WRONG and hunt for defects, not to confirm correctness. Both run the real test suites themselves (`docker compose run --rm builder sozo test`; `cd frontend && bun run lint && bun run test && bun run build`) and debug anything suspicious.

- **Reviewer A — contracts + scripts (Tasks 1-2):** hunt for: rectangle-invariant violations, off-by-one in bounds derivation (`max col+1`), `next_parcel_id` drift vs `total_parcels`, overflow on `p.col + 1` at u16 max, expand interacting badly with `register_player` / `conquest` / `settle_match` scans (ids beyond old bounds), auth bypass, calldata encoding in `expand-world.ts`, wrong manifest tag/RPC assumptions.
- **Reviewer B — frontend (Tasks 3-4):** hunt for: anchor drift in zoom math, letterbox mapping errors (`xMidYMid meet`), clamp edge cases (view larger than fit, zero-size rect, single-parcel world), pinch pointer bookkeeping bugs (stale Map entries, pointerId reuse, the `[a, b]` destructure ordering vs `[pa, pb]`), passive wheel regressions, hooks-order/lint violations, drag-suppression breaking normal parcel selection, tooltip/selection regressions.

Findings go back to implementation subagents to fix; re-run both reviewers on the fixes until both come back clean. Task 5 (deployment) only starts after both reviewers pass AND the user confirms mainnet.
