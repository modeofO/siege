# Spectator Mode for Live Matches

**Date:** 2026-05-19
**Issue:** #40
**Status:** Design approved

## Motivation

Two use cases drive this feature:

1. **Agent spectating (primary):** The player kicks off an MCP agent to play a match, then opens a browser tab to watch it play out visually in real-time. The MCP server returns a clickable spectator URL alongside the match ID.
2. **Public spectating:** Any connected player can browse active matches on the world page and click into a read-only live view via a shareable link.

The commit-reveal game model means spectators must not see unrevealed allocations — an opponent could spectate their own match to gain information. The on-chain data naturally enforces this (commitments are Poseidon hashes), but the frontend must also avoid rendering partial reveals.

## Design Constraint: Zero New Dependencies

No new NPM packages. Everything required already exists in the repo: Dojo SDK hooks, Torii SQL, display components. Given the current climate of supply-chain attacks on NPM, this is a hard constraint.

## Architecture

### 1. Spectator Page

**Route:** `/match-1v1/[id]/spectate`
**File:** `frontend/src/app/match-1v1/[id]/spectate/page.tsx`

A new client-side page that subscribes to match state via the existing gRPC hooks and renders read-only display components.

**Hooks used (all from `gameState1v1.ts`, no modifications):**
- `useMatchState1v1(matchId)` — vault HP, phase, round, players
- `useRoundStatus1v1(matchId, round)` — commit/reveal counts
- `useRoundHistory1v1(matchId)` — resolved round breakdowns
- `useRoundModifiers1v1(matchId, round)` — gate modifiers
- `useMatchStakes1v1(matchId)` — staked abilities (if staked match)

**Components imported (all existing, no modifications):**
- `BattlefieldView` — animated troop grid
- `MatchStakesHeader` — staked ability display
- `HoldStatusStrip` — faction/hold info for both players

**Spectator-specific rendering:**
- Neutral labeling: "Player A" / "Player B" instead of "Your Citadel" / "Enemy Citadel"
- "SPECTATING" badge in the header
- Phase status with neutral text: "Both players committing...", "Waiting for reveals...", "Round resolving...", "Match finished"
- War Dispatch Log with expandable round breakdowns (same format as player view)
- No wallet connection required to view — but the page itself doesn't need to gate on it since it's read-only
- No interactive elements: no AllocationForm1v1, no commit/reveal/resolve buttons, no MatchEndActions

**End state:** When the match finishes, show final result (winner, vault HP, total rounds) and full round history. No settle/claim UI.

### 2. Phase Visibility Rules

The core safety rule: **no partial reveal rendering**. Even though a single player's reveal is readable from Torii once it lands on-chain, the spectator view waits for `reveal_count == 2` before showing any allocations for the current round.

| Phase | Spectator sees | Safety |
|-------|---------------|--------|
| Committing | "Both players committing..." + commit count (0/2, 1/2). BattlefieldView shows previous round's resolved state. | Commitments are Poseidon hashes — nothing to leak. |
| Revealing | "Waiting for reveals..." + reveal count (0/2, 1/2). BattlefieldView unchanged from commit phase. | Partial reveals exist on-chain but are NOT rendered. Prevents opponent-as-spectator from seeing the other player's reveal before submitting their own. |
| Resolving | Full round breakdown — attack, defense, traps, modifiers, damage per gate. BattlefieldView updates with both players' allocations. | Both players committed and revealed. Safe to show everything. |
| Finished | Final result + all round history. | All data is historical. |

During commit and reveal phases, the BattlefieldView renders the **previous round's resolved state** (troop positions from the last resolution), keeping the view visually interesting rather than empty.

### 3. Live Battles Section on World Page

**File modified:** `frontend/src/app/world/page.tsx`
**Location:** Between the existing "Battles" section (create/join links) and the Faction panel.

**Data source:** Torii SQL query via `toriiSql()`:
```sql
SELECT * FROM "siege_dojo-MatchState1v1" WHERE status != 2
```
(status 2 = Finished)

**Display:** Compact list where each row shows:
- Match #ID
- Player A vs Player B (truncated addresses)
- Round N
- Vault HP bars (compact)
- Phase badge (committing / revealing / resolving)
- Clickable — links to `/match-1v1/<id>/spectate`

**Polling:** Same `refreshKey` + `setInterval` pattern used elsewhere on the world page. ~15 second interval.

**Empty state:** "No active battles" when no matches are in progress.

**Wallet requirement:** Only visible to connected users (inside the existing wallet gate on the world page).

### 4. MCP Server Changes

**Files modified:**
- `mcp-server-2/src/config.ts` — add `frontendUrl` config field, read from `SIEGE_FRONTEND_URL` env var, default `https://localhost:3000`
- `mcp-server-2/src/tools.ts` — three tools add `spectate_url` to their response

**Tools updated:**

| Tool | Current response | Added field |
|------|-----------------|-------------|
| `siege_create_match` | `{ tx_hash, match_id, player_a, player_b }` | `spectate_url: "<frontendUrl>/match-1v1/<match_id>/spectate"` |
| `siege_create_staked_match` | `{ tx_hash, match_id, ... }` | `spectate_url: "<frontendUrl>/match-1v1/<match_id>/spectate"` |
| `siege_get_match_state` | `{ match_id, phase, ... }` | `spectate_url: "<frontendUrl>/match-1v1/<match_id>/spectate"` |

The `spectate_url` is only included when `match_id` is known (not null).

No new MCP tools. No new dependencies.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/app/match-1v1/[id]/spectate/page.tsx` | **New** — spectator page |
| `frontend/src/app/world/page.tsx` | Add Live Battles section |
| `mcp-server-2/src/tools.ts` | Add `spectate_url` to 3 tool responses |
| `mcp-server-2/src/config.ts` | Add `frontendUrl` config |

## Files NOT Changed

- Cairo contracts — no on-chain changes
- `gameState1v1.ts` — hooks used as-is
- Display components (BattlefieldView, MatchStakesHeader, etc.) — imported as-is
- `package.json` — zero new dependencies

## Out of Scope (Future Follow-ups)

- Real-time event ticker ("Player A committed", "Trap triggered!") — Approach B from brainstorming
- Spectator count / "N watching" indicator
- Match discovery beyond the world page (dedicated /spectate listing page)
- Anonymous spectating without wallet connection
