# Fold Map Design — Ammann-Beeker Tiling with Origami Mechanics

**Date:** 2026-05-21
**Status:** Draft
**Supersedes:** Hex diamond grid (34-parcel layout from `initialize_world`)

## Summary

Replace the hex-grid world map with an Ammann-Beeker aperiodic tiling (square + 45° rhombus). The map is a single surface that grows outward as players join and reshuffles adjacency via two fold mechanics:

1. **Sector folds** — permanent adjacency shuffles between 8 symmetry sectors, triggered probabilistically on match settlement
2. **World fold** — a global boolean ("taco fold") that bends the entire map surface in 3D and doubles all ability effects

Players start at the frontier and fight inward toward the high-value center. Folds hit the edges hardest, making factions essential for territorial stability.

## Tile Geometry

### Two tile shapes

- **Square** — 4 edges, right angles
- **45° Rhombus** — 4 edges, 45°/135° angles

These tesselate aperiodically with 8-fold rotational symmetry. The initial map is a small seed patch (the 8-pointed star form of the Ammann-Beeker tiling).

### Sectors

The tiling divides into 8 sectors — wedges of the 8-fold symmetry, like pizza slices. Each tile belongs to exactly one sector. Sector boundaries are where fold mechanics operate.

### Adjacency model

Adjacency is stored explicitly as an edge list, not computed from coordinates. Each tile has up to 4 edges, each connecting to a neighbor.

No more `col`/`row` coordinates. No more `hex.cairo`. Adjacency is a graph, not geometry.

## Map Growth via Subdivision

### When

When the ratio of claimed tiles to total tiles crosses ~70%, checked on `register_player` and `claim_parcel`.

### How

New tiles are appended **outward** beyond the existing boundary. The Ammann-Beeker growth pattern fills in the concavities between the star points, so the map shape trends toward an octagon/circle as it expands.

- Existing owned tiles never subdivide — your territory is stable
- New tiles are unclaimed wilderness (claimer picks Forge/Quarry/Grove on claim)
- New tiles inherit the parent boundary tile's `sector_id`
- Subdivision geometry is precomputed off-chain and batch-written via `expand_world`

### Registration

New players are assigned 3 home tiles from the outermost unclaimed ring, all in the same sector. One of each type (Forge, Quarry, Grove). The frontier is the starting line, not the destination.

## Zone Value Gradient

Tile value increases with proximity to the center:

| Zone | Distance from center | Drip multiplier | Fold exposure |
|------|---------------------|-----------------|---------------|
| Core | Inner ring | 3x | Fold-immune (no sector boundary edges) |
| Mid | Middle rings | 2x | Partially exposed |
| Frontier | Outer rings | 1x | Most exposed (most sector-boundary edges) |

This creates "king of the hill" dynamics: the center is the most valuable, most stable, and hardest to reach. Players fight inward through contested territory.

### Paths inward

The geometry does not create permanent chokepoints because:

1. The tiling fills circularly as it grows — lateral paths exist between sectors, not just narrow spokes
2. Sector boundaries provide cross-sector movement options
3. Sector folds create new adjacencies that open alternative paths
4. The narrowing toward the center is intentional competitive tension, not a bug

## Fold Mechanics

### Entropy source

Single vRNG roll on every `settle_match` call. Three possible outcomes:

| Roll range | Outcome | Probability |
|-----------|---------|-------------|
| 0–89% | Nothing | ~90% |
| 90–96% | Sector fold | ~7% |
| 97–99% | World fold toggle | ~3% |

Probabilities are tunable contract constants. With ~10 matches/day early on, expect a sector fold every 1-2 days and a world fold toggle every 3-4 days.

### Sector folds (adjacency shuffle)

Permanent, irreversible changes to the adjacency graph along sector boundaries.

**How it works:**

1. vRNG picks a fold axis (0-3, one of the 4 symmetry lines through the center)
2. Sectors on either side of that axis reflect — their boundary adjacencies swap to face the opposite neighboring sector
3. `TileAdjacency` entries along the affected sector boundaries are rewritten

