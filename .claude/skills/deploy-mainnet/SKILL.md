---
name: deploy-mainnet
description: Deploy or redeploy Siege to Starknet mainnet — sozo migrate, writer auth grants, post-migration bootstrap, ability SVG upload, and the frontend/MCP env switches. Use when migrating contracts to mainnet, bootstrapping a fresh mainnet world, or wiring a newly deployed mainnet contract.
---

# Mainnet deployment

Production network. Contract addresses come from `manifest_mainnet.json` — read
them from there, never from a copy in docs.

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73` (block `11948230`)
- Profile: `sozo -P mainnet` via the Docker builder; config in `dojo_mainnet.toml`.
- Deployer account: `0x0351d9177810f624efa1ee1eba0648dab27ed38f74c45ab23aa762dbbf6c9f78`, keystore in `~/.siege-mainnet/`.

## RPC spec-version split

Each consumer needs a different endpoint — this bites on every redeploy:

- sozo: a Lava `v0_9` endpoint in `dojo_mainnet.toml`. Cartridge's mainnet RPC serves spec `0.10.2`, which sozo v1.8 cannot consume.
- torii 1.8.3: same constraint — uses the Alchemy public `v0_9` demo endpoint.
- Cartridge Controller / keychain: the Cartridge `0.10.2` endpoint.

## Migrate

Starknet 0.14 requires `--use-blake2s-casm-class-hash` on **both** `migrate` and
`auth grant`.

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
  siege_dojo,siege_dojo-conquest \
  siege_dojo,siege_dojo-matchmaking
```

This list must name **every** contract in the manifest — `sozo migrate` reports
`Sync 0 permissions` and grants nothing itself. Check it against:

```bash
python3 -c "import json;print([c['tag'] for c in json.load(open('manifest_mainnet.json'))['contracts']])"
```

A missing grant does not fail the migration. It surfaces later as a revert the
first time that contract tries to write a model, which reads like a game bug
rather than a deploy step that was skipped.

## Bootstrap

Idempotent — declares/deploys tokens, grid init, operator + config wiring;
prints the address block:

```bash
bun x tsx scripts/init-mainnet-world.ts
```

Then upload the ability SVGs. This is a **separate step** — `init-mainnet-world.ts`
does NOT do it, and without it every ability renders as a "…" placeholder because
the `uri` metadata `image` field is empty:

```bash
source deploy.mainnet.env
RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo" \
  ABILITY_TOKEN=<mainnet AbilityToken> bun x tsx scripts/set-ability-svgs.ts
```

## New contract or entrypoint — four wirings, not two

Missing any one of these fails in a way that points at the wrong culprit:

1. `sozo migrate` + `auth grant writer` (blake2s flag).
2. Frontend `frontend/src/lib/sessionPolicies.ts` + MCP `mcp-server-2/src/policies.ts`.
3. **Slot paymaster policy**: `slot paymaster siege-dojo policy add --contract <addr> --entrypoint <ep>` (paymaster `siege-dojo`, team `boat`). Separate server-side allowlist from session policies.
4. Players and the MCP must reconnect to re-approve sessions with the new policies.

A missing paymaster policy surfaces as `-32003 "paymaster requested but not
available or applicable for this call"`, after which the keychain silently falls
back to a self-paid raw `starknet_addInvokeTransaction`. That path skips
Cartridge's outside-execution flow, so the VRF server never fulfills
`request_random` — the tx reverts `'VrfProvider: not fulfilled'` and the player
is charged for the revert. The visible error blames VRF; the real cause is the
allowlist. Diagnose via HAR: look for `cartridge_addExecuteOutsideTransaction` → -32003.

Multicalls need every entrypoint allowlisted, including harmless view calls
inserted for the VRF seed quirk (e.g. `dojo_name` on `resolution_1v1`).

## Client env

- Frontend: `NEXT_PUBLIC_NETWORK=mainnet`, plus the required `NEXT_PUBLIC_TORII_URL=<torii domain>` (`toriiSql.ts` defaults to localhost otherwise). Vercel project root directory is `frontend/`; bun is auto-detected from `bun.lock`.
- MCP: copy `mcp-server-2/.env.mainnet` over `.env`. Signing uses the Cartridge session flow (no `AGENT_*` vars — their absence selects session signing, unlike katana). `SESSION_DIR` is `.cartridge-mainnet`.

## Sponsorship limits

Transactions above roughly 100M gas break the paymaster and can trip its circuit
breaker. Diagnose with `simulateTransactions` + `SKIP_VALIDATE`. Never scan the
parcel map twice in one entrypoint. Do not expand the world past 96 parcels
until sponsored scans are reworked.
