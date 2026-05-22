# AGENTS.md

This file gives Codex current working context for this repository. The source of truth is the code, manifests, and config in this checkout.

## Current Product Shape

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace.

Active systems:

- 1v1 commit-reveal battles: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`.
- Ability crafting and tokens: `crafting_1v1`, `AbilityToken`, `ResourceToken`.
- The Marches world metagame: `world_system`, `conquest`.
- Frontend: Next app under `frontend/`.
- Active MCP server: `mcp-server-2/`.

Legacy systems:

- 2v2 contracts remain in `actions`, `commit_reveal`, and `resolution`.
- `mcp-server/` is older and not the main MCP implementation.
- `src/utils/hex.cairo` remains tested but the current world map uses `tile_graph.cairo`.

## Terminology

Backend names stay unchanged. UI copy uses player-facing names:

| Backend                  | Player-facing label       |
| ------------------------ | ------------------------- |
| `World`, `/world`        | The Marches               |
| `PlayerKingdom`, kingdom | Hold                      |
| `register_player`        | Claim/establish your Hold |

Do not rename Cairo models or entrypoints to match UI copy.

## Known Current Mismatches

Keep these in mind before debugging symptoms as game logic bugs:

- Commit `9b0f050` regenerated `frontend/src/lib/tileGeometry.json` and `scripts/tiling-generator/seed.json` and says the frontend fix needs updated contracts. Sepolia v7 may not match the newest tile geometry until the world is reinitialized with that seed.
- `frontend/src/lib/contracts1v1.ts` and `frontend/src/lib/craftingContracts.ts` still contain older Sepolia fallback addresses. Set env vars explicitly for Sepolia.
- Resource token addresses differ between `scripts/init-sepolia-resource-config.sh`/`torii_sepolia.toml` and `frontend/src/lib/useResourceBalances.ts`/MCP defaults.
- Cairo currently caps staked-match ability slots at 1, 2, 3, 3 by tier. `frontend/src/lib/tiers.ts` says tier 3 has 4 ability slots.
- T2 crafting calls `AbilityToken.burn`, so the live AbilityToken `burner` must be set to `crafting_1v1`. If T2 crafting reverts with `Not burner`, rerun the ability-token setup script.
- `scripts/local-dev.sh` still has legacy Torii GraphQL text and only grants legacy writers in its fallback grant block.

## Toolchain

| Tool                 | Version / source            |
| -------------------- | --------------------------- |
| Cairo                | 2.13.1                      |
| Scarb                | 2.13.1                      |
| Dojo dependency      | v1.8.0                      |
| sozo                 | v1.8.6 expected for Sepolia |
| Katana container     | Dojo v1.8.0, Katana 1.7.0   |
| Torii container      | Dojo v1.8.0, Torii 1.8.3    |
| Frontend             | Next 16.2.6, React 19.2.3   |
| Starknet.js frontend | 8.9.2                       |
| Starknet.js MCP      | 8.5.2                       |

## Core Battle Rules

1v1 state lives in `MatchState1v1`. Vault HP starts at 50. Matches end when a vault hits 0 or after round 10.

Each round:

1. Both players commit a Poseidon hash.
2. Both players reveal the exact allocation.
3. `resolution_1v1.resolve_round` applies modifiers, abilities, repair, damage, node contests, traps, resource mints, and next-round modifiers.

Reveal hash order:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Budget is `10 + owned_resource_nodes`. Trap cost is 2 each. Repair is capped at 3 during resolution.

Gate modifier codes:

- `0`: Normal.
- `1`: Narrow Pass, cap attack and defense at 3.
- `2`: Mirror, swap attack and defense at that gate.
- `3`: Deadlock, no damage.
- `4`: Reflection, split overflow to other non-deadlock gates and reduce by unused defense.

Abilities are token IDs 1-10. Use:

```text
ability_type(id) = ((id - 1) % 5) + 1
ability_tier(id) = ((id - 1) / 5) + 1
```

Ability IDs:

- 1/6 Siege Sword.
- 2/7 Stone Cloak.
- 3/8 Ember Blast.
- 4/9 Hex.
- 5/10 Fortify.

World fold doubles numeric ability effects in `resolution_1v1` and `conquest`.

## The Marches

The Marches is a tile graph, not a hex grid.

Important models:

- `Parcel`: `tile_id`, `sector_id`, `tile_shape`, `zone`, `parcel_type`, `owner`, `is_home`, `is_stranded`.
- `TileAdjacency`: `(tile_id, edge_index) -> neighbor_tile_id`.
- `WorldConfig`: `total_parcels`, `next_parcel_id`, `initialized`, `is_world_folded`, `fold_epoch`, `total_folds`.
- `FoldEvent`: records sector and world folds.
- `PlayerKingdom`: homes, parcel count, tier, wins, drip timestamp, free craft flag, faction reinforcement toggle.

The current generated seed has 40 tiles and 128 adjacency triples. `NO_NEIGHBOR` is `0xFFFFFFFF`.

Registration chooses three unclaimed frontier tiles in the sector with the most available frontier tiles. The caller selects home parcel types, not positions.

`claim_drip` mints for the player's three homes, not every owned parcel. It skips active pillages and stranded homes. Zone multiplier: core 3, mid 2, frontier 1.

`settle_match` handles ability transfer/refund, win stats, reputation, match records, resource drip, loser's non-home release, and pillage eligibility.

`claim_parcel` claims one unclaimed adjacent tile after a settled staked-match win and assigns its parcel type.

Conquest attacks adjacent non-home parcels in one transaction. Attacker budget is 10, defender preset budget is 12, attacker HP is 10, defender HP is 15, and ties go to the defender.

## Tiers

Cairo tier functions:

| Tier | Name      | Wins required | Match ability slots | Defense presets |
| ---- | --------- | ------------- | ------------------- | --------------- |
| 0    | Polis     | 0             | 1                   | 1               |
| 1    | Strategos | 10            | 2                   | 2               |
| 2    | Hegemonia | 30            | 3                   | 3               |
| 3    | Basileia  | 60            | 3                   | 4               |

Upgrade costs:

- Strategos: 20 Iron, 20 Stone, 10 Wood.
- Hegemonia: 50 Iron, 50 Stone, 30 Wood, 20 Ember.
- Basileia: 100 Iron, 100 Stone, 60 Wood, 40 Ember, 20 Seeds.

## Sepolia

Current config files point at:

- Seed: `siege_dojo_v7`
- World: `0x05ae03c23b817afa096a51e3b04e31c176f168ee8193465229d08fa67366a942`
- RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Torii: `https://api.cartridge.gg/x/siege-dojo/torii`
- Torii start block: `10009090`

