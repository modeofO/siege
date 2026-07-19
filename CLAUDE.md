# CLAUDE.md

This file gives Claude Code current working context for this repository. The source of truth is the code, manifests, and config in this checkout.

## Current Product Shape

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace.

Active systems:

- 1v1 commit-reveal battles: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`, `matchmaking`.
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

## Toolchain

| Tool                 | Version / source            |
| -------------------- | --------------------------- |
| Cairo                | 2.13.1                      |
| Scarb                | 2.13.1                      |
| Dojo dependency      | v1.8.0                      |
| Katana/Torii         | `ghcr.io/dojoengine/dojo:v1.8.0` containers |
| Frontend             | Next 16.2.6, React 19.2.3   |
| Starknet.js frontend | 8.9.2                       |
| Starknet.js MCP      | 8.9.2                       |

Always run sozo through the Docker builder — the locally installed sozo is older than the project toolchain:

```bash
docker compose run --rm builder sozo build
docker compose run --rm builder sozo test
```

## Core Battle Rules

1v1 state lives in `MatchState1v1`. Vault HP starts at 50. Matches end when a vault hits 0 or after round 10. `create_match_1v1` requires the caller to have a registered Hold (spam guard); staked matches go through `world_system.create_staked_match`, which guards separately.

Each round:

1. Both players commit a Poseidon hash.
2. Both players reveal the exact allocation.
3. `resolution_1v1.resolve_round` applies modifiers, abilities, repair, damage, node contests, traps, resource mints, and next-round modifiers.

Commit and reveal deadlines are 300 seconds each (`commit_reveal_1v1.cairo`).

Reveal hash order:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Budget is `10 + owned_resource_nodes + max(0, round - 6)` (endgame escalation, rounds 7-10). Trap cost is 2 each. Repair costs 2 budget per HP and is uncapped during resolution.

Matchmaking (unstaked only): `matchmaking.queue_for_match` is a single-slot
queue — re-queue if already head, enqueue if the slot is empty/stale (fixed
600 s validity window, NO heartbeat — every poke is a sponsored tx, so
clients only poll Torii and re-queue after expiry), otherwise pair with the
waiting player via `create_match_1v1_delegated` (waiting player = player_a).
Clients always send the `[vrf request_random, queue_for_match]` multicall
(the contract consumes unconditionally); `leave_queue` is always bare.
Pairing is discovered by polling the `QueueStatus` model.

Node contests resolve before gate damage: owning node `i` grants +1 defense at gate `i` the same round it is captured or held, plus +1 budget next round.

Stone Cloak T1 halves gate damage; T2 halves gate damage and negates the opponent's repair that round (full gate immunity was removed in the balance pass).

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

`settle_match` handles ability transfer/refund, win stats, reputation, match records, loser's non-home release, and pillage eligibility in a single map scan — it does not mint resources (removed to keep the tx sponsorable; players use `claim_drip`).

`claim_parcel` claims one unclaimed adjacent parcel after a settled staked-match win and assigns its parcel type.

Conquest attacks adjacent non-home parcels in one transaction. Attacker budget is 10, defender preset budget is 12, attacker HP is 10, defender HP is 15, and ties go to the defender. Ally reinforcement slots are deduplicated per ally player — an ally with several parcels adjacent to the target fills only one of the 3 slots. Pillage window is 24 hours (`PILLAGE_WINDOW = 86400`). Defenders with no presets (and no ally reinforcement) defend with the fixed default 2/2/2 assault + 2/2/2 gate defense, so every Hold is always attackable.

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

## Mainnet (active)

Production network. Siege is deployed to Starknet mainnet and the Vercel
frontend points here. Same world seed as sepolia (`siege_dojo_v9`) so the world
address matches, but system/token addresses differ — always read them from
`manifest_mainnet.json`.

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73` (deployed at block `11948230`)
- Profile: `sozo -P mainnet` via the Docker builder; config in `dojo_mainnet.toml`.
- RPC (sozo): a Lava `v0_9` endpoint set in `dojo_mainnet.toml` — Cartridge's mainnet RPC serves spec `0.10.2`, which sozo v1.8 cannot consume.

Contract addresses come from `manifest_mainnet.json`. Current important tags:

