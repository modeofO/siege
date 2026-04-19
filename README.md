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
- **Torii indexer** — GraphQL/SQL over world state (hosted on Slot for Sepolia)
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
│   └── tests/                  # ~159 tests across 19 files
├── frontend/                   # Next.js app
│   └── src/
│       ├── app/                # /, /match-1v1, /craft, /world, /match (hidden legacy)
│       ├── components/         # HexGrid, AllocationForm1v1, AbilitySelector, FactionPanel…
│       └── lib/                # contracts1v1, conquest, pillage, reputation, tiers, factions…
├── mcp-server/                 # TypeScript MCP server (read-only tools)
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
sozo test                                   # ~159 tests
docker compose run --rm builder sozo test   # via Docker (ships sozo 1.8.6)
```

Coverage spans `test_actions_1v1`, `test_commit_reveal_1v1`, `test_resolution_1v1`, `test_modifiers_1v1`, `test_traps_1v1`, `test_abilities_1v1`, `test_ability_tiers`, `test_ability_token`, `test_world`, `test_staked_match`, `test_conquest`, `test_kingdom_tiers`, `test_reputation`, `test_pillaging`, and the legacy 2v2 suites.

### Bot testing

```bash
cd scripts && MATCH_ID=3 npx tsx play-opponent.js   # 3 bot players
cd scripts && bash run-test.sh                      # full automated round
```

## Sepolia Deployment

Live on Starknet Sepolia — last deploy 2026-04-19.

**World:** `0x022824cd5897655db69f0b04c5ab4180989addce42dd05ec64e17283d9e58707`
**RPC:** `https://api.cartridge.gg/x/starknet/sepolia` (spec v0.9.0)
**Torii:** `https://api.cartridge.gg/x/siege-dojo/torii` (GraphQL, SQL, gRPC via Slot)

### Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| `actions_1v1` | `0x520bdcaa5ca4d04bd1aee77362eca6a284ba2bbf0690f5696b87e13007c8603` |
| `commit_reveal_1v1` | `0x31ff951f7405f24e69f42dc3009ff20702fca8079d6551733fc39da90ab1e81` |
| `resolution_1v1` | `0x27e7a9c43ef49f90987943358b3a5d5aadc74c5c8ba79bd3eadea9514decf97` |
| `crafting_1v1` | `0x12ceed12ca0a5ecc3590ec4a4833204df56f808e340b6950b432958252634e7` |
| `world_system` | `0x2d7d0a53f6a4e24f62b33ae7e0203f5c155476ff7fdb53b10a5fffa48d84064` |
| `conquest` | `0x4f2bcdd8b544f77886834bc567a8a221b15bd723f330b86d3d0339889941969` |
| `AbilityToken` (ERC-1155, v3) | `0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb` |
| `actions` (legacy 2v2) | `0x4ae15829516bcf010ef3bd85bedeb62c4dd5047ffba5e44327b3fdb1f2db5d8` |
| `commit_reveal` (legacy 2v2) | `0x64e62948faafdb00095ef82722729d3c09feef74b1242259369691e2812cfa7` |

### Frontend `.env.local` for Sepolia

Only `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_TORII_URL`, and `NEXT_PUBLIC_RPC_URL` are strictly required (contract addresses have hardcoded fallbacks in `lib/contracts*.ts`), but set all of them explicitly when redeploying so the frontend never silently pins to stale code.

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x520bdcaa5ca4d04bd1aee77362eca6a284ba2bbf0690f5696b87e13007c8603
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x31ff951f7405f24e69f42dc3009ff20702fca8079d6551733fc39da90ab1e81
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x27e7a9c43ef49f90987943358b3a5d5aadc74c5c8ba79bd3eadea9514decf97
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x12ceed12ca0a5ecc3590ec4a4833204df56f808e340b6950b432958252634e7
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x2d7d0a53f6a4e24f62b33ae7e0203f5c155476ff7fdb53b10a5fffa48d84064
NEXT_PUBLIC_CONQUEST_ADDRESS=0x4f2bcdd8b544f77886834bc567a8a221b15bd723f330b86d3d0339889941969
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb

# Legacy 2v2 (UI hidden)
NEXT_PUBLIC_ACTIONS_ADDRESS=0x4ae15829516bcf010ef3bd85bedeb62c4dd5047ffba5e44327b3fdb1f2db5d8
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x64e62948faafdb00095ef82722729d3c09feef74b1242259369691e2812cfa7
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

**Roles:** `admin` (immutable, deployer), `minter` = `crafting_1v1`, `minter2` = `world_system` (for starter mints and staked-match settlement), `burner` = `0x0` until Phase 2B.

## MCP Server

`mcp-server/` exposes read-only Siege game-state tools over the Model Context Protocol — move building, state reads, hash helpers. It never touches private keys; agents pair it with a separate Starknet MCP (e.g. `starknet-agentic`) for signing and tx submission.

```bash
cd mcp-server && npm install && npm run build && npm start
```

Env:
- `STARKNET_RPC_URL=http://localhost:5050`
- `WORLD_ADDRESS=…`
- `COMMIT_REVEAL_ADDRESS=…`
- `TORII_URL=http://localhost:8080` (optional, preferred for reads)

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

Active playtest bugs and upcoming features live as GitHub issues #1–#10 on `modeofO/siege`. Issue #10 is the "dogfood the stack" meta-audit, blocked on the others. Check issues before starting new work.

## License

MIT
