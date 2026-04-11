---
name: siege-game
description: Development guide for Siege, an asymmetric turn-based strategy game on Starknet where human+AI teams compete. Use when working on Siege contracts (Cairo/Dojo), the MCP server (TypeScript), the Next.js frontend, or debugging game logic (commit-reveal, resolution, budget). Covers architecture, data flow, common issues, and how to make updates to each layer.
---

# Siege Game Development

> **Scope note.** This skill covers the **2v2 commit-reveal core** — `actions.cairo`, `commit_reveal.cairo`, `resolution.cairo`, the MCP server, and the `/match` frontend. Most active feature work now lives in **1v1 mode** (`*_1v1` contracts), **crafting/abilities**, and the **world metagame** (`world_system`, `conquest`, parcels, kingdoms, pillaging, reputation). For those, read `CLAUDE.md` at the repo root plus the relevant spec in `docs/superpowers/specs/` — this skill stays focused on the 2v2 flow so it remains load-bearing for the original architecture.

## Architecture Overview

Siege is a 2v2 turn-based strategy game. Each team = 1 human + 1 AI agent. One attacks, one defends. Roles are secret. Each side has a vault (100 HP); first to 0 loses.

```
┌─────────────────────────────────────────────────────┐
│                    ON-CHAIN (Dojo)                   │
│                                                     │
│  actions.cairo ──→ create_match, get_team_budget    │
│  commit_reveal.cairo ──→ commit, reveal, timeout    │
│  resolution.cairo ──→ resolve_round (damage+nodes)  │
│                                                     │
│  Models: MatchState, RoundMoves, Commitment,        │
│          NodeState, MatchCounter                    │
└──────────────────┬──────────────────────────────────┘
                   │ Torii indexer (GraphQL/SQL)
                   ▼
┌──────────────────────────────────────────────────────┐
│              MCP SERVER (TypeScript)                 │
│                                                      │
│  siege_get_match_state    siege_build_commit          │
│  siege_get_round_history  siege_build_reveal_attacker │
│  siege_get_my_status      siege_build_reveal_defender │
│                                                      │
│  Reads state via Torii GraphQL (preferred) or RPC    │
│  Builds Poseidon hashes + calldata for agents        │
│  Never touches private keys                          │
└──────────────────┬───────────────────────────────────┘
                   │ starknet-agentic MCP (wallet ops)
                   ▼
┌──────────────────────────────────────────────────────┐
│              FRONTEND (Next.js + starknet.js)        │
│                                                      │
│  /match/create  /match/join  /match/[id]             │
│  Components: VaultDisplay, PressurePointAllocator,   │
│    NodeMap, RoundHistory, Timer, EndScreen           │
└──────────────────────────────────────────────────────┘
```

## Project Layout

```
siege_dojo/
├── src/
│   ├── models/         # Dojo models (on-chain state)
│   │   ├── match_state.cairo    # MatchState: vaults, players, round, status
│   │   ├── round_moves.cairo    # RoundMoves: all 4 players' allocations per round
│   │   ├── commitment.cairo     # Commitment: hash + committed/revealed flags
│   │   ├── node_state.cairo     # NodeState: resource node ownership
│   │   └── match_counter.cairo  # MatchCounter: auto-increment match IDs
│   ├── systems/        # Dojo systems (on-chain logic)
│   │   ├── actions.cairo        # Match creation + budget queries
│   │   ├── commit_reveal.cairo  # Commit/reveal/timeout logic
│   │   └── resolution.cairo     # Damage calc, repairs, node contests
│   └── tests/          # Cairo tests
├── mcp-server/         # MCP server for AI agents
│   └── src/
│       ├── index.ts    # MCP tool definitions + handlers
│       ├── state.ts    # Torii/RPC state reading
│       └── hash.ts     # Poseidon hashing (must match Cairo)
├── frontend/           # Next.js web UI
│   └── src/
│       ├── app/        # Pages (create, join, match view)
│       ├── components/ # Game UI components
│       └── lib/        # contracts.ts, gameState.ts, crypto.ts
├── Scarb.toml          # Cairo project config
└── dojo_dev.toml       # Dojo dev config
```

## Turn Flow (Data Path)

Each round follows commit → reveal → resolve:

1. **All 4 players commit** — each calls `commit(match_id, hash)` with a Poseidon hash of their moves + random salt
2. **Commit deadline** — set when first commit arrives (300s). `force_timeout` auto-passes missing players
3. **All 4 players reveal** — attackers call `reveal_attacker(...)`, defenders call `reveal_defender(...)`. Contract verifies hash matches and budget isn't exceeded
4. **Reveal deadline** — set when all commits are in (300s). `force_timeout` auto-reveals with zeroes
5. **Auto-resolve** — when 4th reveal lands, `resolution.resolve_round()` is called automatically:
   - Damage per pressure point: `max(0, attack - defense)` → applied to vault
   - Repairs: capped at 3 HP/turn, applied before damage
   - Node contests: team with more total units on a node wins it
   - If any vault hits 0: match status → Finished
   - Otherwise: round increments

