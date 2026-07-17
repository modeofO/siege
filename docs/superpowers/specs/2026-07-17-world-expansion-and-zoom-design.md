# World Expansion + Map Zoom — Design

Date: 2026-07-17
Status: Approved

## Problem

Mainnet world initialized at 8×4 = 32 parcels. Target scale is ~100 players,
each holding ~5 parcels — ~500 parcels eventually. Two constraints:

- `initialize_world` is one-shot (`initialized` flag blocks re-init) and no
  expand entrypoint exists.
- Several systems scan `0..total_parcels` per transaction. `register_player`
  scans the full grid three times with nested hex-distance math; a 500-parcel
  world day one risks blowing the Cartridge sponsorship gas ceiling
  (>~100M gas broke AVNU sponsorship historically).

Decision: **growable world**, expanded in place by an admin entrypoint. No
world redeploy — the existing 8×4 grid is a sub-rectangle of any larger grid,
so live state (2 registered players, 6 home parcels) survives untouched and
all deployed addresses stay valid.

## 1. Contract: `expand_world` (world_system.cairo)

New entrypoint on `world_system`:

```
fn expand_world(ref self: ContractState, new_cols: u32, new_rows: u32)
```

- **Auth:** operator-only (same check as other admin entrypoints). Asserts
  `WorldConfig.initialized`.
- **Current bounds:** derived by one scan of existing parcels (max col/row).
  Admin transaction, deployer pays gas — sponsorship limits irrelevant.
  WorldConfig schema is NOT changed (no cols/rows fields added), avoiding any
  model migration risk on the live world.
- **Validation:** asserts `new_cols >= current_cols` and
  `new_rows >= current_rows`, and that at least one dimension grows.
- **Append:** for every `(col, row)` in the new bounds that has no parcel,
  create one: `parcel_type = 255` (untyped), `owner = 0`, `is_home = false` —
  identical to fresh-init behavior. `parcel_id` continues from
  `next_parcel_id`; `total_parcels` and `next_parcel_id` updated at the end.
- **Batching:** large jumps are run as multiple incremental calls
  (e.g. 96 → 160 → 300) to keep per-transaction storage writes bounded.
  The entrypoint itself needs no chunking logic; the runbook is "grow in
  steps".

Parcel iteration everywhere is by `parcel_id` range, and layout/adjacency is
by stored `col`/`row`, so non-row-major id assignment for appended cells is
harmless.

## 2. Ops

- Migrate contracts on mainnet and katana (mainnet uses
  `--use-blake2s-casm-class-hash` per runbook), then re-grant writer.
- New `scripts/expand-world.ts` — network-aware (reads manifest per profile),
  calls `expand_world`. First mainnet run: 32 → **12×8 = 96**.
- Bump `GRID_W`/`GRID_H` from 8/4 to **12/8** in `scripts/init-hex-world.sh`,
  `scripts/init-mainnet-world.ts`, `scripts/init-katana-world.ts` so fresh
  environments start at the new size.
- Future expansions: rerun the script with bigger dims when occupancy is high
  (rule of thumb: expand at ~60% claimed).

## 3. Frontend: map zoom/pan (HexGrid.tsx)

Custom SVG viewBox manipulation. No new dependencies.

- **Wheel zoom** anchored at cursor position.
- **Pointer-drag pan** (mouse + touch), **pinch zoom** on touch.
- **Fit-to-world button** resets to the computed full-extent viewBox.
- **Clamps:** zoom limited to 0.5×–4× of the fit scale; pan bounded to world
  extent plus a margin.
- ViewBox math implemented as pure functions (module-level, exported) so it is
  unit-testable without DOM.

HexGrid already computes its viewBox dynamically from parcel positions, so no
grid-size assumptions need fixing.

## 4. Explicitly untouched

- MCP server and frontend data layer already read `total_parcels` /
  parcel lists dynamically — no changes.
- Registration spread, conquest, settle scans unchanged. O(96) is fine.
  Scan rework (ring search instead of full sweep) is deferred until the world
  approaches ~300+ parcels; noted as the known follow-up before any large
  expansion.

## 5. Tests

Cairo (`src/tests/`):

- expand appends exactly the missing cells with untyped/unowned state;
- existing parcels (owners, types, homes) unchanged after expand;
- non-operator call reverts;
- shrink or no-op dims revert;
- `register_player` after expand can land homes on appended parcels;
- `total_parcels` / `next_parcel_id` correct after multiple incremental
  expands.

Frontend:

- unit tests for viewBox math (zoom clamp, cursor anchoring, pan bounds);
- `bun run lint` / `bun run build` clean.
