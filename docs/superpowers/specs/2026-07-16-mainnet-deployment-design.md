# Siege Mainnet Deployment — Design

Date: 2026-07-16
Status: Approved

## Goal

Deploy the full Siege stack to Starknet mainnet: Dojo world + systems + tokens,
a Railway-hosted torii indexer, the frontend on Vercel (so the game is playable
without running `bun dev` locally), and the MCP server signing via Cartridge
sessions on mainnet.

Katana (Railway `siege-katana` project) stays running as the dev environment.
Sepolia remains parked.

## Decisions

| Decision | Choice |
| --- | --- |
| Gas model | Cartridge paymaster (gasless for players). Verified before any deploy; fallback decision revisited if dead. |
| Deployer | New standard account, generated + funded (~$30 STRK) by the user. |
| Site network | Mainnet only (`NEXT_PUBLIC_NETWORK=mainnet`). No switcher. Katana stays local-dev. |
| Vercel setup | User creates the project manually. Root directory `frontend`, no `vercel.json` (auto-detected Next + bun). |
| World seed | Same seed (`siege_dojo_v9`) → same world address as sepolia/katana. |
| Torii hosting | New Railway service `siege-torii-mainnet` inside the existing `siege-katana` project, source `infra/torii-mainnet/`. |

## Phase 0 — Verify blockers (before spending anything)

1. **Cartridge mainnet paymaster**: probe the paymaster API / slot CLI and
   confirm sponsorship works on mainnet post-slot-discontinuation. The sepolia
   outage (2026-07-14) may or may not be Cartridge-wide. If mainnet sponsorship
   is dead, STOP and revisit the gas model (user-paid fallback) before
   proceeding.
2. **Cartridge VRF on mainnet**: confirm the VRF provider contract exists on
   mainnet and record its address (the sepolia address in docs is
   sepolia-only).
3. **Dependency hardening**: `bun update` in `frontend/`, `pnpm update` in
   `mcp-server-2/`, then full build + tests. Kills the protobufjs critical
   advisory (via `@dojoengine/grpc`) and assorted transitive DoS advisories.
   `next`/`react` themselves have no advisories at current pins.

## Phase 1 — Deployer account

- Generate a fresh keypair, deploy a standard account contract via starkli.
- User funds it with ~$30 of STRK (bridge/exchange).
- Credentials follow the existing `deploy.env` pattern (never committed).
- Fee-estimate the full migrate before executing so real cost is visible
  first (expected total $5–20).

## Phase 2 — Contracts

- New `dojo_mainnet.toml`: RPC `https://api.cartridge.gg/x/starknet/mainnet`,
  seed `siege_dojo_v9`, mainnet VRF address from Phase 0.
- `docker compose run --rm builder sozo build -P mainnet`, fee estimate,
  `sozo -P mainnet migrate`, then writer auth grants for the 6 systems
  (actions_1v1, commit_reveal_1v1, resolution_1v1, crafting_1v1, world_system,
  conquest).
- Deploy AbilityToken (ERC-1155) + 6 resource ERC-20s; init the 8x4 hex grid
  (32 parcels); wire operator approvals + ResourceConfig. Port
  `scripts/init-katana-world.ts` to a mainnet variant that uses the real
  Cartridge VRF and real fee handling (no DevVrfProvider, no dev accounts).
- Output: `manifest_mainnet.json` checked in; address block recorded in
  CLAUDE.md.

## Phase 3 — Torii (Railway)

- New service `siege-torii-mainnet` in the `siege-katana` Railway project,
  source `infra/torii-mainnet/` (modeled on `infra/torii-katana/`).
- Points at the mainnet world address with the start block from the migrate.
- Katana + torii-katana services untouched (dev environment).

## Phase 4 — Frontend (Vercel)

- Add `mainnet` mode to `frontend/src/app/providers.tsx` and network config:
  mainnet RPC, mainnet torii URL, `manifest_mainnet.json` addresses, session
  policies regenerated for the mainnet world.
- Resource token addresses synced into `useResourceBalances.ts` (same pattern
  as sepolia).
- User creates the Vercel project: root directory `frontend`,
  `NEXT_PUBLIC_NETWORK=mainnet` + torii/RPC env vars. Build must pass with
  bun (Vercel auto-detects from `bun.lock`).

## Phase 5 — MCP server

- Mainnet `.env` for `mcp-server-2/`: `AGENT_ACCOUNT_ADDRESS` /
  `AGENT_PRIVATE_KEY` UNSET (raw-key mode is katana-only), `MANIFEST_PATH`
  → `manifest_mainnet.json`, mainnet RPC + torii.
- Cartridge headless session flow works on SN_MAIN, so the agent signs as the
  user's controller again — no separate agent identity/PlayerKingdom like on
  katana.
- VRF multicall sandwich quirk (issue #44) applies on mainnet; existing MCP
  handling carries over.

## Risks

- **Paymaster availability** is the biggest unknown — hence the Phase 0 gate.
  If the sepolia outage is Cartridge-wide, mainnet sponsorship may be broken
  too.
- Mainnet fees are real: any init script bug costs money. Fee-estimate and
  dry-run everything estimable before submitting.
- Same-seed world address collision with parked sepolia config files — config
  must always be selected by profile/env, never by world address.

## Out of scope

- Network switcher UI, custom domain setup, sepolia revival, katana
  decommissioning, deleting the duplicate `siege-torii` Railway project
  (flagged separately as cleanup).
