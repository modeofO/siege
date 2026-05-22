---
name: siege-game
description: Current development guide for Siege, a Starknet/Dojo strategy game. Use when working on Siege Cairo systems, tile-map world logic, the Next.js frontend, ability crafting, the active MCP server, or game mechanics such as commit-reveal, resolution, staking, folds, conquest, pillage, factions, and cosmetics.
---

# Siege Game Development

Use current code as the source of truth. Older specs and plans in `docs/superpowers` are historical unless the implementation still matches them.

## System Map

Active code paths:

- `src/systems/actions_1v1.cairo`: creates 1v1 matches, initializes nodes, rolls first modifiers, stores ResourceConfig.
- `src/systems/commit_reveal_1v1.cairo`: commits, reveals, timeout handling, budget validation, trap validation, ability-use validation.
- `src/systems/resolution_1v1.cairo`: gate modifiers, abilities, repair, vault damage, node contests, traps, resource mints, win state.
- `src/systems/crafting_1v1.cairo`: T1/T2 ability crafting and batch crafting.
- `src/systems/world_system.cairo`: tile world initialization, registration, staking, settlement, claim drip, parcel claims, pillage, factions, cosmetics, folds.
- `src/systems/conquest.cairo`: asynchronous preset-defense parcel attacks.
- `frontend/`: Next app for player UI.
- `mcp-server-2/`: active MCP server for AI agents.

Legacy code paths:

- `src/systems/actions.cairo`, `commit_reveal.cairo`, `resolution.cairo`: 2v2 mode.
- `mcp-server/`: older MCP implementation.
- `src/utils/hex.cairo`: legacy hex helper, still tested.

## Current World Model

The Marches is a tile graph, not a hex grid.

Core models:

- `Parcel(tile_id)`: `sector_id`, `tile_shape`, `zone`, `parcel_type`, `owner`, `is_home`, `is_stranded`.
- `TileAdjacency(tile_id, edge_index)`: neighbor tile id or `0xFFFFFFFF`.
- `WorldConfig(0)`: total tile count, next id, initialized flag, fold state.
- `FoldEvent(fold_id)`: fold type, axis, trigger match, timestamp.
- `PlayerKingdom(player)`: homes, parcel count, tier, wins, drip timestamp, free craft flag, faction reinforcement.

Current generated seed: 40 tiles, 128 adjacency triples, sectors 0-7, zones 0-2, shapes 0 square and 1 rhombus.

Latest caveat: commit `9b0f050` regenerated frontend geometry and seed data with the note that contracts need updating. Do not assume Sepolia geometry and frontend geometry match until redeployed or reinitialized with the same seed.

## 1v1 Round Flow

1. Player A and B commit a Poseidon hash.
2. Both reveal their allocations.
3. Anyone resolves the round after both reveals.
4. If no vault is destroyed and round is below 10, resolution rolls next-round modifiers.

Reveal hash order:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Budget:

- Base budget: 10.
- Node bonus: +1 per owned node.
- Trap cost: 2 per trap.
- Repair cap: 3 during resolution.

Commit and reveal deadlines are 300 seconds.

## Resolution Rules

Gate modifiers:

- `0 Normal`: standard damage.
- `1 Narrow Pass`: cap attack and defense at 3.
- `2 Mirror`: swap attack and defense at that gate.
- `3 Deadlock`: no damage at that gate.
- `4 Reflection`: hold overflow and split half to each other non-deadlock gate, reduced by unused defense at the receiver.

Resolution order:

1. Read modifiers and moves.
2. Apply per-gate modifier transformations.
3. Apply Fortify and Siege Sword during per-gate calculation.
4. Apply Stone Cloak to gate and reflected damage.
5. Distribute reflected overflow.
6. Sum damage and apply Hex.
7. Apply repair, capped at 50 HP.
8. Apply gate damage.
9. Apply Ember Blast direct damage.
10. Resolve node contests.
11. Apply trap damage when a trapped node changes owner.
12. Mint node resource rewards.
13. Finish or advance the match.

World fold multiplier doubles numeric ability effects in `resolution_1v1` and `conquest`.

## Ability IDs and Costs

Token IDs 1-5 are T1. IDs 6-10 are T2.

| Type        | IDs    | T1                                                       | T2                                                          |
| ----------- | ------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| Siege Sword | 1 / 6  | Set target attack to 5. 8 Iron + 5 Wood.                 | Set target attack to 10. 30 Iron + 20 Wood + 10 Ember + T1. |
| Stone Cloak | 2 / 7  | Halve gate damage. 8 Stone + 5 Linen.                    | Zero gate damage. 30 Stone + 20 Linen + 10 Seeds + T1.      |
| Ember Blast | 3 / 8  | 2 direct damage. 8 Ember + 5 Seeds.                      | 6 direct damage. 30 Ember + 20 Seeds + 10 Iron + T1.        |
| Hex         | 4 / 9  | Reduce opponent damage by 3. 5 Iron + 5 Stone + 3 Ember. | Reduce by 8. 20 Iron + 20 Stone + 10 Ember + 10 Wood + T1.  |
| Fortify     | 5 / 10 | +1 defense at every gate. 5 Stone + 5 Linen + 3 Wood.    | Double all defense. 20 Stone + 20 Linen + 10 Wood + T1.     |

Helpers:

