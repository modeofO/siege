# Siege Deployment Reference

This file is a quick lookup for where things run. The authoritative source for contract addresses is `dojo_sepolia.toml`, `manifest_sepolia.json`, `frontend/.env.local`, `CLAUDE.md`, and `AGENTS.md` at the repo root. Update those when redeploying.

## Local dev

Brought up by `./scripts/local-dev.sh` via `docker-compose.yml`:

| Service | URL | Notes |
|---------|-----|-------|
| Katana | http://localhost:5050 | `ghcr.io/dojoengine/katana` (linux/amd64 under Rosetta) |
| Torii SQL / gRPC | http://localhost:8080 | `ghcr.io/dojoengine/torii` |
| Frontend | http://localhost:3000 | `cd frontend && bun run dev` |

`local-dev.sh` builds + migrates in a `builder` compose service, then writes the dev contract addresses into `frontend/.env.local` automatically.

## Sepolia

| Service | URL |
|---------|-----|
| Starknet RPC | https://api.cartridge.gg/x/starknet/sepolia (spec v0.9.0) |
| Starknet RPC (starkli) | https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8 |
| Torii (Slot) | https://api.cartridge.gg/x/siege-dojo/torii |
| Torii SQL | https://api.cartridge.gg/x/siege-dojo/torii/sql |

World address: `0x05ae03c23b817afa096a51e3b04e31c176f168ee8193465229d08fa67366a942` (seed `siege_dojo_v7`; see `dojo_sepolia.toml`).

Current contract addresses are tracked in `manifest_sepolia.json`, `CLAUDE.md`, `AGENTS.md`, and `frontend/.env.local`. When those change, update those docs and set frontend env vars explicitly; some frontend fallback addresses are known to lag deployments.

## Torii config

Sepolia torii is configured from `torii_sepolia.toml` in the repo root and is hosted on Cartridge Slot — there is no self-managed VPS / Railway project. Re-syncing it means pushing a new config through Slot, not restarting a VM.

## Toolchain (in-repo)

- sozo v1.8.6, scarb 2.13.1, Cairo 2.13.1, Dojo v1.8.0 (see `Scarb.toml`).
- Dojo images have no ARM64 builds — compose pins `platform: linux/amd64`.
- Local builder: `Dockerfile.build` wraps the dojo image with the dependencies sozo build needs.