- `siege_dojo-actions_1v1`: `0x47dfe0aaa197fb59299890a2acef546bb532d0a8796034aa8fafa00f0d54571`
- `siege_dojo-commit_reveal_1v1`: `0x382f07de9095da6d2d51fb4d465d9451265c2d72aa58f32fd87ccff4a6c25cf`
- `siege_dojo-resolution_1v1`: `0x425943e5c3322762f1feb8eb1599a3ab64e8a55c8c516948f91511d266a1f16`
- `siege_dojo-crafting_1v1`: `0x1f8085720ec1c5b153c273b522878365c2c19d55a22141c70e907e27df19ad3`
- `siege_dojo-world_system`: `0x186b8b191ec895a79c3aa10e7deeb0f69b85d2cdbeb113a4643a3017c3723b0`
- `siege_dojo-conquest`: `0x5e8997406aa1d0fb7a33a4b17e94ff8c5708ddaf4c8a7de812a31b2199e404f`
- `siege_dojo-matchmaking`: `0x44da6123cb69a66ff7f5d7756b269841b28becd5ac6951f94c2d397c5819fef`
- `AbilityToken` (ERC-1155): `0x583fb029535b4f18d267ea1462ffd7f3a785edcd873c4fd305f8d787e3ccbcc`
- Cartridge VRF provider: `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f` (same address as sepolia; verified live)

Resource ERC-20 addresses:

| Resource | Address |
| -------- | ------- |
| Iron  | `0x2be5138b0e987d3f84fe7850861a17b4a608a9f583c45c8d647486c304d8947` |
| Linen | `0x1df4ab0d418e43322f1134470a959d59da22cd7c5b03f9ba1ae375f271589c2` |
| Stone | `0x4a1acd44fc316535f126ec06d7a60a0de356f6e3530c0940bd8c952c9949401` |
| Wood  | `0x5fdb13ea34654956ca7fdda8da6d5ee3fb741d1c14ffe944d59e4288a7976c` |
| Ember | `0x1b784f80e5b87cbb6138954cd2016de77f7e641fe55c51baaa1c23908d35376` |
| Seeds | `0x4a6655dafd9505a9c96362475c6ad0f1744ba831c7503bf5b7d762f5f8613a7` |

Torii: `https://siege-torii-mainnet-production.up.railway.app` (Railway service
`siege-torii-mainnet` in project `siege-katana`, source `infra/torii-mainnet/`).
Its RPC is the Alchemy public demo `v0_9` endpoint because torii 1.8.3 cannot
consume Cartridge's spec 0.10.2 — swap to a dedicated Alchemy key if indexing
lags. Redeploy: `railway up ./infra/torii-mainnet --path-as-root --service siege-torii-mainnet`.

Deployment sequence (Starknet 0.14 requires the `--use-blake2s-casm-class-hash`
flag on both `migrate` and `auth grant`; deployer account
`0x0351d9177810f624efa1ee1eba0648dab27ed38f74c45ab23aa762dbbf6c9f78`, keystore
in `~/.siege-mainnet/`):

```bash
source deploy.mainnet.env   # git-ignored; exports DOJO_ACCOUNT_ADDRESS / DOJO_PRIVATE_KEY

docker compose run --rm builder sozo build -P mainnet
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY \
  builder sozo -P mainnet migrate --use-blake2s-casm-class-hash
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY \
  builder sozo -P mainnet auth grant writer --use-blake2s-casm-class-hash \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1 \
  siege_dojo,siege_dojo-crafting_1v1 \
  siege_dojo,siege_dojo-world_system \
  siege_dojo,siege_dojo-conquest
```

Post-migration bootstrap (idempotent — declares/deploys tokens, grid init,
operator + config wiring; prints the address block):

```bash
bun x tsx scripts/init-mainnet-world.ts
```

Then upload the ability SVGs (separate step — `init-mainnet-world.ts` does NOT
do this; without it every ability renders as a "…" placeholder because the
`uri` metadata `image` field is empty):

```bash
source deploy.mainnet.env
RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo" \
  ABILITY_TOKEN=<mainnet AbilityToken> bun x tsx scripts/set-ability-svgs.ts
```

Frontend: `NEXT_PUBLIC_NETWORK=mainnet`, plus the required
`NEXT_PUBLIC_TORII_URL=<torii domain>` (`toriiSql.ts` defaults to localhost
otherwise). Vercel project root directory is `frontend/`; bun is auto-detected
from `bun.lock`.

MCP: copy `mcp-server-2/.env.mainnet` over `.env` to switch. Signing uses the
Cartridge session flow (no `AGENT_*` vars — their absence selects session
signing, unlike katana). `SESSION_DIR` is `.cartridge-mainnet`.

