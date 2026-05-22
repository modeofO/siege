# Siege Frontend

Next.js app for Siege battles, The Marches world map, crafting, the Forge, factions, and spectator views.

## Stack

- Next 16.2.6
- React 19.2.3
- Tailwind 4
- Starknet.js 8.9.2
- `@starknet-react/core` + Cartridge Controller for Sepolia
- Dojo SDK for model subscriptions and indexed token balances
- Torii SQL for polling-heavy reads
- Three.js via `@react-three/fiber` for the tile world map

## Routes

| Route                      | Purpose                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `/`                        | Entry page.                                                                          |
| `/world`                   | The Marches dashboard, TilingMap, Hold summary, active battles, abilities, factions. |
| `/match-1v1/create`        | Create a 1v1 match.                                                                  |
| `/match-1v1/join`          | Join a 1v1 match.                                                                    |
| `/match-1v1/[id]`          | Play a 1v1 match.                                                                    |
| `/match-1v1/[id]/spectate` | Spectate a 1v1 match.                                                                |
| `/craft`                   | Craft T1 and T2 ability tokens.                                                      |
| `/forge`                   | Build and equip cosmetic circuits.                                                   |
| `/match/*`                 | Legacy 2v2 routes.                                                                   |

## Network Modes

`NEXT_PUBLIC_NETWORK` controls account wiring.

| Value             | Provider                                                                | Wallet behavior                      |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `devnet` or unset | Local Katana RPC plus hardcoded dev accounts in `src/app/providers.tsx` | Account dropdown.                    |
| `sepolia`         | Cartridge Controller through `@starknet-react/core`                     | Connect button and session policies. |

The shared hook is `useAccount()` from `src/app/providers.tsx`.

## Environment

For local development:

```bash
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=http://localhost:5050
NEXT_PUBLIC_TORII_URL=http://localhost:8080
```

For Sepolia, set contract addresses explicitly. Several direct-call wrappers still have older fallback addresses.

```bash
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia

NEXT_PUBLIC_ACTIONS_ADDRESS=0x2e9f46df80daf57789a15140c272e22575893e8db75e957ba3efbc020bb262a
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x1c5ff97432e3f25892efbae549b4d43c84768a0b824f74caa590c932c491efd
NEXT_PUBLIC_ACTIONS_1V1_ADDRESS=0x4242c71cda43bdc6f24e0baa6eb353f1cca6e960cb3e622787c46e5083ff516
NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS=0x6a6b677b9dea4f766b10dcfe2907ad60861103263aa85c2ca2122db86eb2c52
NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS=0x7f57549212a1db5b5cf8a1ac29eeed62f7e8566a5c08f16c737eedf54aa1842
NEXT_PUBLIC_CRAFTING_1V1_ADDRESS=0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130
NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS=0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea
NEXT_PUBLIC_CONQUEST_ADDRESS=0x305fdf6f2fe07c08436fea5ea4e7c77b9f7515654e4e764af7c131d848b441f
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05
```

## Commands

```bash
bun install
bun run dev
bun run lint
bun run test
bun run build
```

`predev` and `prebuild` run `scripts/copy-manifests.js`, which copies `manifest_dev.json` and `manifest_sepolia.json`
from the repo root into `src/manifests/`.

## Data Access

- `src/lib/dojoConfig.ts` selects the dev or Sepolia manifest and exposes `TORII_URL`, `RPC_URL`, `CHAIN_ID`, and
  `WORLD_ADDRESS`.
- `src/lib/toriiSql.ts` is the shared Torii SQL client. Use `sqlHex` and `sqlInt` helpers for interpolated values.
- `src/lib/worldState.ts` reads `Parcel`, `TileAdjacency`, `WorldConfig`, and `PlayerKingdom`.
- `src/lib/gameState1v1.ts` uses Dojo SDK hooks for match subscriptions.
- `src/lib/useResourceBalances.ts` reads token balances through Dojo SDK `useTokens`.
- `src/lib/abilityToken.ts` reads ERC-1155 ability balances and on-chain metadata through Starknet RPC.

## World Map

`src/components/TilingMap.tsx` renders parcels using Three.js and `src/lib/tileGeometry.json`. The current geometry is a
40-tile square/rhombus graph. It draws adjacency lines from Torii `TileAdjacency` rows and colors tiles by owner, parcel
type, home status, and stranded status.

The latest geometry seed may not match the currently initialized Sepolia world until contracts are redeployed or
reinitialized with the same seed.

## Session Policies

Cartridge policies live in `src/app/providers.tsx`. Add every user-triggered entrypoint before shipping a UI path that
calls it. Existing sessions keep the old policy set; players must reconnect after policy changes.

## Current Gaps To Keep In Mind

- `src/lib/tiers.ts` says Basileia has 4 ability slots. Cairo currently allows 3 at tier 3.
- Resource token defaults are split between old and v7 addresses. Align `useResourceBalances.ts`, MCP config defaults,
  and scripts before relying on live balances.
- `scripts/local-dev.sh` still contains GraphQL-era text and does not grant every modern writer permission on fallback.
