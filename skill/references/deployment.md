# Siege Deployment Reference

This file is a quick lookup for where things run. The authoritative source for contract addresses is `dojo_sepolia.toml` + `frontend/.env.local` + `CLAUDE.md` at the repo root — update those when redeploying.

## Local dev

Brought up by `./scripts/local-dev.sh` via `docker-compose.yml`:

| Service | URL | Notes |
|---------|-----|-------|
| Katana | http://localhost:5050 | `ghcr.io/dojoengine/katana` (linux/amd64 under Rosetta) |
| Torii GraphQL | http://localhost:8080/graphql | `ghcr.io/dojoengine/torii` |
| Torii gRPC / SQL | http://localhost:8080 | same container |
| Frontend | http://localhost:3000 | `cd frontend && npm run dev` |

`local-dev.sh` builds + migrates in a `builder` compose service, then writes the dev contract addresses into `frontend/.env.local` automatically.

## Sepolia

| Service | URL |
|---------|-----|
| Starknet RPC | https://api.cartridge.gg/x/starknet/sepolia (spec v0.9.0) |
| Starknet RPC (starkli) | https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8 |
| Torii (Slot) | https://api.cartridge.gg/x/siege-dojo/torii |
| Torii GraphQL | https://api.cartridge.gg/x/siege-dojo/torii/graphql |
| Torii SQL | https://api.cartridge.gg/x/siege-dojo/torii/sql |

World address: `0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0` (see `dojo_sepolia.toml`).

Current 1v1 + crafting contract addresses are tracked in `CLAUDE.md` under the 1v1 Contracts section and in `frontend/.env.local`. When those change, update both plus `frontend/src/lib/contracts1v1.ts` fallbacks.

## Torii config

Sepolia torii is configured from `torii_sepolia.toml` in the repo root and is hosted on Cartridge Slot — there is no self-managed VPS / Railway project. Re-syncing it means pushing a new config through Slot, not restarting a VM.

## Toolchain (in-repo)

- sozo v1.8.6, scarb 2.13.1, Cairo 2.13.1, Dojo v1.8.0 (see `Scarb.toml`).
- Dojo images have no ARM64 builds — compose pins `platform: linux/amd64`.
- Local builder: `Dockerfile.build` wraps the dojo image with the dependencies sozo build needs.
