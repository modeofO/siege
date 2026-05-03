# Siege MCP Server v2

## Setup

```bash
cd mcp-server-2
pnpm install
cp .env.example .env
```

> ⚠️ **Run under Node, not Bun.** Cartridge's `wasm-bindgen` shims fail
> under Bun's WASM loader. `bun install` is fine; running uses `tsx`/`node`.

## Build

```bash
pnpm run build
```

## Wire into Claude Code

```bash
claude mcp add siege -- node /Users/boat/Projects/siege/mcp-server-2/dist/index.js
```

The server self-locates `.env`, the manifest, and the persisted session via
`import.meta.url`, so it works regardless of who launches it or from which
directory. First run prints a Cartridge auth URL to stderr — approve once,
session persists to `.cartridge/`, subsequent runs sign silently.

## Tools

Read tools work as soon as `TORII_URL` is reachable. Write tools wait on the
Cartridge session.

| Tool                                  | Kind  | Purpose                                             |
| ------------------------------------- | ----- | --------------------------------------------------- |
| `siege_whoami`                        | write | Authenticated agent address                         |
| `siege_get_match_state`               | read  | Phase, HP, nodes, budgets, modifiers                |
| `siege_get_round_history`             | read  | Recent revealed rounds                              |
| `siege_get_round_details`             | read  | Full snapshot of one round                          |
| `siege_get_my_status`                 | read  | Your slot, budget, commit/reveal flags              |
| `siege_get_world_state`               | read  | World/resource config and parcel map                |
| `siege_get_parcel`                    | read  | One parcel by id                                    |
| `siege_get_player_kingdom`            | read  | Kingdom, reputation, presets, pillage, faction info |
| `siege_get_staked_match`              | read  | Match state plus staked ability escrow              |
| `siege_get_pillage_status`            | read  | Active pillages and pillage eligibilities           |
| `siege_get_factions`                  | read  | Factions, members, and pending invites              |
| `siege_register_player`               | write | world_system.register_player                        |
| `siege_claim_drip`                    | write | world_system.claim_drip                             |
| `siege_upgrade_kingdom`               | write | world_system.upgrade_kingdom                        |
| `siege_create_staked_match`           | write | VRF + world_system.create_staked_match              |
| `siege_join_staked_match`             | write | world_system.join_staked_match                      |
| `siege_settle_match`                  | write | world_system.settle_match                           |
| `siege_claim_parcel`                  | write | world_system.claim_parcel                           |
| `siege_set_preset_defense`            | write | conquest.set_preset_defense                         |
| `siege_initiate_conquest`             | write | VRF + conquest.initiate_conquest                    |
| `siege_initiate_pillage`              | write | world_system.initiate_pillage                       |
| `siege_claim_pillage_drip`            | write | world_system.claim_pillage_drip                     |
| `siege_create_faction`                | write | world_system.create_faction                         |
| `siege_invite_faction_member`         | write | world_system.invite_member                          |
| `siege_accept_faction_invite`         | write | world_system.accept_invite                          |
| `siege_leave_faction`                 | write | world_system.leave_faction                          |
| `siege_kick_faction_member`           | write | world_system.kick_member                            |
| `siege_set_faction_reinforcement`     | write | world_system.set_faction_reinforcement              |
| `siege_set_ability_operator_approval` | write | AbilityToken.set_approval_for_all                   |
| `siege_create_match`                  | write | Multicall: VRF + actions_1v1.create_match_1v1       |
| `siege_commit`                        | write | Generate salt + hash + submit commit                |
| `siege_reveal`                        | write | Submit reveal with stored salt + move               |
| `siege_resolve_round`                 | write | Multicall: VRF + resolution_1v1.resolve_round       |
| `siege_force_timeout`                 | write | Force timeout when a deadline elapses               |

Set `ABILITY_TOKEN_ADDRESS` before approving the Cartridge session if you want
`siege_set_ability_operator_approval` to be available. Staked match creation
and joining require `world_system` to be approved as an AbilityToken operator.

## Architecture

```
src/
  index.ts      stdout redirect, .env load, transport, background bootstrap, live resource notifications
  paths.ts      self-locating PROJECT_ROOT + tiny .env parser
  config.ts     env + manifest loading
  session.ts    Cartridge SessionProvider singleton
  policies.ts   allowed (contract, entrypoint) pairs
  tx.ts         Call helpers + revert-reason extraction
  state.ts      Torii SQL queries
  torii.ts      generic Torii gRPC/query helpers
  live.ts       Torii gRPC invalidation bridge
  match-resource.ts SQL-backed MCP match state resource
  hash.ts       Poseidon move commitment
  move.ts       Zod move schema + budget validation
  tools.ts      tool definitions + registry
```

Until the Cartridge session is approved, write tools return
`{ status: "not_ready", message: "Open <auth_url>..." }`. Reads work normally.
Contract addresses come from the Dojo manifest (`MANIFEST_PATH`), so the
session policy and tx targets always agree.
