# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Siege Dojo is a Starknet / Dojo ECS strategy game. Two gameplay modes coexist in the same world (`siege_dojo` namespace):

1. **1v1 arena matches** (`*_1v1` contracts) — commit-reveal 1v1 rounds with abilities, traps, and gate modifiers. This is where most active development happens.
2. **World metagame** (`world_system`, `conquest`) — a persistent hex-grid map of parcels. Players register a kingdom, own home parcels, stake ERC-1155 abilities in matches, claim parcels on win, pillage neighbors, upgrade tiers, and attack neighbors asynchronously via preset defenses.

Both modes read the same resource tokens, ability tokens, and `MatchCounter`.

## Frontend terminology (important for new code)

The **frontend** uses renamed labels to avoid collision with Realms: Eternum branding. The **backend** (Cairo models, function names, entrypoint names) keeps the original terminology:

| Backend (unchanged) | Frontend label (shown to players) |
|---|---|
| `World`, `/world` | `THE MARCHES` |
| `PlayerKingdom`, "kingdom" | `Your Hold` |
| `register_player` button copy | `CLAIM YOUR HOLD` / `ESTABLISH HOLD` |

Don't rename backend models or function names — only update the UI copy. When writing new UI, use `Hold` / `Marches` language.

## Open work tracker

Current playtest bug backlog + upcoming features are tracked as GitHub issues #1–#10 on `modeofO/siege`. Issue #10 is the "dogfood the stack" meta-audit, blocked on all the others. Check the issue list for priorities before starting new work.

## Toolchain

| Tool | Version | Notes |
|------|---------|-------|
| sozo | **v1.8.6** | Must be >= v1.8.1 for Sepolia (blake2s CASM hashing) |
| scarb | 2.13.1 | Matches dojo v1.8.0 core dependency |
| cairo | 2.13.1 | |
| dojo deps | v1.8.0 | In `Scarb.toml` |
| starkli | 0.4.2 | For account management only |

## Local Dev

```bash
./scripts/local-dev.sh        # starts katana + builds + migrates + starts torii
cd frontend && npm run dev    # frontend on localhost:3000
docker compose down           # tear down
```

- Dojo images have NO ARM64 builds — all services use `platform: linux/amd64` (Rosetta)
- Katana CLI flags: `--http.addr` (not `--host`), `--http.cors_origins "*"` for CORS
- Dev accounts change per katana version — current accounts (seed 0, katana 1.7.0) in `frontend/src/app/providers.tsx`

## Sepolia

**World:** `0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0`
**RPC:** `https://api.cartridge.gg/x/starknet/sepolia` (spec v0.9.0 — required by sozo v1.8.6)

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

Full Sepolia deploy was run 2026-04-12 — see `dojo_dev.toml` must exist locally (gitignored). The docker builder image (`docker compose run --rm builder sozo ...`) is the safe path for Sepolia migrations since it ships with sozo 1.8.6.

**Torii:** `https://api.cartridge.gg/x/siege-dojo/torii` (hosted on Slot)
- GraphQL: `https://api.cartridge.gg/x/siege-dojo/torii/graphql`
- SQL: `https://api.cartridge.gg/x/siege-dojo/torii/sql`
- Config: `torii_sepolia.toml`

**starkli uses a different RPC spec** — use the v0_8 endpoint:
`https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8`

## Dojo Permissions

- `sozo migrate` syncs 0 permissions by default
- Must run `sozo auth grant writer` after every migration (local and Sepolia)
- `[[writers]]` in dojo_dev.toml is NOT supported in this sozo version — use CLI grant
- `local-dev.sh` handles this automatically for local

## Frontend

### Dual-mode provider (`providers.tsx`)

The frontend supports two network modes, controlled by `NEXT_PUBLIC_NETWORK`:

| Mode | Value | Provider | Wallet |
|------|-------|----------|--------|
| **Dev** (default) | `devnet` | 4 hardcoded Katana accounts | Dropdown selector |
| **Sepolia** | `sepolia` | Cartridge Controller + `@starknet-react/core` | Connect button (session-based) |

**Key exports from `providers.tsx`:**
- `useAccount()` — unified hook, returns `{ account, address, status }` in both modes
- `useDevAccounts()` — dev-only: `{ accounts, selectedIndex, setSelectedIndex }`
- `isDevMode()` — boolean check for conditional rendering