Contract addresses should come from `manifest_sepolia.json`. Current important tags:

- `siege_dojo-actions_1v1`: `0x4242c71cda43bdc6f24e0baa6eb353f1cca6e960cb3e622787c46e5083ff516`
- `siege_dojo-commit_reveal_1v1`: `0x6a6b677b9dea4f766b10dcfe2907ad60861103263aa85c2ca2122db86eb2c52`
- `siege_dojo-resolution_1v1`: `0x7f57549212a1db5b5cf8a1ac29eeed62f7e8566a5c08f16c737eedf54aa1842`
- `siege_dojo-crafting_1v1`: `0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130`
- `siege_dojo-world_system`: `0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea`
- `siege_dojo-conquest`: `0x305fdf6f2fe07c08436fea5ea4e7c77b9f7515654e4e764af7c131d848b441f`
- `AbilityToken`: `0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05`

Deployment sequence:

```bash
export DOJO_ACCOUNT_ADDRESS="0x..."
export DOJO_PRIVATE_KEY="0x..."

sozo build -P sepolia
sozo -P sepolia migrate
sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions \
  siege_dojo,siege_dojo-commit_reveal \
  siege_dojo,siege_dojo-resolution \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1 \
  siege_dojo,siege_dojo-crafting_1v1 \
  siege_dojo,siege_dojo-world_system \
  siege_dojo,siege_dojo-conquest
```

Post-migration setup:

```bash
npx tsx scripts/deploy-v7.ts
bash scripts/init-sepolia-resource-config.sh
```

Use Starkli's v0.8 RPC endpoint for Starkli commands:

```text
https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```

## Frontend Notes

The frontend supports `devnet` and `sepolia` modes through `src/app/providers.tsx`.

- Devnet uses local Katana accounts.
- Sepolia uses Cartridge Controller and `SESSION_POLICIES`.
- Session policies are fixed when the player connects. After adding policies, tell players to reconnect.
- Current world UI uses `TilingMap`, not `HexGrid`.
- Torii SQL is the default polling read path. Do not add new GraphQL queries.

Use `BigInt(0)` rather than `0n` in frontend code.

Use Bun for simple frontend and docs-site workflows:

```bash
cd frontend
bun run lint
bun run test
bun run build

cd site
bun run test
bun run build
```

## MCP Notes

Use `mcp-server-2/`. It registers 39 tools and signs writes through a Cartridge session. It reads Dojo contract addresses from `MANIFEST_PATH`; AbilityToken and resource token addresses come from env/defaults.

Build and test with pnpm because this package has a pnpm lockfile:

```bash
cd mcp-server-2
pnpm run build
pnpm run test
```

## Tests

Contract tests:

```bash
sozo test
docker compose run --rm builder sozo test
```

Docs site:

```bash
cd site
bun run test
bun run build
```

## Historical Docs

`docs/superpowers/specs` and `docs/superpowers/plans` are dated records. They are useful for intent but should not override current Cairo, TypeScript, manifests, or config.
