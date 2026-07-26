---
name: deploy-sepolia
description: Deploy Siege to Starknet sepolia — migrate, auth grants, and fresh-world setup scripts. Sepolia is currently parked due to a Cartridge sponsorship outage; use this when reviving or redeploying that network.
---

# Sepolia (parked)

Parked since 2026-07-14, when Cartridge's sepolia AVNU sponsorship broke — session
approvals fail with "Transaction failed" across the board. Slot deployments were
also discontinued. Mainnet is production; katana is the dev environment.

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73`
- RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Torii: `https://siege-torii-production-d1a1.up.railway.app` (Railway; the Cartridge slot torii was discontinued)
- Torii start block: `10547399`
- Cartridge VRF provider: `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f`

Contract and resource-token addresses come from `manifest_sepolia.json` and
`scripts/init-sepolia-resource-config.sh` (kept in sync with
`frontend/src/lib/useResourceBalances.ts`).

**Never pass `slot: "siege-dojo"` to ControllerConnector** — that torii was
deleted, and the dead endpoint breaks keychain session approval.

To check whether the outage has cleared, curl the sepolia paymaster backend; a
404 means it is still down.

## Deploy

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
  siege_dojo,siege_dojo-conquest \
  siege_dojo,siege_dojo-matchmaking
```

This list must name **every** contract in the manifest — `sozo migrate` grants
nothing itself (`Sync 0 permissions`). A missing grant does not fail the
migration; it surfaces later as a revert when that contract first writes a
model.

## Post-migration setup (fresh world only)

```bash
bash scripts/init-hex-world.sh
bash scripts/setup-ability-token.sh
bash scripts/init-sepolia-resource-config.sh
```

## Starkli

Use the v0.8 RPC endpoint for Starkli commands:

```text
https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```
