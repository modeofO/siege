# Siege MCP Server v2

`mcp-server-2` is the active MCP server for Siege. It reads Torii state, watches matches, and submits write transactions through a Cartridge session after browser approval.

Run it with Node, not Bun. Cartridge's WASM shims are not reliable under Bun's runtime.

## Setup

```bash
cd mcp-server-2
pnpm install
cp .env.example .env
pnpm run build
```

Minimum `.env` for Sepolia:

```bash
TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
CHAIN_ID=SN_SEPOLIA
MANIFEST_PATH=../manifest_sepolia.json
ABILITY_TOKEN_ADDRESS=0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05
SIEGE_FRONTEND_URL=https://localhost:3000
```

Resource token env vars are optional but should be set before live use because the defaults currently differ from `scripts/init-sepolia-resource-config.sh`:

```bash
IRON_TOKEN_ADDRESS=0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838
LINEN_TOKEN_ADDRESS=0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91
STONE_TOKEN_ADDRESS=0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29
WOOD_TOKEN_ADDRESS=0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30
EMBER_TOKEN_ADDRESS=0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1
SEEDS_TOKEN_ADDRESS=0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35
```

## Claude Code

```bash
claude mcp add siege -- node /Users/boat/Projects/siege/mcp-server-2/dist/index.js
```

The server self-locates `.env`, the manifest, `agent-prompt.md`, and the Cartridge session directory from `import.meta.url`. First write use prints a Cartridge auth URL to stderr. Approve it once; the session persists in `.cartridge/`.

Read tools work as soon as Torii is reachable. Write tools return a `not_ready` status until the Cartridge session is approved.

## Commands

```bash
pnpm run build
pnpm run test
pnpm run dev
pnpm run start
```

## Architecture

```text
src/index.ts           MCP process, stdio transport, session bootstrap, live updates
src/config.ts          env and Dojo manifest loading
src/session.ts         Cartridge SessionProvider singleton
src/policies.ts        session policy construction
src/tools.ts           39 tool definitions and handlers
src/state.ts           Torii SQL state reads
src/torii.ts           generic Torii helpers
src/live.ts            Torii gRPC invalidation bridge
src/match-resource.ts  SQL-backed MCP match resource
src/hash.ts            Poseidon commitment helpers
src/move.ts            move schema and budget validation
src/damage.ts          local damage prediction helpers
src/tx.ts              Starknet call helpers and revert extraction
src/paths.ts           project-root and dotenv helpers
```

Contract addresses come from `MANIFEST_PATH`, so policy targets and transaction targets agree for Dojo contracts. AbilityToken and resource token addresses come from env/defaults.

## Tools

Current registered tools: 39.

Read tools:

- `siege_get_match_state`
- `siege_get_round_history`
- `siege_get_round_details`
- `siege_get_my_status`
- `siege_my_abilities`
- `siege_get_world_state`
- `siege_get_parcel`
- `siege_get_player_kingdom`
- `siege_get_player_cosmetics`
- `siege_get_forge_info`
- `siege_get_staked_match`
- `siege_get_pillage_status`
- `siege_get_factions`

Write tools:

- `siege_whoami`
- `siege_set_cosmetic`
- `siege_craft_ability`
- `siege_register_player`
- `siege_claim_drip`
- `siege_upgrade_kingdom`
- `siege_create_staked_match`
- `siege_join_staked_match`
- `siege_settle_match`
- `siege_claim_parcel`
- `siege_set_preset_defense`
- `siege_initiate_conquest`
- `siege_initiate_pillage`
- `siege_claim_pillage_drip`
- `siege_create_faction`
- `siege_invite_faction_member`
- `siege_accept_faction_invite`
- `siege_leave_faction`
- `siege_kick_faction_member`
- `siege_set_faction_reinforcement`
- `siege_set_ability_operator_approval`
- `siege_create_match`
- `siege_commit`
- `siege_reveal`
- `siege_resolve_round`
- `siege_force_timeout`

## Match Flow For Agents

1. Call `siege_whoami`.
2. Call `siege_get_match_state` and `siege_get_my_status`.
3. Build a move within budget.
4. Call `siege_commit`; store the returned salt and exact move.
5. Reveal only after both commits are present.
6. Call `siege_reveal` with the same salt and move.
7. Resolve after both reveals.
8. After a staked match finishes, call settle, claim drip, and if eligible claim a parcel or pillage.

Ability activations are single-use per match. `siege_my_abilities` should be checked before committing an ability id.
