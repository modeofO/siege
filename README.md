# Siege Dojo

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace. The codebase now has three layers:

- **1v1 battles**: commit-reveal rounds with gate modifiers, resource nodes, traps, and single-use ability tokens.
- **The Marches**: a persistent tile-graph world where Holds own parcels, stake abilities, claim land, pillage neighbors, form factions, and fight asynchronous conquests.
- **Legacy 2v2 contracts**: still present in `src/systems/actions.cairo`, `commit_reveal.cairo`, and `resolution.cairo`, but not the primary product path.

This README describes the code as of May 22, 2026. Treat older dated plans and specs as historical unless current code confirms them.

## Current Status

The latest branch is on a world-map migration. The old hex map has been replaced by a 40-tile square/rhombus tile graph with sectors, zones, tile adjacency, and fold state.

Important current mismatches:

- `frontend/src/lib/tileGeometry.json` and `scripts/tiling-generator/seed.json` were regenerated in commit `9b0f050` with the note "needs updated contracts." Sepolia config points at v7, but the newest geometry may still require a contract/world reinitialization.
- Some frontend direct-call wrappers still have older Sepolia hardcoded fallbacks. For Sepolia, set the `NEXT_PUBLIC_*` contract env vars explicitly instead of relying on fallbacks.
- Resource token addresses are not uniform across all scripts. `scripts/init-sepolia-resource-config.sh` and `torii_sepolia.toml` use the v7 ResourceConfig set; `frontend/src/lib/useResourceBalances.ts`, `scripts/check-balances.ts`, and MCP defaults still contain an older token set.
- `frontend/src/lib/tiers.ts` says Basileia has 4 ability slots, but `world_system.cairo` currently caps match ability stakes at 3 for tier 2 and tier 3.
- T2 crafting calls `AbilityToken.burn`, so the live AbilityToken `burner` must be set to `crafting_1v1`. If T2 crafting reverts with `Not burner`, rerun the ability-token setup script.

## Gameplay

### 1v1 Battles

Each battle has two players, two 50 HP vaults, and up to 10 rounds. A round follows commit, reveal, then resolve.

Each player spends a budget of `10 + owned_resource_nodes` across:

- `attack`: 3 gate pressure values.
- `defense`: 3 gate garrison values.
- `repair`: heals the vault before gate damage, capped at 3.
- `nodes`: 3 resource-node contest values.
- `traps`: 3 hidden node traps, each costing 2 budget.
- `ability_id` and `ability_target`: optional single-use staked ability activation.

The 1v1 reveal hash is Poseidon over:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Gate modifiers are rolled per gate with Cartridge vRNG:

| Code | Name        | Effect                                                                                           |
| ---- | ----------- | ------------------------------------------------------------------------------------------------ |
| 0    | Normal      | Standard `max(attack - defense, 0)` damage.                                                      |
| 1    | Narrow Pass | Attack and defense are capped at 3.                                                              |
| 2    | Mirror      | Attack and defense swap at that gate.                                                            |
| 3    | Deadlock    | No damage at that gate.                                                                          |
| 4    | Reflection  | Damage becomes overflow split across the other non-deadlock gates and reduced by unused defense. |

Resource nodes mint paired ERC-20 resources after resolution:

| Node   | Tokens        |
| ------ | ------------- |
| Forge  | IRON + LINEN  |
| Quarry | STONE + WOOD  |
| Grove  | EMBER + SEEDS |

### Abilities

Abilities are ERC-1155 tokens from `src/tokens/ability_token.cairo`. IDs 1-5 are T1; IDs 6-10 are T2.

