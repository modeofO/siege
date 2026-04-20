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

**World:** `0x07accd84355fc37a018f314d5b0460d5f8a4a69cb1ebb1836f3a58e22073b584`
**RPC:** `https://api.cartridge.gg/x/starknet/sepolia` (spec v0.9.0)
**Torii:** `https://api.cartridge.gg/x/siege-dojo/torii` (GraphQL, SQL, gRPC via Slot)

### Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| `actions_1v1` | `0x15d867f69bae78dc951df8359d185064b5544b3c73cf66aa4cba9388e6f2c85` |
| `commit_reveal_1v1` | `0xdbd65d19971d67c3f03cfa7220149ed001676d62eff92ffdd8af89e60baa40` |
| `resolution_1v1` | `0x563b2674aeb93c1d7e2a304de869995f001df49d6294dd010014b0227c79bb2` |
| `crafting_1v1` | `0x5d46148c9a4ec5e3e06dfc7efb6d28f4148c684d2811543d7b787cf4de3843` |
| `world_system` | `0x727c57716a650660de0466efb0572ccab13dfebb1e5bf854a38acd36cda4681` |
| `conquest` | `0x40ba55faef2a5e49a2bbb6c6a9a602d7040102b688c632039ac445bed558b00` |
| `AbilityToken` (ERC-1155, v3) | `0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb` |
| `actions` (legacy 2v2) | `0x289b59822dfd83da32f690dd3d5dc1ff3fb19f5e51ccf3f6306167dbb671d10` |
| `commit_reveal` (legacy 2v2) | `0x7a7b68dea634acb2fedca5336de6893d3c82ab882b6133a5ed5e4e2eefc3547` |

### Frontend `.env.local` for Sepolia

Only `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_TORII_URL`, and `NEXT_PUBLIC_RPC_URL` are strictly required (contract addresses have hardcoded fallbacks in `lib/contracts*.ts`), but set all of them explicitly when redeploying so the frontend never silently pins to stale code.

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x15d867f69bae78dc951df8359d185064b5544b3c73cf66aa4cba9388e6f2c85
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0xdbd65d19971d67c3f03cfa7220149ed001676d62eff92ffdd8af89e60baa40
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x563b2674aeb93c1d7e2a304de869995f001df49d6294dd010014b0227c79bb2
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x5d46148c9a4ec5e3e06dfc7efb6d28f4148c684d2811543d7b787cf4de3843
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x727c57716a650660de0466efb0572ccab13dfebb1e5bf854a38acd36cda4681
NEXT_PUBLIC_CONQUEST_ADDRESS=0x40ba55faef2a5e49a2bbb6c6a9a602d7040102b688c632039ac445bed558b00
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb

# Legacy 2v2 (UI hidden)
NEXT_PUBLIC_ACTIONS_ADDRESS=0x289b59822dfd83da32f690dd3d5dc1ff3fb19f5e51ccf3f6306167dbb671d10
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x7a7b68dea634acb2fedca5336de6893d3c82ab882b6133a5ed5e4e2eefc3547
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
