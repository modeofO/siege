# Siege Dojo 🏯

A Starknet / Dojo ECS strategy game. Two gameplay modes share one world (`siege_dojo` namespace): fast **1v1 commit-reveal matches** and a **persistent hex-grid metagame** where holds battle over parcels, resources, and reputation.

Player-facing docs: [siege-mauve.vercel.app](https://siege-mauve.vercel.app/).

## Game Modes

### 1v1 Arena (`/match-1v1`)

Single-match tactical duels — each player controls both attack and defense with a shared budget of 10 (+node bonuses). Vault HP starts at 50.

- **13-slot allocation**: 3 pressure points (attack), 3 gates + repair (defense), 3 resource-node contests, 3 traps
- **Gate modifiers** roll each round via Cartridge vRNG: Normal, Narrow Pass, Mirror Gate, Deadlock, Reflection
- **Node traps** (2 pts each): +5 damage if opponent takes the node, consumed after one round
- **Abilities**: staked ERC-1155 tokens deployed once per match — 5 types × 2 tiers (Siege Sword, Stone Cloak, Ember Blast, Hex, Fortify)
- **Resource nodes**: Forge / Quarry / Grove — controlling them mints paired ERC-20 tokens (IRON+LINEN, STONE+WOOD, EMBER+SEEDS)
- **Commit-reveal**: 14-element Poseidon hash (salt + 13 allocations)

A **2v2 mode** also exists in the contracts (`actions`, `commit_reveal`, `resolution`) and remains on-chain, but the UI no longer surfaces it — 1v1 is the supported flow.

### The Marches (`/world`)

Persistent metagame wrapping 1v1 matches. Register a **Hold** (the in-game name for a kingdom), claim three home parcels, stake abilities in matches, and take territory on the win.

- **Tiers** (by `total_wins`): Polis → Strategos (10) → Hegemonia (30) → Basileia (60). Each tier raises parcel cap, match ability slots, and preset-defense slots.
- **Claim drip**: `claim_drip()` mints resource tokens for every owned parcel on a cooldown.
- **Staked matches**: both players stake up to 3 abilities; winner takes all stakes and may claim an adjacent non-home parcel.
- **Conquest**: async attacks against a neighbor's preset defense, resolved in one tx via Cartridge vRF (attacker budget 10 / HP 10, defender budget 12 / HP 15).
- **Pillage**: match winners become eligible to pillage a losing neighbor's home parcel — siphoning its drip until the pillage expires or breaks.
- **Reputation**: tracked bracket (Unranked → Bronze → Silver → Gold → Diamond) from win/loss counts + streaks.
- **Factions**: kingdoms can band into factions (invite / accept / leave) for social play.
- **Spectator mode**: live match viewing at `/match-1v1/{id}/spectate` — dual health bars, round counter, auto-refresh.
- **Cosmetics**: equippable hold crests (ArcaneSeal) and parcel skins (WardGlyph) via the Forge (`/forge`).

### Frontend terminology

To avoid collision with other Starknet strategy games, the UI renames backend concepts:

| Backend | Frontend label |
|---|---|
| `World`, `/world` | **THE MARCHES** |
| `PlayerKingdom`, "kingdom" | **Your Hold** |
| `register_player` | **CLAIM YOUR HOLD** |

Backend models and function names are unchanged.

## Architecture

- **Cairo contracts** (Dojo v1.8.0, cairo 2.13.1) — ECS models + systems in `src/`
- **Frontend** (Next.js 16, React 19, Tailwind 4, Starknet.js v8) in `frontend/`
- **Torii indexer** — SQL + gRPC over world state (hosted on Slot for Sepolia)
- **Cartridge Controller** — session-based gasless tx via paymaster on Sepolia
- **AbilityToken** (ERC-1155) — standalone Starknet contract in `src/tokens/`, fully on-chain SVG metadata
- **Resource tokens** (6 ERC-20) — paired per resource node
- **MCP server** — read-only Siege game-state tools (`mcp-server/`)

## Project Structure

```
siege/
├── src/
│   ├── systems/                # 1v1 + 2v2 + world contracts
│   │   ├── actions_1v1.cairo   commit_reveal_1v1.cairo   resolution_1v1.cairo
│   │   ├── crafting_1v1.cairo
│   │   ├── world_system.cairo  conquest.cairo
│   │   └── actions.cairo       commit_reveal.cairo       resolution.cairo   (legacy 2v2)
│   ├── models/                 # Dojo ECS models (match state, parcels, kingdoms, pillage…)
│   ├── tokens/                 # AbilityToken ERC-1155 + on-chain SVG metadata
│   ├── utils/hex.cairo         # offset-coord hex math
│   └── tests/                  # ~166 tests across 19 files
├── frontend/                   # Next.js app
│   └── src/
│       ├── app/                # /, /match-1v1, /craft, /world, /forge, /match (hidden legacy)
│       ├── components/         # HexGrid, AllocationForm1v1, AbilitySelector, FactionPanel, ArcaneSeal…
│       └── lib/                # contracts1v1, conquest, pillage, reputation, tiers, factions…
├── mcp-server-2/               # TypeScript MCP server (47 tools — read + write via Cartridge session)
├── scripts/                    # local-dev.sh, deploy scripts, siege-cli/, test bots
├── docs/                       # specs + implementation plans under superpowers/
├── skill/SKILL.md              # in-depth development skill
├── dojo_dev.toml               # local (gitignored — has dev keys)
├── dojo_sepolia.toml           # Sepolia profile
└── torii_sepolia.toml          # Torii config for hosted indexer
```

## Toolchain

| Tool | Version | Notes |
|------|---------|-------|
| sozo | **v1.8.6** | ≥ v1.8.1 required for Sepolia (blake2s CASM hashing) |
| scarb | 2.13.1 | matches dojo v1.8.0 |
| cairo | 2.13.1 | |
| dojo | v1.8.0 | pinned in `Scarb.toml` |
| starkli | 0.4.2 | account management only |

## Local Development

Prerequisites: Docker, Node.js ≥ 18, the Dojo toolchain (`curl -L https://install.dojoengine.org | bash && dojoup`).

```bash
./scripts/local-dev.sh        # starts katana + builds + migrates + grants writers + starts torii
cd frontend && npm run dev    # frontend on localhost:3000 (experimental HTTPS)
docker compose down           # tear down
```

Notes:
- Dojo images ship AMD64 only — `docker-compose.yml` pins `platform: linux/amd64` (Rosetta on ARM Macs)
- Katana CLI flags: `--http.addr` (not `--host`), `--http.cors_origins "*"`
- Dev accounts live in `frontend/src/app/providers.tsx` (katana 1.7.0, seed 0)
- `sozo migrate` syncs **zero** permissions by default — `local-dev.sh` runs `sozo auth grant writer` for all contracts afterwards

### Frontend dual-mode (`providers.tsx`)

Network mode is controlled by `NEXT_PUBLIC_NETWORK`:

| Mode | Value | Provider | Wallet |
|------|-------|----------|--------|
| Dev (default) | `devnet` | 4 hardcoded Katana accounts | dropdown selector |
| Sepolia | `sepolia` | `@starknet-react/core` + Cartridge Controller | connect button (session-based) |

`useAccount()`, `useDevAccounts()`, and `isDevMode()` are the unified hooks. `DEVNET_TX_OPTS` (skip validation, zero gas) applies only in devnet mode; Sepolia relies on the Cartridge paymaster for fees.

### Tests

```bash
sozo test                                   # ~166 tests
docker compose run --rm builder sozo test   # via Docker (ships sozo 1.8.6)
```

Coverage spans `test_actions_1v1`, `test_commit_reveal_1v1`, `test_resolution_1v1`, `test_modifiers_1v1`, `test_traps_1v1`, `test_abilities_1v1`, `test_ability_tiers`, `test_ability_token`, `test_world`, `test_staked_match`, `test_conquest`, `test_kingdom_tiers`, `test_reputation`, `test_pillaging`, and the legacy 2v2 suites.

### Bot testing

```bash
cd scripts && MATCH_ID=3 npx tsx play-opponent.js   # 3 bot players
cd scripts && bash run-test.sh                      # full automated round
```

## Sepolia Deployment

Live on Starknet Sepolia — last deploy 2026-05-17 (v4, security key rotation).

**World:** `0x051e8698f43b869b3e243344897d83ba236e6b049ab55e8b14b3a528bc690ce6`
**RPC:** `https://api.cartridge.gg/x/starknet/sepolia` (spec v0.9.0)
**Torii:** `https://api.cartridge.gg/x/siege-dojo/torii` (SQL, gRPC via Slot)

### Contract Addresses (Sepolia v4)

| Contract | Address |
|----------|---------|
| `actions_1v1` | `0xa503dbf655e21fe7e65c42f18662edc584aa6b3e8c8bb19e35fa57f62492ab` |
| `commit_reveal_1v1` | `0x5304e2568417d2e67d63caab54db914900afbf23035687c63b4962d2f5d8f5b` |
| `resolution_1v1` | `0x7d42eb63561f6f25315833d674002e3a53accd00bd02e243154009890122e3d` |
| `crafting_1v1` | `0x18700cba1d48b91aa99f2a7542a8739576fec35e4938d8c5dd11879688fe7b2` |
| `world_system` | `0x6d2455b76185900ffc6fb0fed0f91f4c61c7f4ac5e57a92d0fe8edc620b66f2` |
| `conquest` | `0x26bd1b97c0c29dcef1a161ff835817c0f1940f21afc3a747f7637408fddc094` |
| `AbilityToken` (ERC-1155, v4) | `0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05` |
| `actions` (legacy 2v2) | `0x45e612a60f967ac0f1e8e406b9eb4928fd0742109ba816a6f2f3b232cd22d3a` |
| `commit_reveal` (legacy 2v2) | `0x34087751f8e88c1b02e61be7c493e15f9a4d3f0d8b0803667b407069dc0a73b` |

### Frontend `.env.local` for Sepolia

Only `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_TORII_URL`, and `NEXT_PUBLIC_RPC_URL` are strictly required (contract addresses have hardcoded fallbacks in `lib/contracts*.ts`), but set all of them explicitly when redeploying so the frontend never silently pins to stale code.

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0xa503dbf655e21fe7e65c42f18662edc584aa6b3e8c8bb19e35fa57f62492ab
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x5304e2568417d2e67d63caab54db914900afbf23035687c63b4962d2f5d8f5b
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x7d42eb63561f6f25315833d674002e3a53accd00bd02e243154009890122e3d
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x18700cba1d48b91aa99f2a7542a8739576fec35e4938d8c5dd11879688fe7b2
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x6d2455b76185900ffc6fb0fed0f91f4c61c7f4ac5e57a92d0fe8edc620b66f2
NEXT_PUBLIC_CONQUEST_ADDRESS=0x26bd1b97c0c29dcef1a161ff835817c0f1940f21afc3a747f7637408fddc094
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05

# Legacy 2v2 (UI hidden)
NEXT_PUBLIC_ACTIONS_ADDRESS=0x45e612a60f967ac0f1e8e406b9eb4928fd0742109ba816a6f2f3b232cd22d3a
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x34087751f8e88c1b02e61be7c493e15f9a4d3f0d8b0803667b407069dc0a73b
```

### Redeploying

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

`[[writers]]` in `dojo_*.toml` is **not** supported in this sozo — always grant via CLI. The safest deploy path is the bundled Docker builder (`docker compose run --rm builder sozo -P sepolia migrate`) which ships sozo v1.8.6.

`starkli` uses a different RPC spec — use the v0.8 endpoint:

```
https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```

## Abilities (ERC-1155)

Tokens IDs 1–10 on `AbilityToken`: IDs 1–5 are T1, IDs 6–10 are T2 (same 5 types, stronger). Transferable, visible in the Cartridge wallet.

| Type | Name | T1 effect | T2 effect |
|------|------|-----------|-----------|
| 1 | Siege Sword | set gate attack to 5 | set gate attack to 10 |
| 2 | Stone Cloak | halve gate damage | zero gate damage |
| 3 | Ember Blast | +2 direct damage bypassing gates | +6 direct damage |
| 4 | Hex | -3 to opponent total damage | -8 |
| 5 | Fortify | +1 defense at all gates | double all defense |

**Crafting flow:** the frontend multicalls `approve` on each required ERC-20 and then `craft_ability(id)` / `craft_ability_tier2(type)` on `crafting_1v1`. T2 burns 1 of the matching T1 plus larger resource costs. `crafting_1v1` burns inputs (`transfer_from` to `0x1`) and calls `AbilityToken.mint(caller, id, 1)`.

**Metadata:** fully on-chain — `uri(token_id)` returns `data:application/json;base64,…` with inline SVG. Updating art: one `set_ability_svg(type, svg)` admin tx per ability. No redeploy, no external server, no IPFS.

**Roles:** `admin` (deployer; transferable via `transfer_admin` since v4), `minter` = `crafting_1v1`, `minter2` = `world_system` (for starter mints and staked-match settlement), `burner` = `0x0` until Phase 2B.

## MCP Server

`mcp-server-2/` exposes 47 Siege tools over the Model Context Protocol — read tools for match state, world state, kingdom, reputation, factions, and abilities; write tools for committing, revealing, resolving, staking, settling, conquest, pillage, and faction management. The server holds a Cartridge session key and submits transactions on-chain itself.

```bash
cd mcp-server-2 && pnpm install && pnpm run build
claude mcp add siege -- node /path/to/siege/mcp-server-2/dist/index.js
```

First run prints a Cartridge auth URL — approve once and the session persists to `.cartridge/`. Read tools work immediately; write tools wait on session approval. Contract addresses come from the Dojo manifest, so session policy and tx targets always agree.

### Ask Torii (remote MCP)

[Ask Torii](https://liquid-data.dev/) is a hosted natural-language MCP that accepts queries against any Torii-indexed world — endpoint `https://asktorii.com/mcp`. Point `query-world` at the Sepolia Torii URL to query matches, parcels, pillages, or any other Siege state without building custom readers.

Built by [@frontboat](https://github.com/frontboat).

## CLI (`scripts/siege-cli/`)

```bash
cd scripts/siege-cli

# Cartridge Controller (default — first run opens a browser for auth)
npx tsx siege-cli.ts --create --opponent 0x<addr>
npx tsx siege-cli.ts --match <id>

# Private-key fallback
npx tsx siege-cli.ts --match <id> --use-private-key

# Scripting via JSON
npx tsx siege-cli.ts --match <id> --json \
  '{"attack":[3,2,1],"defense":[2,1,0],"repair":1,"nodes":[0,0,0]}'
```

## Docs & Specs

- `skill/SKILL.md` — deep development skill (architecture, hash layouts, debug checklist)
- `docs/superpowers/specs/` — recent design specs (game redesign, reputation, tiers, conquest, pillaging, factions, docs site)
- `docs/superpowers/plans/` — implementation plans tied to each spec
- `docs/blender-style-guide.md` — art style guide
- `SEPOLIA_MIGRATION_SUMMARY.md` — historical notes on the blake2s migration blocker

## Open Work

Active bugs and upcoming features are tracked as GitHub issues on `modeofO/siege` (currently up to #42). Check the issue list for priorities before starting new work.

## License

MIT