| ID     | Ability     | T1 effect / cost                                                     | T2 effect / cost                                                                                |
| ------ | ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 / 6  | Siege Sword | Set target gate attack to 5. Costs 8 Iron + 5 Wood.                  | Set target gate attack to 10. Costs 30 Iron + 20 Wood + 10 Ember + matching T1.                 |
| 2 / 7  | Stone Cloak | Halve gate damage taken. Costs 8 Stone + 5 Linen.                    | Zero gate damage taken. Costs 30 Stone + 20 Linen + 10 Seeds + matching T1.                     |
| 3 / 8  | Ember Blast | Deal 2 direct vault damage. Costs 8 Ember + 5 Seeds.                 | Deal 6 direct vault damage. Costs 30 Ember + 20 Seeds + 10 Iron + matching T1.                  |
| 4 / 9  | Hex         | Reduce opponent total damage by 3. Costs 5 Iron + 5 Stone + 3 Ember. | Reduce opponent total damage by 8. Costs 20 Iron + 20 Stone + 10 Ember + 10 Wood + matching T1. |
| 5 / 10 | Fortify     | Add 1 defense at every gate. Costs 5 Stone + 5 Linen + 3 Wood.       | Double defense at every gate. Costs 20 Stone + 20 Linen + 10 Wood + matching T1.                |

When the world is folded, `resolution_1v1.cairo` and `conquest.cairo` double numeric ability effects where a multiplier makes sense. Stone Cloak's halve/zero effect is not doubled.

Registration mints starter ability tokens 1, 2, and 3 if `ResourceConfig.ability_token` is set.

### The Marches

The Marches is backed by a tile graph, not hex coordinates.

Core models:

- `Parcel`: keyed by `tile_id`; stores `sector_id`, `tile_shape`, `zone`, `parcel_type`, `owner`, `is_home`, and `is_stranded`.
- `TileAdjacency`: four edge slots per tile, using `0xFFFFFFFF` as the no-neighbor sentinel.
- `WorldConfig`: total tile count, next tile id, initialization flag, world-fold flag, fold epoch, and total fold count.
- `FoldEvent`: records sector folds and world-fold toggles.
- `SectorEnvironment`: defined but not yet central to the frontend.

`initialize_world` creates the tile rows and adjacency rows. `expand_world` appends more tiles. The current generated seed contains 40 tiles and 128 adjacency triples.

A player registers a Hold with three home parcel types. The contract chooses three unclaimed frontier tiles from the sector with the most available frontier space, marks them as homes, and records the player in `PlayerKingdom`.

Claim drip currently mints only for home parcels. It skips homes under active pillage and homes marked stranded. Zone multipliers are:

- Core: 3x
- Mid: 2x
- Frontier: 1x

### Staked Matches, Parcels, and Pillage

`world_system.create_staked_match` escrows 1-3 ability tokens from player A and creates a pending 1v1 match. `join_staked_match` escrows player B's matched wager, refunds A's excess stakes, wires `MatchAbilities1v1`, and activates the match.

After a staked match finishes:

- `settle_match` transfers escrowed abilities to the winner, returns both sides' abilities on draw, increments the winner's total wins, updates reputation and head-to-head records, releases the loser's highest-id non-home parcel, mints one resource drip for both players' owned parcels, and may grant pillage eligibility.
- `claim_parcel(match_id, parcel_id, parcel_type)` lets the winner claim one unclaimed adjacent tile and assign its type.
- A pillage eligibility lasts 24 hours. `initiate_pillage` targets an adjacent loser home parcel. `claim_pillage_drip` siphons that home's resource drip until expiration or broken adjacency.

Parcel caps are not enforced in current Cairo code.

### Conquest

Conquest is a one-transaction attack against another player's non-home parcel.

- Defender preset budget: 12.
- Attacker budget: 10.
- Defender HP: 15.
- Attacker HP: 10.
- Ties go to the defender.

The attacker must own a tile adjacent to the target. Faction allies cannot conquest one another. If defender reinforcement is enabled, up to three adjacent faction allies can contribute preset defenses to the random preset pool.

If `ability_id` is non-zero, `conquest.cairo` checks ownership and calls `safe_transfer_from(attacker, conquest_contract, ability_id, 1, [])` before resolving. That means conquest ability use requires ERC-1155 operator approval for the conquest contract and currently leaves the token in the conquest contract.

On attacker win, the target parcel transfers to the attacker. On attacker loss, a non-home attacker parcel transfers to the defender if one exists.

### Factions and Cosmetics

Factions live in `world_system.cairo`.

- Creating a faction requires Strategos tier and burns 30 Iron + 30 Stone + 20 Wood.
- Leaders invite and kick members.
- Members have a 24-hour cooldown after leaving.
- Reinforcement can be toggled per Hold and affects conquest defense.
- Allied adjacency can protect a home from pillage and bridge stranded tiles during fold recomputation.