### Role Constants
```
ROLE_ATK_A = 0  (Team A attacker → attacks Team B vault)
ROLE_DEF_A = 1  (Team A defender → defends Team A vault)
ROLE_ATK_B = 2  (Team B attacker → attacks Team A vault)
ROLE_DEF_B = 3  (Team B defender → defends Team B vault)
```

### Budget System
- Base: 10 per team per turn
- +1 per controlled resource node (3 nodes total, max +3)
- Budget is shared: attacker + defender on the same team share one pool
- Attacker spends on: pressure_points[3] + node_contest[3]
- Defender spends on: garrison[3] + repair + node_contest[3]

## Common Tasks

### Adding a new model field
1. Add field to the model struct in `src/models/<model>.cairo`
2. Update any system that reads/writes that model
3. Update `mcp-server/src/state.ts` — add field to the TypeScript interface and both Torii query + RPC fallback parser
4. If it's visible in the UI, update the relevant frontend component
5. Redeploy: `sozo build && sozo migrate` (contracts), rebuild MCP server, rebuild frontend

### Changing game balance (damage formula, repair cap, budget)
- Damage formula: `resolution.cairo` → `resolve_round`
- Repair cap: `resolution.cairo` (currently hardcoded `3`)
- Base budget: `commit_reveal.cairo` → `calc_team_budget` and `actions.cairo` → `get_team_budget` (both hardcode `10`)
- Node bonus: same functions (currently `+1` per node)

### Adding a new MCP tool
1. Add tool definition to `tools` array in `mcp-server/src/index.ts`
2. Add handler case in the `switch (name)` block
3. If it needs new state queries, add them to `state.ts`
4. Rebuild: `cd mcp-server && npm run build`

### Debugging hash mismatches
The commit hash **must** match exactly between MCP server and Cairo contract:
- **Attacker**: `Poseidon(salt, p0, p1, p2, nc0, nc1, nc2)` — 7 elements
- **Defender**: `Poseidon(salt, g0, g1, g2, repair, nc0, nc1, nc2)` — 8 elements
- Cairo uses `PoseidonTrait::new().update(x).update(y)...finalize()`
- TypeScript uses `starknet.hash.computePoseidonHashOnElements([...])`
- Common issue: element order mismatch or forgetting to convert to BigInt

### Debugging timeout/forfeit
- `force_timeout` has two branches: commit timeout and reveal timeout
- Players who didn't commit get auto-committed+revealed with all-zero moves
- Players who committed but didn't reveal get auto-revealed with all-zero moves
- Check `commit_deadline` and `reveal_deadline` in `RoundMoves`

## Deployed Infrastructure

See [references/deployment.md](references/deployment.md) for current URLs, contract addresses, and Railway projects.

## Key Design Decisions

- **Dojo over raw Cairo**: Uses Dojo ECS for model storage and world contract. Current toolchain: Dojo v1.8.0, sozo v1.8.6, scarb 2.13.1, Cairo 2.13.1 (see repo-root `CLAUDE.md` for the full matrix and upgrade notes).
- **Torii-first reads**: MCP server tries Torii GraphQL before falling back to direct RPC entity reads
- **MCP server never holds keys**: It builds calldata; the agent submits txs via starknet-agentic session keys scoped to the game contract
- **Simultaneous turns via commit-reveal**: Both teams commit hashed moves, then reveal. Prevents second-mover advantage
- **Repair before damage**: In resolution, HP is restored first, then damage applied. This slightly favors defense

## Pointers to neighbouring systems

These live outside the scope of this skill but regularly interact with the 2v2 layer:

- **1v1 mode** — `src/systems/actions_1v1.cairo`, `commit_reveal_1v1.cairo`, `resolution_1v1.cairo`. Same commit-reveal pattern but solo allocations, gate modifiers, traps, and ability effects. Budgets, HP, and hash layouts differ — do not port constants blindly.
- **Crafting and abilities** — `src/systems/crafting_1v1.cairo` + `src/tokens/ability_token.cairo` (ERC-1155, 10 tokens across 2 tiers). Abilities mutate per-gate values and total damage inside `resolution_1v1`.
- **World metagame** — `src/systems/world_system.cairo` (register player, staked matches, parcel claims, drip, pillage, kingdom upgrades) and `src/systems/conquest.cairo` (async preset-defense attacks via vRF). Models: `parcel`, `player_kingdom`, `preset_defense`, `player_reputation`, `match_record`, `match_stakes_1v1`, `pillage`, `pillage_eligibility`, `world_config`.
- **Design specs** — `docs/superpowers/specs/` (reputation, ability tiers, conquest revisions, pillaging, alliances, game direction). These are usually more current than either this skill or `CLAUDE.md`.
