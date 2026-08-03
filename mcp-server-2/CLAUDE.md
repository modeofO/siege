# MCP Notes

`mcp-server-2/` is the active MCP implementation (`mcp-server/` is older and unused).
It signs writes through a Cartridge session. It reads Dojo
contract addresses from `MANIFEST_PATH`; AbilityToken and resource token addresses
come from env/defaults.

## Live updates (poll-driven, not streamed)

All Torii reads are SQL. Live match notifications are driven by a watch-scoped
poller (`live.ts`, 5 s tick): one `latestMatchActivity` probe per watched match
per tick, full snapshot rebuild + diff (`notify.ts`) only when the probe moves,
channel event + `resources/updated` only on a real delta. There is deliberately
no gRPC subscription: Railway's edge kills idle streams at 300 s (measured
2026-07-26); torii-client 1.8.2 had no reconnect; and the agent blocks on
channel events (per agent-prompt.md), so push latency is invisible to it but
a lost event strands it. Polling guarantees delivery; a tick of latency is
invisible against 300 s game clocks.

Watch lifecycle invariant: the watch set only contains live matches the agent
has touched. Reading a finished match never watches it; a watched match that
finishes emits its final channel event and is auto-released;
`siege_unwatch_match` is the explicit off switch. Empty watch set → zero Torii
traffic. Channel events carry `you` (`a`/`b`/`spectator`) so the agent knows
whether to act; `siege_whoami` reports the watch set and poller liveness.

Switch networks by copying `.env.mainnet` (or `.env.katana-session`) over `.env`
and reconnecting the server. The absence of `AGENT_*` vars selects the Cartridge
session flow; `SESSION_DIR` keeps per-network approvals separate
(`.cartridge-mainnet` / `.cartridge-katana`). The session flow works on katana
too (verified 2026-07-26): the keychain resolves the custom SIEGE chain from the
`rpc_url` in the auth URL, and writes are sponsored by katana's built-in
paymaster. Setting `AGENT_ACCOUNT_ADDRESS` / `AGENT_PRIVATE_KEY` instead selects
raw-key signing as a DevAgentAccount (katana only — no browser approval, but a
different address from the user's Controller).

## Cartridge session auth

Write tools return `not_ready` with an auth URL until the session is approved in a
browser. **The URL's `policies` query param is thousands of characters and MUST be
passed whole** — launch it directly (`open '<url>'`), never copy it from wrapped
terminal output. A truncated URL silently approves a zero-policy session
(`allowed_policies_root = 0`) whose writes all fail with `session/not-registered`.

If the error message itself is truncated in the transcript, read the full URL from
`.cartridge-mainnet/last-auth-url.txt` and open that.

The 5-minute approval window starts at MCP server launch, and the bootstrap does
not retry after "Callback timeout" — reconnect the server (`/mcp` → siege →
reconnect) to mint a fresh URL, then call a write tool immediately to surface
the new URL.
Approved sessions live about a week in `.cartridge-mainnet/session.json` (~11 KB;
a ~200-byte signer-only file means unapproved).

The session signs as whatever Cartridge account approved it. Participant-gated
entrypoints (`force_timeout`, `settle_match`) revert with `'Not a match
participant'` if the approving account isn't the player — switch accounts in the
keychain window before approving, and stash the old `session.json` first if the
agent identity needs restoring.

## Cartridge VRF quirk

The VRF server keys the seed to the contract called immediately after
`request_random` in the multicall. When the consumer is reached through a nested
call (e.g. `force_timeout` → `resolve_round`), sandwich a harmless direct view call
to the consumer between the VRF request and the real call. That inserted view
entrypoint also needs a slot paymaster policy. See issue #44.

## Build and test

Use pnpm, not bun — this package has a pnpm lockfile.

```bash
cd mcp-server-2
pnpm run build
pnpm run test
```