Cosmetics are stored in `PlayerCosmetics` by `world_system.set_cosmetic`. The frontend uses Forge circuits as banners, parcel skins, and hold decorations.

## Project Layout

```text
src/
  systems/
    actions_1v1.cairo        1v1 match creation and config
    commit_reveal_1v1.cairo  1v1 commit, reveal, timeout
    resolution_1v1.cairo     1v1 damage, nodes, traps, abilities
    crafting_1v1.cairo       ability crafting and batch crafting
    world_system.cairo       holds, staking, settlement, drip, pillage, factions, folds
    conquest.cairo           async parcel conquest
    actions.cairo            legacy 2v2
    commit_reveal.cairo      legacy 2v2
    resolution.cairo         legacy 2v2
  models/                    Dojo ECS models
  tokens/                    AbilityToken, ResourceToken, metadata helpers
  utils/tile_graph.cairo     tile adjacency helpers
  utils/hex.cairo            legacy hex helper, still tested
  tests/                     23 Cairo test files

frontend/
  src/app/                   Next.js routes
  src/components/            battle, world, forge, faction UI
  src/lib/                   contract wrappers, Torii queries, state hooks
  src/lib/tileGeometry.json  rendered tile geometry for TilingMap

mcp-server-2/                active MCP server
mcp-server/                  older read-only MCP server
scripts/                    deploy, token, local-dev, and bot scripts
scripts/siege-cli/           CLI for 1v1 matches
scripts/tiling-generator/    generated tile seed and geometry
site/                       Vocs player documentation site
docs/superpowers/           historical specs and implementation plans
```

## Toolchain

| Tool             | Version / source                              |
| ---------------- | --------------------------------------------- |
| Cairo            | 2.13.1                                        |
| Scarb            | 2.13.1                                        |
| Dojo dependency  | `dojo` v1.8.0 in `Scarb.toml`                 |
| sozo             | v1.8.6 expected for Sepolia                   |
| Katana container | Dojo v1.8.0, Katana 1.7.0                     |
| Torii container  | Dojo v1.8.0, Torii 1.8.3                      |
| Frontend         | Next 16.2.6, React 19.2.3, Starknet.js 8.9.2  |
| MCP server       | TypeScript, MCP SDK 1.29.0, Starknet.js 8.5.2 |

## Development

Install frontend dependencies:

```bash
cd frontend
bun install
bun run dev
```

The frontend `predev` and `prebuild` hooks copy `manifest_dev.json` and `manifest_sepolia.json` from the repo root into `frontend/src/manifests/`.

Local chain:

```bash
./scripts/local-dev.sh
```

Current caveat: `scripts/local-dev.sh` still prints GraphQL-era Torii text and only grants writer permissions for the legacy contracts when migration does not grant permissions. If local world actions revert with permissions errors, grant writers for the 1v1, crafting, world, and conquest systems manually.

Contract tests:

```bash
sozo test
docker compose run --rm builder sozo test
```

Frontend checks:

```bash
cd frontend
bun run lint
bun run test
bun run build
```

MCP checks:

```bash
cd mcp-server-2
pnpm run build
pnpm run test
```

## Sepolia

Current config:

- World seed: `siege_dojo_v7`
- World address: `0x05ae03c23b817afa096a51e3b04e31c176f168ee8193465229d08fa67366a942`
- RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Torii: `https://api.cartridge.gg/x/siege-dojo/torii`
- Torii start block: `10009090`

Contracts from `manifest_sepolia.json`:

