# CLAUDE.md

This file gives Claude Code current working context for this repository. The source of truth is the code, manifests, and config in this checkout.

## Current Product Shape

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace.

Active systems:

- 1v1 commit-reveal battles: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`.
- Ability crafting and tokens: `crafting_1v1`, `AbilityToken`, `ResourceToken`.
- The Marches world metagame: `world_system`, `conquest`.
- Frontend: Next app under `frontend/`.
- Active MCP server: `mcp-server-2/`.

The legacy 2v2 system (`actions`, `commit_reveal`, `resolution`) was removed from the source tree — it was never used. The deployed Sepolia v9 world still has those contracts registered from earlier migrations; ignore them.

`mcp-server/` is older and not the main MCP implementation.

## Terminology

Backend names stay unchanged. UI copy uses player-facing names:

| Backend                  | Player-facing label       |
| ------------------------ | ------------------------- |
| `World`, `/world`        | The Marches               |
| `PlayerKingdom`, kingdom | Hold                      |
| `register_player`        | Claim/establish your Hold |

Do not rename Cairo models or entrypoints to match UI copy.

## Known Current Mismatches

- T2 crafting calls `AbilityToken.burn`, so the live AbilityToken `burner` must be set to `crafting_1v1`. If T2 crafting reverts with `Not burner`, rerun `scripts/setup-ability-token.sh`.
- `frontend/src/bindings/typescript/*.gen.ts` are generated and still contain removed 2v2 types until the next codegen; don't hand-edit them.
- `frontend/src/lib/__tests__/stakedMatch.test.ts` fails when `NEXT_PUBLIC_NETWORK` is devnet and `manifest_dev.json` lacks `world_system` (address resolves to ""). Pre-existing; not a regression signal by itself.

## Toolchain

| Tool                 | Version / source            |
| -------------------- | --------------------------- |
| Cairo                | 2.13.1                      |
| Scarb                | 2.13.1                      |
| Dojo dependency      | v1.8.0                      |
| Katana/Torii         | `ghcr.io/dojoengine/dojo:v1.8.0` containers |
| Frontend             | Next 16.2.6, React 19.2.3   |
| Starknet.js frontend | 8.9.2                       |
| Starknet.js MCP      | 8.5.2                       |

Always run sozo through the Docker builder — the locally installed sozo is older than the project toolchain:

```bash
docker compose run --rm builder sozo build
docker compose run --rm builder sozo test
```

## Core Battle Rules

1v1 state lives in `MatchState1v1`. Vault HP starts at 50. Matches end when a vault hits 0 or after round 10.

Each round:

1. Both players commit a Poseidon hash.
2. Both players reveal the exact allocation.
3. `resolution_1v1.resolve_round` applies modifiers, abilities, repair, damage, node contests, traps, resource mints, and next-round modifiers.

Commit and reveal deadlines are 300 seconds each (`commit_reveal_1v1.cairo`).

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

## The Marches

The Marches is an offset hex grid (`col`/`row` per parcel, `utils/hex.cairo` distance metric). The Sepolia v9 world is initialized by `scripts/init-hex-world.sh` as 8 columns x 4 rows = 32 parcels. There is no fold mechanic, no zones, and no sectors — older docs describing a tile graph with folds are obsolete.

Important models:

- `Parcel`: `parcel_id`, `col`, `row`, `parcel_type` (0=Forge, 1=Quarry, 2=Grove; 255=untyped at init), `owner`, `is_home`.
- `WorldConfig`: `total_parcels`, `next_parcel_id`, `initialized`.
- `PlayerKingdom`: three home ids, `parcel_count`, `registered`, `free_craft_used`, `last_drip_time`, `tier`, `total_wins`, `faction_reinforcement_enabled`.

Registration claims three home parcels: the first maximizes distance to already-claimed parcels, the other two cluster near it. The caller selects home parcel types, not positions. Registration mints starter abilities.

`claim_drip` mints for the player's three homes once per hour (`DRIP_INTERVAL = 3600`), skipping actively pillaged homes. There is no zone multiplier.

`settle_match` handles ability transfer/refund, win stats, reputation, match records, resource drip, loser's non-home release, and pillage eligibility.

`claim_parcel` claims one unclaimed adjacent parcel after a settled staked-match win and assigns its parcel type.

Conquest attacks adjacent non-home parcels in one transaction. Attacker budget is 10, defender preset budget is 12, attacker HP is 10, defender HP is 15, and ties go to the defender. Pillage window is 24 hours (`PILLAGE_WINDOW = 86400`).

## Tiers

Cairo tier functions (`world_system.cairo`):

| Tier | Name      | Wins required | Match ability slots | Defense presets |
| ---- | --------- | ------------- | ------------------- | --------------- |
| 0    | Polis     | 0             | 1                   | 1               |
| 1    | Strategos | 10            | 2                   | 2               |
| 2    | Hegemonia | 30            | 3                   | 3               |
| 3    | Basileia  | 60            | 3                   | 4               |

`MatchStakes1v1` stores at most 3 stake slots per player; tier 3 caps at 3 ability slots everywhere (Cairo, frontend `tiers.ts`, MCP).

Upgrade costs:

- Strategos: 20 Iron, 20 Stone, 10 Wood.
- Hegemonia: 50 Iron, 50 Stone, 30 Wood, 20 Ember.
- Basileia: 100 Iron, 100 Stone, 60 Wood, 40 Ember, 20 Seeds.

## Sepolia

Current config files point at:

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73`
- RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Torii: `https://api.cartridge.gg/x/siege-dojo/torii`
- Torii start block: `10547399`

Contract addresses should come from `manifest_sepolia.json`. Current important tags:

- `siege_dojo-actions_1v1`: `0x5def5daa769122af26d2b6fdb1ab8aa5485232a6cebc32053e19e715a2ffab2`
- `siege_dojo-commit_reveal_1v1`: `0x7a11369feb1812c88b1b027d1f5a3493c2f09c03612460372664dae7fbe4ff5`
- `siege_dojo-resolution_1v1`: `0x227d85f88211383106235553ee51e96dfa795ca4dcff86a734e63e9bb20f39e`
- `siege_dojo-crafting_1v1`: `0x1f8085720ec1c5b153c273b522878365c2c19d55a22141c70e907e27df19ad3`
- `siege_dojo-world_system`: `0x1c35fca268af0253265c3ef881ec3f7d7d0afa94626a8a2ddc5bb133e8be401`
- `siege_dojo-conquest`: `0x5d9d790df9b1003b144521d1bf9821a1c9dca7332a5a6c99f003af5b2ca4394`
- `AbilityToken`: `0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05`
- Cartridge VRF provider: `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f`

Resource token addresses live in `scripts/init-sepolia-resource-config.sh` and `frontend/src/lib/useResourceBalances.ts` (kept in sync).

Deployment sequence:

```bash
export DOJO_ACCOUNT_ADDRESS="0x..."
export DOJO_PRIVATE_KEY="0x..."

docker compose run --rm builder sozo build -P sepolia
docker compose run --rm builder sozo -P sepolia migrate
docker compose run --rm builder sozo -P sepolia auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1 \
  siege_dojo,siege_dojo-crafting_1v1 \
  siege_dojo,siege_dojo-world_system \
  siege_dojo,siege_dojo-conquest
```

Post-migration setup (fresh world only):

```bash
bash scripts/init-hex-world.sh
bash scripts/setup-ability-token.sh
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
- The world UI renders `HexGrid`.
- Torii SQL is the default polling read path. Do not add new GraphQL queries.
- Torii stores u64 key columns (e.g. `match_id`) as zero-padded hex text; use `sqlU64()` from `toriiSql.ts` for comparisons.

Use `BigInt(0)` rather than `0n` in frontend code.

## MCP Notes

Use `mcp-server-2/`. It registers 39 tools and signs writes through a Cartridge session. It reads Dojo contract addresses from `MANIFEST_PATH`; AbilityToken and resource token addresses come from env/defaults.

Cartridge VRF quirk: the VRF server keys the seed to the contract called immediately after `request_random` in the multicall. When the consumer is reached through a nested call (e.g. `force_timeout` → `resolve_round`), sandwich a harmless direct view call to the consumer between the VRF request and the real call. See issue #44.

Build and test:

```bash
cd mcp-server-2
pnpm run build
pnpm run test
```

## Tests

Contract tests:

```bash
docker compose run --rm builder sozo test
```

Frontend:

```bash
cd frontend
bun run lint
bun run test
bun run build
```

Docs site:

```bash
cd site
bun run test
bun run build
```

## Historical Docs

`docs/superpowers/specs` and `docs/superpowers/plans` are dated records. They are useful for intent but should not override current Cairo, TypeScript, manifests, or config.
