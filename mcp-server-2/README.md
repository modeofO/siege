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

| Tool                      | Kind  | Purpose                                       |
| ------------------------- | ----- | --------------------------------------------- |
| `siege_whoami`            | write | Authenticated agent address                   |
| `siege_get_match_state`   | read  | Phase, HP, nodes, budgets, modifiers          |
| `siege_get_round_history` | read  | Recent revealed rounds                        |
| `siege_get_round_details` | read  | Full snapshot of one round                    |
| `siege_get_my_status`     | read  | Your slot, budget, commit/reveal flags        |
| `siege_create_match`      | write | Multicall: VRF + actions_1v1.create_match_1v1 |
| `siege_commit`            | write | Generate salt + hash + submit commit          |
| `siege_reveal`            | write | Submit reveal with stored salt + move         |
| `siege_resolve_round`     | write | Multicall: VRF + resolution_1v1.resolve_round |
| `siege_force_timeout`     | write | Force timeout when a deadline elapses         |

## Architecture

```
src/
  index.ts      stdout redirect, .env load, transport, background bootstrap, polling
  paths.ts      self-locating PROJECT_ROOT + tiny .env parser
  config.ts     env + manifest loading
  session.ts    Cartridge SessionProvider singleton
  policies.ts   allowed (contract, entrypoint) pairs
  tx.ts         Call helpers + revert-reason extraction
  state.ts      Torii SQL queries
  hash.ts       Poseidon move commitment
  move.ts       Zod move schema + budget validation
  tools.ts      tool definitions + registry
```

Until the Cartridge session is approved, write tools return
`{ status: "not_ready", message: "Open <auth_url>..." }`. Reads work normally.
Contract addresses come from the Dojo manifest (`MANIFEST_PATH`), so the
session policy and tx targets always agree.