## Self-hosted Katana (dev environment)

Production runs on Starknet mainnet (see above). This self-hosted katana
appchain is the local/dev environment — fee-less and fast, used for
integration testing without touching mainnet. It was the active network while
sepolia was parked (Cartridge's sepolia AVNU sponsorship broke 2026-07-14,
session approvals failing with "Transaction failed", and slot deployments were
discontinued):

- RPC: `https://siege-katana-production.up.railway.app` (Railway service
  `siege-katana`, project `siege-katana`, source `infra/katana/`). Chain id
  short-string `SIEGE` (`0x5349454745`). Flags: `--dev --dev.no-fee
  --cartridge.paymaster` — fee-less, Controller classes at genesis, keychain
  auto-deploys controller accounts. Deployer = katana dev account 0 (public dev
  key, inline in `dojo_katana.toml`).
- Torii: `https://siege-torii-katana-production.up.railway.app` (service
  `siege-torii-katana`, source `infra/torii-katana/`).
- World: same address as sepolia (same seed) — `manifest_katana.json`; system
  addresses differ. Profile: `sozo -P katana` via the Docker builder.
- Bootstrap after a fresh migrate: `bun x tsx scripts/init-katana-world.ts`
  (declares/deploys AbilityToken + resource tokens + DevVrfProvider, grid init,
  operator + config wiring; prints the address block).
- VRF: `DevVrfProvider` (`src/tokens/dev_vrf_provider.cairo`) — pseudo-random,
  dev chain only. The Cartridge VRF address in the sepolia docs does not exist
  here.
- Frontend/MCP switch on `NEXT_PUBLIC_NETWORK=katana` / `mcp-server-2/.env`.
- MCP agent signing: Cartridge headless sessions cannot be created for a
  custom chain id, so on katana the MCP signs with a raw account
  (`AGENT_ACCOUNT_ADDRESS`/`AGENT_PRIVATE_KEY` env; unset = Cartridge session
  flow for sepolia). The agent account is a `DevAgentAccount`
  (`src/tokens/dev_agent_account.cairo`, deployed by
  `scripts/deploy-agent-account.ts`) because katana's predeployed dev accounts
  lack SRC5 and fail ERC-1155 acceptance checks (register_player starter
  mints revert 'ERC1155: safe transfer failed').
- Redeploy infra: `railway up ./infra/katana --path-as-root` (or
  `./infra/torii-katana` with `--service siege-torii-katana`).

## Sepolia (parked — sponsorship outage)

Current config files point at:

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73`
- RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Torii: `https://siege-torii-production-d1a1.up.railway.app` (Railway; Cartridge slot torii discontinued — do not pass `slot: "siege-dojo"` to ControllerConnector, its dead torii breaks keychain session approval)
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

The frontend supports `devnet`, `katana`, `sepolia`, and `mainnet` modes through `src/app/providers.tsx` (`NEXT_PUBLIC_NETWORK`).

- Devnet uses local Katana accounts.
- Sepolia uses Cartridge Controller and `SESSION_POLICIES`.
- Session policies are fixed when the player connects. After adding policies, tell players to reconnect.
- The world UI renders `HexGrid`.
- Torii SQL is the default polling read path. Do not add new GraphQL queries.
- Torii stores u64 key columns (e.g. `match_id`) as zero-padded hex text; use `sqlU64()` from `toriiSql.ts` for comparisons.

Use `BigInt(0)` rather than `0n` in frontend code.

## MCP Notes

Use `mcp-server-2/`. It registers 40 tools and signs writes through a Cartridge session. It reads Dojo contract addresses from `MANIFEST_PATH`; AbilityToken and resource token addresses come from env/defaults.

Cartridge session auth: write tools return `not_ready` with an auth URL until the session is approved in a browser. The URL's `policies` query param is thousands of characters and MUST be passed whole — launch it directly (`open '<url>'`), never copy it from wrapped terminal output. A truncated URL silently approves a zero-policy session (`allowed_policies_root = 0`) whose writes all fail with `session/not-registered`. The 5-minute approval window starts at MCP server launch and the bootstrap does not retry after "Callback timeout" — reconnect the server (`/mcp` → siege → reconnect) to mint a fresh URL, then retry a write tool immediately to get it. Approved sessions live about a week in `mcp-server-2/.cartridge/session.json` (~11 KB; a ~200-byte signer-only file means unapproved).

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