```text
ability_type(id) = ((id - 1) % 5) + 1
ability_tier(id) = ((id - 1) / 5) + 1
```

T2 crafting requires Strategos tier or higher.

## World Mechanics

Registration:

- `register_player(home_types)` requires exactly three types.
- It picks three unclaimed frontier tiles in the sector with the most frontier availability.
- It marks them as homes and mints starter abilities 1, 2, and 3 if AbilityToken is configured.

Drip:

- `claim_drip` mints resources for home parcels only.
- Active pillage and stranded status skip the home.
- Zone multiplier: core 3, mid 2, frontier 1.

Staked matches:

- `create_staked_match` escrows player A's ability tokens and creates a pending 1v1.
- `join_staked_match` escrows player B's matched amount, refunds excess A stakes, writes `MatchAbilities1v1`, and activates the battle.
- `settle_match` transfers or refunds stakes, updates wins/reputation/match records, releases the loser's highest-id non-home parcel, mints one resource drip for both players' owned parcels, and may grant pillage eligibility.

Parcel claim:

- `claim_parcel` requires a settled staked-match win.
- Target must be unclaimed and adjacent to the winner's territory.
- Caller chooses parcel type 0 Forge, 1 Quarry, or 2 Grove.
- Current Cairo does not enforce parcel caps.

Pillage:

- Eligibility lasts 24 hours.
- Target must be the loser's home parcel and adjacent to the pillager.
- Faction ally adjacency can block initiating pillage.
- `claim_pillage_drip` lazily ends pillage if adjacency breaks.

Folds:

- Settle has a 90% no-fold, 7% sector-fold, 3% world-fold roll when VRF is configured.
- World fold toggles `is_world_folded`.
- Sector fold changes sector ids along an axis, breaks pillages with lost adjacency, and recomputes stranded parcels.
- Faction-owned adjacent parcels can bridge stranded checks.

Conquest:

- `set_preset_defense`: budget 12, preset slots by tier 1/2/3/4.
- `initiate_conquest`: attacker budget 10, attacker HP 10, defender HP 15.
- Target must be owned, non-home, not self-owned, not a faction ally, and adjacent to attacker territory.
- Defender preset is selected by VRF from defender presets plus up to three adjacent faction ally presets when reinforcement is on.
- A non-zero conquest `ability_id` is transferred from attacker to the conquest contract before resolution; current Cairo does not return it.
- Ties go to defender.

Tiers:

| Tier | Name      | Wins | Ability slots | Presets |
| ---- | --------- | ---- | ------------- | ------- |
| 0    | Polis     | 0    | 1             | 1       |
| 1    | Strategos | 10   | 2             | 2       |
| 2    | Hegemonia | 30   | 3             | 3       |
| 3    | Basileia  | 60   | 3             | 4       |

## Frontend Notes

Use `frontend/src/app/providers.tsx` for account state. It supports:

- `devnet`: hardcoded Katana accounts.
- `sepolia`: Cartridge Controller session.

Reads:

- Torii SQL through `frontend/src/lib/toriiSql.ts`.
- Dojo SDK model hooks where already established.
- Ability metadata and balances through Starknet RPC in `abilityToken.ts`.

World map:

- Use `TilingMap`, `tileGeometry.json`, `useWorldParcels`, `useTileAdjacency`, and `useWorldFoldState`.
- Do not introduce new hex-grid UI unless explicitly reviving legacy behavior.

Sepolia:

- Set contract env vars explicitly. Do not trust stale fallbacks.
- Session policy changes require players to reconnect.

## MCP Notes

Use `mcp-server-2`.

- It registers 39 tools.
- Reads work without a session.
- Writes require Cartridge approval.
- Contract addresses come from `MANIFEST_PATH`.
- AbilityToken and resource token addresses come from env/defaults.

Run:

```bash
cd mcp-server-2
pnpm run build
pnpm run test
```

## Common Tasks

Changing battle balance:

- Edit `resolution_1v1.cairo`.
- If the ability also applies to conquest, edit `conquest.cairo`.
- Update frontend ability text in `frontend/src/lib/craftingContracts.ts` and docs site data in `site/src/data/abilities.ts`.
- Add or update Cairo tests.

Changing world map behavior:

- Edit `world_system.cairo` and `tile_graph.cairo` as needed.
- Regenerate `scripts/tiling-generator/seed.json` and `frontend/src/lib/tileGeometry.json` together.
- Reinitialize or redeploy any live world using the same seed.
- Update `TilingMap` only after confirming the geometry shape.

Adding a player-triggered entrypoint:

1. Add the Cairo function.
2. Grant writer permissions after migration.
3. Add frontend call wrappers.
4. Add Cartridge session policy in `providers.tsx`.
5. Add MCP policy/tool if agents need it.
6. Tell Sepolia players to reconnect their Cartridge session.

Debugging commit-reveal:

- Compare TypeScript and Cairo Poseidon element order.
- Include traps and ability fields in hashes.
- Check role A/B from `MatchState1v1`.
- Check `RoundMoves1v1.commit_count`, `reveal_count`, deadlines, and `Commitment` rows.

Debugging live world reads:

- Query Torii SQL table names with quoted model names, such as `"siege_dojo-Parcel"`.
- Use `sqlHex`/`sqlInt` helpers for interpolated filters.
- Avoid GraphQL for new reads.
