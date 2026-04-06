# Siege Dojo — Development Guide

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
  siege_dojo,siege_dojo-resolution
```

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

```
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_ACTIONS_ADDRESS=0x02e7aaec86013c6f4719227f995b91bb935571eb48ae11fed039cd4345ba0d2b
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x06c61d75ff72a9b5ccf82cd78b48777f3486d10e8077cf9456a6feff0a0273c8
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0xe1f7c5fd7bd557ff5c69db03b49a62e40f3cc01ee11524ef862a71952ddcfe
```

### Session policies (Cartridge Controller)

Defined in `providers.tsx`. Covers all gameplay entrypoints for gasless, no-prompt transactions:
- `create_match` on actions contract
- `commit`, `reveal_attacker`, `reveal_defender` on commit_reveal contract

### Contract calls (`contracts.ts`)

- `DEVNET_TX_OPTS` (skip validation, zero gas) applied only in devnet mode
- Sepolia mode passes no tx options — Cartridge paymaster handles fees

### Other notes
- Starknet.js v8: `new Account({ provider, address, signer: privateKey })`
- `BigInt(0)` not `0n` (tsconfig targets ES2017)
- `bun run test` runs vitest (39 tests)

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
sozo test                                            # local (36 tests, includes 1v1)
docker compose run --rm builder sozo test            # via Docker
```

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

5 craftable abilities stored as ERC-1155 tokens on the `AbilityToken` contract (token IDs 1–5). Tradeable, transferable, visible in the Cartridge wallet.

| ID | Ability | Cost | Effect (Phase 2B) |
|----|---------|------|-------------------|
| 1 | Siege Sword | 3 Iron + 2 Wood | Max damage (10) to one gate |
| 2 | Stone Cloak | 3 Stone + 2 Linen | Block all gate damage |
| 3 | Ember Blast | 3 Ember + 2 Seeds | 5 direct damage bypassing gates |
| 4 | Hex | 2 Iron + 2 Stone + 1 Ember | Opponent budget -7 |
| 5 | Fortify | 2 Stone + 2 Linen + 1 Wood | Double all defense |

**Crafting flow:** frontend multicalls `approve` on each required ERC-20 then `craft_ability(id)` on `crafting_1v1`. The Dojo contract burns resources (`transfer_from` to `0x1`) and calls `AbilityToken.mint(caller, id, 1)`. Token IDs match ability IDs 1:1.

**AbilityToken contract:** pure Starknet ERC-1155 (not a Dojo contract) in `src/tokens/ability_token.cairo`. Supporting modules: `base64.cairo` (encoder), `ability_metadata.cairo` (JSON builder). Three roles:
- `admin` — rotates minter/burner and per-ability SVGs (set at deploy to deployer address, immutable)
- `minter` — only `crafting_1v1` can mint
- `burner` — set when Phase 2B ships; starts at `0x0` (abilities are immortal until then)

**Metadata:** fully on-chain. `uri(token_id)` returns `data:application/json;base64,...` with inline SVG image — no external server, no IPFS. Built at read time by `ability_metadata.cairo` using admin-settable per-ability SVGs stored in contract storage. Updating art requires one `set_ability_svg(ability_type, svg)` admin transaction per ability — no redeploy.

**Sepolia addresses:**
- `crafting_1v1`: `0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235`
- `AbilityToken` (v2): `0xe1f7c5fd7bd557ff5c69db03b49a62e40f3cc01ee11524ef862a71952ddcfe`

**Historical note:** Phase 2A used a `PlayerAbilities` Dojo model with u8 counters. Phase 2A.5 dropped it in favor of ERC-1155 so abilities would show in the wallet. The old model is still orphaned on-chain but not read by any live code.

## Project Structure

- `src/systems/` — Cairo contracts (actions, commit_reveal, resolution)
- `src/models/` — Dojo ECS models (match_state, node_state, commitment, round_moves)
- `frontend/src/lib/` — Game logic (gameState.ts, crypto.ts, contracts.ts)
- `frontend/src/components/` — UI components (GateDisplay, NodeMap, VaultDisplay, etc.)
- `scripts/` — Dev scripts (local-dev.sh, play-opponent.js, run-test.sh, test-reveal.js)
- `scripts/siege-cli/` — 1v1 terminal CLI (Cartridge Controller + private key fallback)
- `mcp-server/` — AI agent MCP tools
- `dojo_dev.toml` — Local dev config (gitignored, has dev private keys)
- `dojo_sepolia.toml` — Sepolia config (reads env vars for credentials)
