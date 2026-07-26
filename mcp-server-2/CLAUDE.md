# MCP Notes

`mcp-server-2/` is the active MCP implementation (`mcp-server/` is older and unused).
It registers 44 tools and signs writes through a Cartridge session. It reads Dojo
contract addresses from `MANIFEST_PATH`; AbilityToken and resource token addresses
come from env/defaults.

Switch networks by copying `.env.mainnet` over `.env`. On mainnet, signing uses the
Cartridge session flow — the absence of `AGENT_*` vars selects session signing.
`SESSION_DIR` is `.cartridge-mainnet`. On katana, set `AGENT_ACCOUNT_ADDRESS` /
`AGENT_PRIVATE_KEY` instead (headless Cartridge sessions can't be created for a
custom chain id).

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
reconnect) to mint a fresh URL, then retry a write tool immediately to get it.
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
