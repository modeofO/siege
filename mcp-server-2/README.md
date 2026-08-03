# Siege MCP Server v2

`mcp-server-2` is the active MCP server for Siege. It reads Torii state, watches matches, and submits write transactions through a Cartridge session after browser approval.

Run it with Node, not Bun — Cartridge's WASM shims fail under Bun's runtime.

## Setup

Mainnet is the live network. `.env.mainnet` is its canonical config — copy it rather than retyping addresses:

```bash
cd mcp-server-2
pnpm install
cp .env.mainnet .env
pnpm run build
```

That file sets the mainnet Torii URL, the Cartridge mainnet RPC, `CHAIN_ID=SN_MAIN`, `MANIFEST_PATH=../manifest_mainnet.json`, `SESSION_DIR=.cartridge-mainnet`, the VRF provider, and the mainnet AbilityToken plus all six resource token addresses.

`RPC_URL` must be the **Cartridge** mainnet RPC. The write path is the Cartridge WASM `SessionProvider`, which needs Cartridge's own RPC/keychain to resolve the chain id and mint sessions; a third-party node breaks session creation.

`AGENT_ACCOUNT_ADDRESS` and `AGENT_PRIVATE_KEY` are deliberately absent — leaving them unset selects the Cartridge session flow in `src/session.ts`. Setting either switches the server to raw-key signing, viable only on the fee-less self-hosted katana.

`SIEGE_FRONTEND_URL` is optional (default `https://localhost:3000`) and only builds the `spectate_url` field in tool output.

### Other networks

| Network | Manifest | Signing | Notes |
| :------ | :------- | :------ | :---- |
| mainnet | `manifest_mainnet.json` | Cartridge session | Live. Use `.env.mainnet`. |
| katana  | `manifest_katana.json`  | Cartridge session (`.env.katana-session`) or raw key (`AGENT_*`) | Self-hosted dev chain / Practice tier. The keychain resolves the custom `SIEGE` chain from the auth URL's `rpc_url`; katana's built-in paymaster sponsors writes. Raw key signs as a separate dev account, not the user's Controller. |
| sepolia | `manifest_sepolia.json` | Cartridge session | Parked — Cartridge's sepolia sponsorship is down. |

Set `SESSION_DIR` per network so approvals for different chains don't collide.

`VRF_PROVIDER_ADDRESS` defaults to the Cartridge **mainnet** VRF address (`src/config.ts`). Katana has its own predeployed VRF at a different address, so the var must be set explicitly when pointing at katana — `.env.katana-session` does.

## Claude Code

```bash
claude mcp add siege -- node /path/to/siege/mcp-server-2/dist/index.js
```

The server self-locates `.env`, the manifest, `agent-prompt.md`, and the Cartridge session directory from `import.meta.url`, never `process.cwd()` — so it works however it is launched. The first write attempt prints a Cartridge auth URL to stderr. Approve it once; the session persists in `SESSION_DIR` (`.cartridge-mainnet/` on mainnet).

Read tools work as soon as Torii is reachable. Write tools return a `not_ready` status until the Cartridge session is approved.

### Session approval gotchas

- The auth URL's `policies` query param is thousands of characters. Pass the URL whole — launch it directly (macOS: `open '<url>'`). Copying it out of line-wrapped terminal output truncates the policies, and the keychain then approves a zero-policy session (`allowed_policies_root = 0`) whose every write fails with `session/not-registered`.
- The approval window is 5 minutes from server launch, and the bootstrap does not retry after `Callback timeout`. Restart the server (in Claude Code: `/mcp` → siege → reconnect), then call any write tool to get the fresh URL from its `not_ready` error.
- Approved sessions last about a week. A healthy `$SESSION_DIR/session.json` is ~11 KB with `signer`, `session`, and `policies` keys; a ~200-byte file containing only `signer` is an unapproved stub.
- If the copy in the tool error was truncated, the full URL is also written to `$SESSION_DIR/last-auth-url.txt` (mode 0600). Read it from there when in doubt.

### Live match updates (channels)

The server pushes match-state changes straight into the session so an agent can wait for the opponent instead of polling. When a watched match changes, a tag appears in Claude's context:

```text
<channel source="siege" match_id="7" you="a" phase="revealing" round="3" commits="2" reveals="1" hp_a="42" hp_b="38" status="Active" budget_a="11" budget_b="12" nodes="a,-,b" mods="0,2,0" deadline="1760000000">
match 7 round 3 revealing: 2/2 committed, 1/2 revealed — HP 42/38
</channel>
```