| Tag                            | Address                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `siege_dojo-actions`           | `0x2e9f46df80daf57789a15140c272e22575893e8db75e957ba3efbc020bb262a` |
| `siege_dojo-actions_1v1`       | `0x4242c71cda43bdc6f24e0baa6eb353f1cca6e960cb3e622787c46e5083ff516` |
| `siege_dojo-commit_reveal`     | `0x1c5ff97432e3f25892efbae549b4d43c84768a0b824f74caa590c932c491efd` |
| `siege_dojo-commit_reveal_1v1` | `0x6a6b677b9dea4f766b10dcfe2907ad60861103263aa85c2ca2122db86eb2c52` |
| `siege_dojo-conquest`          | `0x305fdf6f2fe07c08436fea5ea4e7c77b9f7515654e4e764af7c131d848b441f` |
| `siege_dojo-crafting_1v1`      | `0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130` |
| `siege_dojo-resolution`        | `0x4a67025337a82aea39058228b81d91b22d6dc28035b05d3377607671334ccd2` |
| `siege_dojo-resolution_1v1`    | `0x7f57549212a1db5b5cf8a1ac29eeed62f7e8566a5c08f16c737eedf54aa1842` |
| `siege_dojo-world_system`      | `0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea` |

AbilityToken:

```text
0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05
```

Resource tokens used by `scripts/init-sepolia-resource-config.sh`:

| Token | Address                                                             |
| ----- | ------------------------------------------------------------------- |
| IRON  | `0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838` |
| LINEN | `0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91`  |
| STONE | `0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29` |
| WOOD  | `0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30` |
| EMBER | `0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1` |
| SEEDS | `0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35` |

Recommended frontend Sepolia env:

```bash
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

NEXT_PUBLIC_ACTIONS_ADDRESS=0x2e9f46df80daf57789a15140c272e22575893e8db75e957ba3efbc020bb262a
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x1c5ff97432e3f25892efbae549b4d43c84768a0b824f74caa590c932c491efd
NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x4242c71cda43bdc6f24e0baa6eb353f1cca6e960cb3e622787c46e5083ff516
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x6a6b677b9dea4f766b10dcfe2907ad60861103263aa85c2ca2122db86eb2c52
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x7f57549212a1db5b5cf8a1ac29eeed62f7e8566a5c08f16c737eedf54aa1842
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea
NEXT_PUBLIC_CONQUEST_ADDRESS=0x305fdf6f2fe07c08436fea5ea4e7c77b9f7515654e4e764af7c131d848b441f
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05
```

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

Then run the post-migration setup scripts that match the deployment:

```bash
npx tsx scripts/deploy-v7.ts
bash scripts/init-sepolia-resource-config.sh
```

`starkli` should use the v0.8 RPC endpoint:

```text
https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```

## MCP Server

`mcp-server-2/` is the active MCP server. It registers 44 tools and can submit transactions through a Cartridge session after browser approval.

```bash
cd mcp-server-2
pnpm install
pnpm run build
```

Required runtime env: copy `mcp-server-2/.env.mainnet` to `.env` rather than
setting these by hand — it carries the Torii URL, Cartridge RPC, manifest path,
session dir, and all token addresses for the live network. See
`mcp-server-2/README.md` for setup, session approval, and the channel contract.

## Torii gRPC

Torii serves SQL and gRPC-web on the same base URL — no `/grpc` path, no
separate port:

| Transport | Path |
| --------- | ---- |
| SQL reads | `{TORII_URL}/sql?query=…` |
| gRPC-web  | `{TORII_URL}/world.World/<Method>` |

Native gRPC is not exposed — torii binds it to `127.0.0.1:50051` by default and
the Dockerfiles publish only HTTP 8080, which serves gRPC-web. So `grpcurl` and
server reflection do not work here. To check what a deployment actually serves:

```bash
bun x tsx scripts/torii-conformance.ts              # mainnet
bun x tsx scripts/torii-conformance.ts <toriiUrl>   # any deployment
```

It reads the RPC list from `world.proto` upstream, probes each method over
gRPC-web, and reports which are served. Useful when a subscription silently
stops arriving, when checking whether a redeployed Torii is fully up, or when
finding out which methods exist before writing a new read path. Exits 2 if the
endpoint is unreachable.

## Documentation

- `site/docs/pages/`: player-facing docs site.
- `frontend/README.md`: frontend architecture and env.
- `mcp-server-2/README.md`: MCP setup and tool list.
- `CLAUDE.md` (symlinked as `AGENTS.md`): working context for coding agents.
- `docs/superpowers/`: historical specs and plans. Do not treat dated plans as current truth without checking code.

## License

MIT