**Operations:** Both rotation (sector swap) and reflection (boundary flip) are possible. The vRNG determines the operation type and parameters.

**Effects on gameplay:**

- Ownership is untouched — your tiles stay yours
- Border adjacencies change — your preset defenses now face different opponents
- Active pillages on broken adjacencies end immediately
- Conquest targets shift — parcels you were planning to attack may no longer be adjacent
- Interior tiles (no sector-boundary edges) are unaffected — deeper territory is safer

### Stranded tiles

After every sector fold, a `recompute_stranded` pass runs on affected sectors:

- BFS from each player's home tiles through `TileAdjacency`
- Any owned tile not reached is marked `is_stranded = true`
- **Faction bridging:** faction members' tiles count as connected during BFS — factions prevent stranding
- Stranded tiles get half drip rate and can be conquered without the normal adjacency requirement

This makes factions mechanically load-bearing: a solo player's territory is fragile under folds, while a faction's interlocking territory is resilient.

### World fold (the taco)

A global boolean toggle on `WorldConfig`.

**When active:**
- All ability effects are **doubled** in both `resolution_1v1` and `conquest`
- T1 Siege Sword: set attack to 5 → 10
- T1 Ember Blast: 2 direct damage → 4
- T2 Hex: reduce by 8 → 16
- T2 Stone Cloak: zero damage → still zero (already maxed)
- The frontend renders the tiling surface bending in 3D along a central axis

**When the next world fold roll hits:** toggles back to `false`, abilities return to normal, map visually unfolds.

**No adjacency change from the world fold.** It is purely a global combat modifier + visual event. Sector folds handle adjacency; the world fold handles atmosphere and ability economy.

### Sector-pinned environments

Environmental effects are tied to sector *positions*, not tiles:

```
SectorEnvironment {
    sector_id: u8,       // 0-7
    effect_type: u8,     // 0=none, 1=drip_boost, 2=defense_debuff, 3=conquest_cost
    effect_magnitude: u8,
}
```

When tiles fold into a new sector position, they inherit that zone's effects. Your Forge parcel in a drip-boosted sector might fold into a debuffed sector.

## On-Chain Models

### Modified models

```cairo
// Parcel — replaces col/row with tile_id, adds fold-related fields
struct Parcel {
    #[key]
    tile_id: u32,
    sector_id: u8,
    tile_shape: u8,       // 0=square, 1=rhombus
    zone: u8,             // 0=core, 1=mid, 2=frontier — set at creation, determines drip multiplier
    parcel_type: u8,      // 0=Forge, 1=Quarry, 2=Grove
    owner: ContractAddress,
    is_home: bool,
    is_stranded: bool,
}

// WorldConfig — fold state added
struct WorldConfig {
    #[key]
    id: u8,
    total_parcels: u32,
    next_parcel_id: u32,
    initialized: bool,
    is_world_folded: bool,
    fold_epoch: u32,
    total_folds: u32,
}
```

### New models

```cairo
// Explicit adjacency graph — replaces hex coordinate math
struct TileAdjacency {
    #[key]
    tile_id: u32,
    #[key]
    neighbor_index: u8,   // 0..3 (4 edges per tile)
    neighbor_tile_id: u32,
}

// Per-sector environmental effects
struct SectorEnvironment {
    #[key]
    sector_id: u8,
    effect_type: u8,
    effect_magnitude: u8,
}

// Fold history
struct FoldEvent {
    #[key]
    fold_id: u32,
    fold_type: u8,        // 0=sector, 1=world
    axis: u8,
    trigger_match: u64,
    timestamp: u64,
}
```

### Removed

- `col: u16, row: u16` from `Parcel`
- `hex.cairo` — `hex_distance`, `get_hex_neighbors`, `is_neighbor` all replaced by `TileAdjacency` lookups

## Contract Changes

### Modified entrypoints