`you` is `a`/`b`/`spectator` — act only when you are a participant. The extra attributes (budgets, node owners, gate modifiers, running deadline) carry everything a round decision needs, so the common loop doesn't have to re-read match state.

`agent-prompt.md` tells the agent to wait for `commits="2"` before revealing and `reveals="2"` before resolving.

**This is off unless Claude Code is launched with the flag.** Channels are an Anthropic extension in research preview, and a bare MCP server (rather than a plugin) is not on the approved allowlist:

```bash
claude --dangerously-load-development-channels server:siege
```

Startup shows a confirmation dialog, then a dim notice confirming the channel registered. All of the following must also hold, or the channel silently does not register:

- The server declares `experimental: { "claude/channel": {} }` (it does — `src/index.ts`).
- First-party Anthropic auth. Not available on Amazon Bedrock, Google Cloud, or Microsoft Foundry.
- `channelsEnabled: true` in managed settings for Team and Enterprise organizations.
- The server is named in this session's channels list (the flag above, or `--channels`).

**Failure is silent.** Dropped events send nothing back to the server. If no `<channel>` tags arrive, the agent falls back to polling `siege_get_match_state` — correct, but slower.

Implementation notes:

- Events are emitted as `notifications/claude/channel` with `{ content, meta }` from `notifyMatchChanged` in `src/notify.ts`. The watch-scoped poller in `src/live.ts` drives it: a 5 s tick runs one cheap activity probe per watched match, and the snapshot is rebuilt and diffed only when the probe moves. There is deliberately no gRPC subscription: Railway's edge kills idle streams, a lost push strands a blocking agent, and a poll tick of latency is invisible against 300 s game clocks.
- Each `meta` key becomes a tag attribute. **Keys must be identifiers** — letters, digits, and underscores only. A key containing a hyphen is silently dropped, so keep using `match_id`, not `match-id`.
- Only *watched* live matches push. A match becomes watched when any tool touches it by id; reading a finished match never watches it. A watched match that finishes emits its final event and is auto-released; `siege_unwatch_match` is the explicit off switch. Empty watch set → zero Torii traffic. `siege_whoami` reports the watch set and poller liveness.
- The first snapshot of a match seeds silently; pushes begin from the second change.
- Events queue and are delivered together on the next turn if several land while Claude is busy. Each push is a full snapshot, so the newest one wins.
- The same trigger also fires a standard `notifications/resources/updated` for any subscriber of `siege://match-1v1/{match_id}/state`.

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
src/tools.ts           45 tool definitions and handlers
src/stakedCalls.ts     staked-match call builders
src/state.ts           Torii SQL state reads
src/torii.ts           generic Torii helpers
src/live.ts            watch-scoped live match poller
src/notify.ts          snapshot diff, channel + resource notifications
src/match-resource.ts  SQL-backed MCP match resource
src/hash.ts            Poseidon commitment helpers
src/move.ts            move schema and budget validation
src/damage.ts          local damage prediction helpers
src/tx.ts              Starknet call helpers and revert extraction
src/paths.ts           project-root and dotenv helpers
```

Contract addresses come from `MANIFEST_PATH`, so policy targets and transaction targets agree for Dojo contracts. AbilityToken and resource token addresses come from env/defaults.

## Tools

The full tool list, with a one-line description per tool, lives in
`agent-prompt.md` — the copy agents actually read, and the one place the list
is maintained. Read tools query Torii and need no session; write tools sign
through the Cartridge session.

## Match flow for agents

The primary path into a match is `siege_queue_for_match`, which wagers 1-3 abilities and pairs you with a player wagering the same count. `siege_create_staked_match` / `siege_join_staked_match` set one up against a named opponent instead. Both paths require a registered Hold (`siege_register_player`). Call `siege_whoami` once per session to confirm the authenticated address.

Then, per round:

1. Call `siege_get_match_state` and `siege_get_my_status`.
2. Build a move within budget.
3. Call `siege_commit`; store the returned salt and exact move.
4. Reveal only after both commits are present — wait for `<channel ... commits="2">`, or poll `siege_get_match_state` if channels are not enabled.
5. Call `siege_reveal` with the same salt and move.
6. Resolve after both reveals, the same way. `siege_resolve_round` elects the lower address as resolver; the other player gets a `waiting_for_resolver` status and can override with `force=true`.
7. After a staked match finishes, call `siege_settle_match`, then `siege_claim_winnings` for a queue-made match's entry pot, then claim drip and, if eligible, a parcel or pillage.

Ability activations are single-use per match. Check `siege_my_abilities` before committing an ability id.