### Sepolia env vars (`frontend/.env.local`)

Only `NEXT_PUBLIC_NETWORK` + `NEXT_PUBLIC_TORII_URL` + `NEXT_PUBLIC_RPC_URL` are strictly required — each contract address has a hardcoded fallback in `lib/contracts*.ts`, but set them explicitly whenever redeploying so the frontend doesn't silently pin to stale code.

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

# 2v2 actions / commit_reveal (legacy mode)
NEXT_PUBLIC_ACTIONS_ADDRESS=0x02e7aaec86013c6f4719227f995b91bb935571eb48ae11fed039cd4345ba0d2b
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x06c61d75ff72a9b5ccf82cd78b48777f3486d10e8077cf9456a6feff0a0273c8

# 1v1 mode contracts
NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b

# World metagame
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x2f57935f694040aec8cf89ecd4c7a404bb33819996c419fd7af6fc8971b8c4a
NEXT_PUBLIC_CONQUEST_ADDRESS=0x1e7598c506f3947bee5d850f46762a8a25cc2680a345f72e70b333671b2bd2e

# Tokens + crafting
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb
```

`NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS` and `NEXT_PUBLIC_CONQUEST_ADDRESS` are read by `lib/conquest.ts`, `lib/pillage.ts`, `app/world/page.tsx`, `lib/factions.ts`, and the preset-defense hooks. Live Sepolia addresses above are the current deployment (as of 2026-04-12).

### Session policies (Cartridge Controller)

Defined in `providers.tsx`. Covers gameplay entrypoints for gasless, no-prompt transactions. **Known incomplete** — see open issue #5 (auto-reveal stuck because sessions prompt for out-of-policy calls). Before adding new on-chain entrypoints that users trigger from the UI, make sure they're added here or the wallet will prompt on every tx.

### Contract calls (`contracts.ts`)

- `DEVNET_TX_OPTS` (skip validation, zero gas) applied only in devnet mode
- Sepolia mode passes no tx options — Cartridge paymaster handles fees

### Other notes
- Starknet.js v8: `new Account({ provider, address, signer: privateKey })`
- `BigInt(0)` not `0n` (tsconfig targets ES2017)
- `cd frontend && npm run test` runs vitest; `npm run lint` runs eslint; `npm run dev` uses `next dev --experimental-https`

## Torii GraphQL Quirks

- `match_id` must be a quoted string: `where: { match_id: "3" }`
- `round` must be an unquoted integer: `where: { round: 1 }`
- Mixing these up causes silent query failures (returns null, no error)

## Gameplay Testing

```bash
cd scripts && MATCH_ID=3 npx tsx play-opponent.js   # 3 bot players
cd scripts && bash run-test.sh                       # full automated round
```

## Contract Tests

```bash
sozo test                                            # local (~135 tests across 19 files)
docker compose run --rm builder sozo test            # via Docker
```

Coverage: `test_actions`, `test_actions_1v1`, `test_commit_reveal`, `test_commit_reveal_1v1`, `test_resolution`, `test_resolution_1v1`, `test_modifiers_1v1`, `test_traps_1v1`, `test_abilities_1v1`, `test_ability_tiers`, `test_ability_token`, `test_events`, `test_hex`, `test_world`, `test_staked_match`, `test_conquest`, `test_kingdom_tiers`, `test_reputation`, `test_pillaging`.

## 1v1 Mode

Simplified 1v1 game mode for mechanics testing. Each player controls both attack and defense with a shared budget of 10 (+node bonuses). Vault HP starts at 50.

### 1v1 Contracts

Same world as 2v2 (`siege_dojo`). Deployed to Sepolia alongside existing contracts.

| Contract | Address |
|----------|---------|
| `actions_1v1` | `0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c` |
| `commit_reveal_1v1` | `0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80` |
| `resolution_1v1` | `0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b` |

Models: `MatchState1v1`, `RoundMoves1v1`, `RoundModifiers1v1`, `RoundTraps1v1`. Reuses `Commitment`, `NodeState`, `MatchCounter`.

### CLI (`scripts/siege-cli/`)

```bash
cd scripts/siege-cli