- **`world_system.settle_match`** — add vRNG fold probability check after settlement logic. On trigger, calls `execute_sector_fold` or `toggle_world_fold`.
- **`world_system.claim_parcel`** — adjacency check reads `TileAdjacency` instead of `is_neighbor(col, row)`.
- **`world_system.register_player`** — assigns 3 frontier tiles in the same sector instead of hex-adjacent parcels.
- **`conquest.initiate_conquest`** — adjacency via `TileAdjacency`, reads `SectorEnvironment` for modifiers, checks `is_world_folded` for ability doubling.
- **`resolution_1v1.resolve_round`** — checks `is_world_folded` for ability effect doubling.

### New entrypoints

- **`world_system.expand_world`** — admin-gated batch write of new frontier tiles and adjacency entries. Batched per sector for gas limits.
- **`world_system.execute_sector_fold`** — internal: rewrites `TileAdjacency` along affected sector boundaries, runs `recompute_stranded` on affected players.
- **`world_system.toggle_world_fold`** — internal: flips `is_world_folded`, increments `fold_epoch`.

## Frontend — 3D Rendering

### Engine

Three.js via React Three Fiber (`@react-three/fiber` + `@react-three/drei`). Fits the existing Next.js/React stack. Package audit required before installation (supply chain risk — see project feedback memory).

### Visual states

| State | Rendering |
|-------|-----------|
| Normal | Flat tiling surface with slight isometric tilt. Tiles colored by type + ownership. Sector boundaries as subtle glowing seams. Zone rings as concentric gradients. |
| Sector fold event | Affected sector boundary seam glows, tiles visually shift/reflect. Brief animation settling into new state. |
| World fold (taco) | Entire surface bends along central axis. Camera pulls back. Ambient lighting shifts warmer/more intense. Stays bent until toggle-off. |

### Tile rendering

- Square and rhombus tiles as flat extruded polygons (~2-3px thickness)
- Ownership = tile color. Unclaimed = dark/neutral. Player's own tiles glow. Faction tiles share tinted border.
- Stranded tiles pulse/desaturate
- Center tiles have richer materials to signal value

### Interaction

- Click tile: owner, type, adjacency, sector, zone info
- Hover: highlights adjacent tiles from `TileAdjacency`
- Conquest/pillage actions from tile context menu

### Replaces

- `HexGrid.tsx` → `TilingMap.tsx`
- Parchment CSS module for world view
- All hex SVG rendering

## Migration Path

### Phase 1: Contract foundation

- New models (`TileAdjacency`, `SectorEnvironment`, `FoldEvent`)
- Modified models (`Parcel`, `WorldConfig`)
- New `tile_adjacency.cairo` utility
- `expand_world`, `execute_sector_fold`, `toggle_world_fold` entrypoints
- Fold check wired into `settle_match`
- Conquest/pillage/claim updated to use `TileAdjacency`
- New test files for fold mechanics, adjacency, subdivision, stranded detection

### Phase 2: Off-chain tooling

- Ammann-Beeker tiling generator script (tile coords, shapes, adjacency lists, sectors)
- Subdivision expansion generator for boundary growth
- Updated `initialize_world` for new tile format
- Migration script for v5 world seed

### Phase 3: Frontend

- Install Three.js stack (`bun add three @react-three/fiber @react-three/drei`) — audit first
- `TilingMap.tsx` replacing `HexGrid.tsx`
- 3D tile rendering, fold animations, taco bend
- Update `worldState.ts`, `conquest.ts`, `pillage.ts` queries for new model fields

### Phase 4: Sepolia deployment

- New world seed (v5) with Ammann-Beeker initial map
- Fresh Torii deployment
- Updated frontend env vars

### Unchanged systems

- 1v1 match mechanics (commit-reveal, abilities, traps, gate modifiers)
- Crafting system
- Ability tokens (ERC-1155)
- Staked matches
- Faction CRUD
- Kingdom tiers
- Resource token contracts
