---
name: dev-katana
description: Work with the self-hosted Katana dev appchain for Siege — bootstrap a fresh world, redeploy the Railway katana/torii services, and handle the DevVrfProvider and DevAgentAccount quirks. Use when testing against the local/dev network instead of mainnet.
---

# Self-hosted Katana (dev environment)

Fee-less, fast appchain used for integration testing without touching mainnet.
It was the active network while sepolia was parked; mainnet is now production.

- RPC: `https://siege-katana-production.up.railway.app` (Railway service `siege-katana`, project `siege-katana`, source `infra/katana/`).
- Chain id short-string `SIEGE` (`0x5349454745`).
- Flags: `--dev --dev.no-fee --cartridge.paymaster` — fee-less, Controller classes at genesis, keychain auto-deploys controller accounts.
- Deployer = katana dev account 0 (public dev key, inline in `dojo_katana.toml`).
- Torii: `https://siege-torii-katana-production.up.railway.app` (service `siege-torii-katana`, source `infra/torii-katana/`).
- World: same address as sepolia (same seed) — see `manifest_katana.json`; system addresses differ. Profile: `sozo -P katana` via the Docker builder.

## Bootstrap after a fresh migrate

```bash
bun x tsx scripts/init-katana-world.ts
```

Declares/deploys AbilityToken + resource tokens + DevVrfProvider, runs grid init,
wires operator + config, and prints the address block.

## Quirks

- **VRF**: use katana's **predeployed Cartridge VRF** at
  `0x015f542e25a4ce31481f986888c179b6e57412be340b8095f72f75a328fbb27b`. It comes
  from `--cartridge.paymaster` at genesis and is a different address than
  mainnet/sepolia (`0x051fea44…`) — but it does exist here, and it is mandatory.
  Paymaster-sponsored transactions arrive as outside-executions and the paymaster
  appends `assert_consumed` against *that* provider, so requesting randomness from
  anything else reverts the whole multicall with `'VrfProvider: not consumed'`.
  `ResourceConfig.vrf_provider` is wired to it by `scripts/init-katana-world.ts`.
  `DevVrfProvider` (`src/tokens/dev_vrf_provider.cairo`) is still deployed but
  **not wired** — don't point clients at it.
- **MCP VRF footgun**: `mcp-server-2` reads `VRF_PROVIDER_ADDRESS` from env and
  defaults to the **mainnet** Cartridge address. Repointing the MCP at katana
  without also setting that variable to the address above reproduces the same
  `consume_random` mismatch.
- **MCP signing**: Cartridge headless sessions cannot be created for a custom chain id, so on katana the MCP signs with a raw account (`AGENT_ACCOUNT_ADDRESS` / `AGENT_PRIVATE_KEY` env). Leaving those unset selects the Cartridge session flow used on sepolia/mainnet.
- **Agent account**: must be a `DevAgentAccount` (`src/tokens/dev_agent_account.cairo`, deployed by `scripts/deploy-agent-account.ts`). Katana's predeployed dev accounts lack SRC5 and fail ERC-1155 acceptance checks — `register_player` starter mints revert with `'ERC1155: safe transfer failed'`.
- **UDC**: uses the legacy deployer.
- **ControllerConnector** is browser-only.

## Client env

`NEXT_PUBLIC_NETWORK=katana` for the frontend; `mcp-server-2/.env` for the MCP.

## Redeploy infra

```bash
railway up ./infra/katana --path-as-root
railway up ./infra/torii-katana --path-as-root --service siege-torii-katana
```