# Cartridge Controller (default — first run opens browser)
npx tsx siege-cli.ts --create --opponent 0x<addr>
npx tsx siege-cli.ts --match <id>

# Private key fallback (local dev / Sepolia with raw key)
npx tsx siege-cli.ts --match <id> --use-private-key

# JSON mode (scripting)
npx tsx siege-cli.ts --match <id> --json '{"attack":[3,2,1],"defense":[2,1,0],"repair":1,"nodes":[0,0,0]}'
```

### Budget Allocation

Each player splits their budget across:
- Attack: 3 pressure points (p0, p1, p2)
- Defense: 3 gates (g0, g1, g2) + repair (max 3)
- Nodes: Forge (nc0), Quarry (nc1), Grove (nc2) — controlling a node awards resource tokens each round

### Gate Modifiers

Each round, 3 gates independently roll a modifier via Cartridge vRNG:
- **Normal** (60%): No change
- **Narrow Pass** (10%): Attack and defense capped at 3
- **Mirror Gate** (10%): Attack/defense values swap
- **Deadlock** (10%): No damage at this gate
- **Reflection** (10%): Damage reflects to other gates

Modifiers are visible to both players before allocation. vRNG uses `request_random` + `consume_random` — the frontend wraps `create_match_1v1` and `reveal` calls in multicall with `request_random`.

### Node Traps

Players can trap resource nodes they own:
- **Cost**: 2 budget points per trap
- **Effect**: When opponent takes a trapped node, they take 5 vault damage (post-repair, not repairable)
- **Constraints**: Can only trap nodes you own. Trapping gives up contesting (your contest spend = 0)
- **Hidden**: Traps are committed in the Poseidon hash and revealed with all other allocations
- **Consumed**: Traps last one round — must be re-placed each round
- **Model**: `RoundTraps1v1` (separate from `RoundMoves1v1` due to Dojo schema upgrade constraints)

Allocation array is 13 elements: `[p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, trap0,trap1,trap2]`
Poseidon hash is 14 elements (salt + 13 allocations).

### Resource Tokens

6 ERC-20 tokens (0 decimals) awarded for controlling resource nodes:

| Node | Token 1 | Token 2 |
|------|---------|---------|
| Forge (nc0) | IRON | LINEN |
| Quarry (nc1) | STONE | WOOD |
| Grove (nc2) | EMBER | SEEDS |

Each round, controlling a node mints 1 of each paired token to the player. Resources persist across matches and are tradeable. Token addresses stored in `ResourceConfig` model.

### Abilities

10 craftable abilities stored as ERC-1155 tokens on the `AbilityToken` contract (token IDs 1–10). Two tiers: IDs 1–5 are T1, IDs 6–10 are T2 (same 5 types, stronger effects). Tradeable, transferable, visible in the Cartridge wallet.

Helpers (match on both Cairo and TS sides):
- `ability_type(id) = ((id - 1) % 5) + 1`  (1..5)
- `ability_tier(id) = ((id - 1) / 5) + 1`  (1 or 2)

| Type | Name | T1 cost / effect | T2 cost / effect |
|------|------|------------------|------------------|
| 1 | Siege Sword | 3 Iron + 2 Wood — set attack on target gate to 5 | 30 Iron + 20 Wood + 10 Ember — set attack to 10 |
| 2 | Stone Cloak | 3 Stone + 2 Linen — halve gate damage | 30 Stone + 20 Linen + 10 Seeds — zero all gate damage |
| 3 | Ember Blast | 3 Ember + 2 Seeds — 2 direct damage bypassing gates | 30 Ember + 20 Seeds + 10 Iron — 6 direct damage |
| 4 | Hex | 2 Iron + 2 Stone + 1 Ember — reduce opponent total damage by 3 | 20 Iron + 20 Stone + 10 Ember + 10 Wood — reduce by 8 |
| 5 | Fortify | 2 Stone + 2 Linen + 1 Wood — +1 defense at all gates | 20 Stone + 20 Linen + 10 Wood — double all defense |

T2 crafting requires burning 1 of the matching T1 ability in addition to the resources (`requiresT1: true` in `frontend/src/lib/craftingContracts.ts`).

**Crafting flow:** frontend multicalls `approve` on each required ERC-20 then either `craft_ability(id)` (T1) or `craft_ability_tier2(type)` (T2) on `crafting_1v1`. The Dojo contract burns resources (`transfer_from` to `0x1`), burns the T1 token if tiering up, and calls `AbilityToken.mint(caller, new_id, 1)`. See `frontend/src/lib/craftingContracts.ts` → `ABILITIES`, `craftAbility`, `craftAbilityTier2`.

**Resolution effects:** applied by `resolution_1v1.cairo` during the round, and by `conquest.cairo` for async parcel attacks. Effects are tier-aware — edit both places when rebalancing.

**AbilityToken contract:** pure Starknet ERC-1155 (not a Dojo contract) in `src/tokens/ability_token.cairo`. Supporting modules: `base64.cairo` (encoder), `ability_metadata.cairo` (JSON builder). Three roles:
- `admin` — rotates minter/minter2/burner and per-ability SVGs (set at deploy to deployer address, immutable)
- `minter` — primary minter; currently `crafting_1v1` (for craft flow)
- `minter2` — secondary minter; currently `world_system` (for starter-ability mint on register + staked-match settlement). Added in v3 (deployed 2026-04-12) because both crafting_1v1 and world_system need mint access.
- `burner` — set when Phase 2B ships; starts at `0x0` (abilities are immortal until then)

**Metadata:** fully on-chain. `uri(token_id)` returns `data:application/json;base64,...` with inline SVG image — no external server, no IPFS. Built at read time by `ability_metadata.cairo` using admin-settable per-ability SVGs stored in contract storage. Updating art requires one `set_ability_svg(ability_type, svg)` admin transaction per ability — no redeploy.

**Sepolia addresses:**
- `crafting_1v1`: `0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235`
- `AbilityToken` (v3, with `minter2`): `0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb`
- `world_system`: `0x2f57935f694040aec8cf89ecd4c7a404bb33819996c419fd7af6fc8971b8c4a`
- `conquest`: `0x1e7598c506f3947bee5d850f46762a8a25cc2680a345f72e70b333671b2bd2e`

(AbilityToken v2 at `0xe1f7c5fd...` is still on-chain but orphaned — v3 superseded it when the minter2 pattern was added. Torii + ResourceConfig + frontend all point at v3.)

**Historical note:** Phase 2A used a `PlayerAbilities` Dojo model with u8 counters. Phase 2A.5 dropped it in favor of ERC-1155 so abilities would show in the wallet. The old model is still orphaned on-chain but not read by any live code.

## World Metagame

The world layer wraps 1v1 matches in a persistent hex-grid map. Entry points live in `src/systems/world_system.cairo` and `src/systems/conquest.cairo`; frontend lives in `frontend/src/app/world/` + `frontend/src/lib/{conquest,pillage,reputation,tiers,worldState}.ts`.

### Players and kingdoms

- `PlayerKingdom` (`src/models/player_kingdom.cairo`) — per-player record: 3 home parcels (`home_0/1/2`), `parcel_count`, `tier`, `total_wins`, `last_drip_time`, `free_craft_used`, `registered`.
- Registration: `world_system.register_player(home_types)` picks 3 unclaimed parcels (one of each type) as homes.
- **Tiers** (keyed off `total_wins`): Polis (0) → Strategos (1, 10 wins) → Hegemonia (2, 30 wins) → Basileia (3, 60 wins). See `tier_wins_required`, `tier_parcel_cap`, `tier_ability_slots`, `tier_preset_count` in `world_system.cairo`.
- **Per-tier caps**: parcels beyond the 3 homes are capped at 2 / 5 / 8 / 12; ability slots in a staked match at 1 / 2 / 3 / 4; conquest preset-defense slots at 1 / 2 / 3 / 4.
- `upgrade_kingdom()` is the explicit step that advances tier once `total_wins >= tier_wins_required(next_tier)`.

### Parcels and resource drip

- `Parcel` (`src/models/parcel.cairo`) — `parcel_id`, `col/row`, `parcel_type` (0 Forge / 1 Quarry / 2 Grove), `owner`, `is_home`.
- `WorldConfig` (singleton, `id = 0`) — `total_parcels`, `next_parcel_id`, `initialized`. Initialized once via `world_system.initialize_world`.
- `claim_drip()` mints paired resource tokens for each parcel the caller currently owns on a cooldown; **home parcels that are actively pillaged by someone else are skipped** (see Pillaging).
- Hex neighbor math: `src/utils/hex.cairo` — offset coordinates; `is_neighbor` powers adjacency checks for conquest and pillage.

### Staked matches (1v1 on the world map)

- `create_staked_match(opponent, abilities[])` and `join_staked_match(match_id, abilities[])` on `world_system` — both players stake a tier-bounded list of ability token IDs.
- `MatchStakes1v1` (`src/models/match_stakes_1v1.cairo`) — stores each side's up-to-3 staked token IDs and a `settled` flag.
- On match end, the winner calls `settle_match(match_id)` — winner takes all staked abilities (re-mints on `AbilityToken`), `PlayerKingdom.total_wins++`, `MatchRecord(winner, loser)` is updated, and the winner may become eligible to pillage the loser if they share an adjacent parcel.
- `MatchRecord` (`src/models/match_record.cairo`) — head-to-head wins/losses, keyed `(player, opponent)`.

### Claiming parcels

- `claim_parcel(match_id, parcel_id)` — winner takes a single non-home parcel owned by the loser, gated on: kingdom registered, parcel cap, and hex adjacency to one of the claimer's existing parcels.

### Pillaging

- `initiate_pillage(match_id, home_parcel_id)` — requires a valid `PillageEligibility` (granted on match win against a neighbor) and an adjacency check on the target's home parcel. Creates a `Pillage` record with `start_time`, `expires_at`, `active = true`.
- While a home is under active pillage, the defender's `claim_drip` skips that home parcel; the pillager calls `claim_pillage_drip(home_parcel_id)` to siphon the drip instead.
- A new match loss by the pillager to the target **breaks** the active pillage (see `break_pillage` logic in `world_system`).
- `PillageEligibility` is single-use and expires; `Pillage` expires after `expires_at`.

### Conquest (async preset-defense attacks)

`src/systems/conquest.cairo` — separate contract from the commit-reveal 1v1 flow; lets a player attack any non-home parcel of a neighbor in a single transaction against the target's pre-committed preset defense, resolved via Cartridge vRF.

- `set_preset_defense(index, p0..p2, g0..g2)` — defender registers up to `tier_preset_count(tier)` presets (budget 12). Stored on `PresetDefense` (`src/models/preset_defense.cairo`).
- `initiate_conquest(target_parcel, p0..p2, g0..g2, ability_id, ability_target)` — attacker spends budget 10, vRF picks which of the defender's presets to fight, damage is computed as per-gate `max(atk - def, 0)` summed both ways (attacker HP = 10, defender HP = 15), abilities apply tier-aware effects mirroring `resolution_1v1`. On win the attacker takes the parcel (subject to parcel cap + adjacency + not-home checks).
- Constants live at the top of `conquest::conquest`: `ATTACKER_BUDGET = 10`, `DEFENDER_BUDGET = 12`, `ATTACKER_HP = 10`, `DEFENDER_HP = 15`.
- Ability ownership is verified on-chain by calling `balance_of` on the `AbilityToken` ERC-1155 before applying effects.

### Reputation

- `PlayerReputation` (`src/models/player_reputation.cairo`) — `total_losses`, `current_streak` (signed i32), `best_streak`, `bracket` (0..4).
- `calculate_bracket(wins, losses)` in `world_system.cairo` buckets players by games played and win rate (Unranked / Bronze / Silver / Gold / Diamond thresholds at 10 / 30 / 60 / 100 games).
- Updated automatically on `settle_match`. Frontend display in `frontend/src/lib/reputation.ts`.

### Frontend touch points

- `app/world/page.tsx` — the hex-grid world view.
- `components/HexGrid.tsx`, `components/KingdomUpgrade.tsx`, `components/RegisterKingdom.tsx`.
- `lib/conquest.ts` — `CONQUEST_ADDRESS`, preset-defense reads, `useActivePillages`, `usePillageEligibilities`, `usePresetDefense`.
- `lib/pillage.ts` — pillage reads and call builders.
- `lib/reputation.ts` — reputation reads + bracket labels.
- `lib/tiers.ts` — tier metadata shared by the UI.
- `lib/worldState.ts` — world/parcel/player queries.

## Project Structure

- `src/systems/` — Cairo contracts. 2v2: `actions`, `commit_reveal`, `resolution`. 1v1: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`, `crafting_1v1`. World: `world_system`, `conquest`.
- `src/models/` — Dojo ECS models. Core: `match_state`, `node_state`, `commitment`, `round_moves`, `match_counter`, `events`, `resource_config`. 1v1: `match_state_1v1`, `round_moves_1v1`, `round_modifiers_1v1`, `round_traps_1v1`, `match_abilities_1v1`, `match_stakes_1v1`. World: `parcel`, `player_kingdom`, `player_reputation`, `world_config`, `preset_defense`, `match_record`, `pillage`, `pillage_eligibility`.
- `src/tokens/` — non-Dojo Starknet contracts (`ability_token.cairo` ERC-1155, `base64.cairo`, `ability_metadata.cairo`).
- `src/utils/hex.cairo` — offset-coordinate hex math (neighbors, distance).
- `frontend/src/app/` — Next.js routes: `/` (splash with "⚔ ENTER THE MARCHES ⚔" CTA), `/match` (2v2, UI-hidden legacy), `/match-1v1` (1v1 create/join/[id]), `/craft`, `/world` (hub — THE MARCHES + Your Hold summary + BATTLES section + FactionPanel). Compass top-left links to the external docs site (https://siege-mauve.vercel.app/). No more `/how-to-play` — use the docs site instead.
- `frontend/src/lib/` — `contracts.ts` (2v2), `contracts1v1.ts` (1v1), `craftingContracts.ts`, `abilityToken.ts`, `conquest.ts`, `pillage.ts`, `reputation.ts`, `tiers.ts`, `worldState.ts`, `gameState.ts`, `gameState1v1.ts`, `crypto.ts`, `useResourceBalances.ts`, `toriiSubscription.ts`.
- `frontend/src/components/` — per-feature UI (`GateDisplay`, `NodeMap`, `VaultDisplay`, `AllocationForm1v1`, `AbilitySelector`, `HexGrid`, `KingdomUpgrade`, `RegisterKingdom`, `PressurePointAllocator`, `Navbar`, `ConnectWallet`, `AccountSelector`, `Timer`, `RoundHistory`, `MatchStatus`, `EndScreen`, `CompassLink`, `BookLink`).
- `scripts/` — Dev scripts (`local-dev.sh`, `play-opponent.js`, `run-test.sh`, `test-reveal.js`, token deploy scripts). Has its own `package.json` — run `npm install` inside `scripts/` before using tsx scripts.
- `scripts/siege-cli/` — 1v1 terminal CLI (Cartridge Controller + private key fallback).
- `mcp-server/` — AI agent MCP tools.
- `dojo_dev.toml` — Local dev config (gitignored, has dev private keys).
- `dojo_sepolia.toml` — Sepolia config (reads env vars for credentials).

## In-repo design docs

Before planning or implementing any non-trivial feature, read the matching spec / plan — they are usually more current than this file:

- `skill/SKILL.md` — development skill focused on the 2v2 mode: architecture, hash layouts, common tasks, debugging checklist. Still the best starting point for commit-reveal and resolution work.
- `docs/superpowers/specs/` — design specs. Recent: `2026-04-08-game-direction-redesign.md`, `2026-04-09-reputation-system-design.md`, `2026-04-10-ability-tiers-design.md`, `2026-04-10-conquest-revisions-design.md`, `2026-04-10-pillaging-system-design.md`, `2026-04-10-alliance-faction-system-design.md`, `2026-04-10-player-docs-site-design.md`.
- `docs/superpowers/plans/` — implementation plans tied to the specs above (`kingdom-tiers`, `reputation-system`, `ability-tiers`, `conquest-revisions`, `pillaging-system`, `alliance-faction-system`, `faction-ui`).
- `docs/blender-style-guide.md` — art style guide.
- `README.md` — public-facing project overview (may lag the metagame work).
- `SEPOLIA_MIGRATION_SUMMARY.md` — one-shot notes from the v1.8.1 blake2s migration; kept for historical context.
