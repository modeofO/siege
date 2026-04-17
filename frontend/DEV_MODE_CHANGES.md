# Dev Mode Changes — Katana Local Accounts

## Summary

Replaced Cartridge Controller + Sepolia setup with local Katana dev accounts for development. No wallet extensions
needed — users pick from a dropdown of prefunded accounts.

## Changes Made

### 1. `src/app/providers.tsx` — Complete rewrite

- Removed `@cartridge/connector`, `@cartridge/controller`, `@starknet-react/core`, `@starknet-react/chains` imports
- Created `DevAccountContext` with 4 prefunded Katana accounts
- Exports `useAccount()` hook returning `{ account, address, isConnected, selectedIndex, setSelectedIndex, accounts }`
- Uses starknet.js `RpcProvider` + `Account` (v8 options-based constructor)
- RPC URL from `NEXT_PUBLIC_RPC_URL` env var (default: `http://localhost:5050`)

### 2. `src/components/AccountSelector.tsx` — New component

- Dropdown selector for dev accounts ("Dev Account 0 (0xb3ff…28ca)")
- Dark-themed to match existing UI

### 3. `src/components/Navbar.tsx` — Updated

- Removed connect/disconnect wallet buttons
- Added `AccountSelector` dropdown + truncated address display

### 4. `src/app/match/[id]/page.tsx` — Team/role detection

- Removed hardcoded `YOUR_TEAM = 1` and `YOUR_ROLE = "attacker"`
- Now queries on-chain `MatchState` via new `useMatchPlayers()` hook
- Compares connected wallet address against `team_a_attacker`, `team_a_defender`, `team_b_attacker`, `team_b_defender`
  fields

### 5. `src/lib/gameState.ts` — Added `useMatchPlayers()`

- New hook that queries Torii GraphQL for MatchState player addresses
- Returns `{ teamAAttacker, teamADefender, teamBAttacker, teamBDefender }`

### 6. `src/app/match/create/page.tsx` — Better match ID parsing

- After creating a match, queries Torii for `MatchCounter` model to get real `match_id`
- Falls back to transaction hash if query fails

### 7. `src/app/match/join/page.tsx` — Updated import

- Changed `useAccount` import from `@starknet-react/core` to `@/app/providers`

### 8. `package.json` — Cleaned dependencies

- Removed: `@cartridge/connector`, `@cartridge/controller`, `@starknet-react/chains`, `@starknet-react/core`,
  `get-starknet-core`
- Kept: `starknet` ^8.9.2

### 9. `.env.local` — Created

```
NEXT_PUBLIC_RPC_URL=http://localhost:5050
NEXT_PUBLIC_TORII_URL=http://localhost:8080
NEXT_PUBLIC_ACTIONS_ADDRESS=0x0
NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS=0x0
```

## Dev Accounts (Katana defaults)

| #   | Address               | Private Key          |
| --- | --------------------- | -------------------- |
| 0   | `0xb3ff441a...5828ca` | `0x2bbf4f9f...ebcd2` |
| 1   | `0xe29882a1...f5c8a`  | `0x14d6672d...61642` |
| 2   | `0x29873c31...b89af`  | `0xc5b2fcab...0f912` |
| 3   | `0x2d71e9c9...53bbc`  | `0x33003003...150b`  |

## Cairo Model Fields (reference)

- `MatchState`: `team_a_attacker`, `team_a_defender`, `team_b_attacker`, `team_b_defender`, `vault_a_hp`, `vault_b_hp`,
  `current_round`, `status`
- `Commitment`: `match_id`, `round`, `role`, `hash`, `committed`, `revealed`
- `RoundMoves`: per-team attacker/defender move slots (atk_a_p0-2, def_a_g0-2, etc.)

## Build Status

✅ `npm run build` passes with no errors.
