# Siege Frontend

Next.js app for Siege battles, The Marches world map, crafting, the Forge, factions, and spectator views.

## Stack

Versions live in `package.json` — don't trust copies in docs.

- Next.js (App Router) + React + Tailwind
- Starknet.js + `@starknet-react/core` + Cartridge Controller (mainnet and the katana Practice tier)
- Dojo SDK for gRPC model subscriptions and indexed token balances
- Torii SQL for one-shot reads
- Three.js via `@react-three/fiber` for the battlefield scene

## Routes

| Route                      | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/`                        | Entry page.                                                                         |
| `/world`                   | The Marches dashboard, HexGrid, Hold summary, active battles, abilities, factions.  |
| `/match-1v1/create`        | Create a 1v1 match.                                                                 |
| `/match-1v1/join`          | Join a 1v1 match.                                                                   |
| `/match-1v1/[id]`          | Play a 1v1 match.                                                                   |
| `/match-1v1/[id]/spectate` | Spectate a 1v1 match.                                                               |
| `/craft`                   | Craft T1 and T2 ability tokens.                                                     |
| `/forge`                   | Build and equip cosmetic circuits.                                                  |
| `/dev-battlefield`         | Dev-only visual fixture for the war-table scene; 404s in production.                |

## Network Modes

`NEXT_PUBLIC_NETWORK` sets the build's default network (`devnet`, `katana`, `sepolia`, `mainnet`); a saved player override moves hosted builds between mainnet and katana. Resolution and the rules that keep switching safe live in `src/lib/network.ts` — read it before touching anything network-dependent, and take endpoints from `lib/network`, never `process.env` directly.

| Value             | Provider                                                                | Wallet behavior                      |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `devnet` or unset | Local Katana RPC plus hardcoded dev accounts in `src/app/providers.tsx` | Account dropdown (`useDevAccounts`). |
| `katana`          | Self-hosted Railway katana via Cartridge Controller                     | Connect button and session policies. |
| `mainnet`         | Starknet mainnet via Cartridge Controller                               | Connect button and session policies. |
| `sepolia`         | Parked (Cartridge sepolia sponsorship outage)                           | —                                    |

The shared hook is `useAccount()` from `src/app/providers.tsx`.

## Environment

For local development against a localhost katana:

```bash
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=http://localhost:5050
NEXT_PUBLIC_TORII_URL=http://localhost:8080
```

Hosted networks need no address env vars: contract addresses come from the network's `manifest_*.json` (manifest wins over env on non-devnet — see `src/lib/contractAddresses.ts`). `NEXT_PUBLIC_TORII_URL` / `NEXT_PUBLIC_RPC_URL` act as per-deployment pins and are ignored after a network switch.

`../scripts/local-dev.sh` boots katana + torii, migrates, and writes `frontend/.env.local` — but the contract address vars it writes are legacy names the app no longer reads. Harmless: devnet addresses fall back to `manifest_dev.json`.

## Commands

```bash
bun install
bun run dev
bun run lint
bun run test
bun run build
```

`predev`, `prebuild`, and `pretest` run `scripts/copy-manifests.js`, which copies all four `manifest_*.json` from the repo root into the gitignored `src/manifests/`.

## Data Access

- `src/lib/network.ts` resolves the active network and exposes `TORII_URL`, `RPC_URL`, `CHAIN_ID`.
- `src/lib/dojoConfig.ts` selects the active network's manifest and exposes `WORLD_ADDRESS`.
- `src/lib/contractAddresses.ts` reads contract addresses from the active manifest.
- `src/lib/toriiSql.ts` is the shared Torii SQL client. Use `sqlHex`, `sqlInt`, and `sqlU64` for interpolated values.
- `src/lib/worldState.ts` selects `Parcel` and `PlayerKingdom` from the Dojo store.
- `src/lib/gameState1v1.ts` uses Dojo SDK hooks for match subscriptions.
- `src/lib/useResourceBalances.ts` reads token balances through Dojo SDK `useTokens`.
- `src/lib/abilityToken.ts` reads ERC-1155 ability balances and on-chain metadata through Starknet RPC.

Subscription architecture, torii query gotchas, and the read rules live in `CLAUDE.md` in this directory.

## Session Policies

Cartridge policies live in `src/lib/sessionPolicies.ts`. Add every user-triggered entrypoint before shipping a UI path that calls it. Existing sessions keep the old policy set; players must reconnect after policy changes.
