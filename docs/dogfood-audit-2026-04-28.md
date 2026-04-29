# Dogfood Audit: Siege Dojo Stack

**Date:** 2026-04-28
**Branch:** `feat/circuit-forge` (20 commits ahead of main)
**Build:** TypeScript clean, ESLint clean (production code)
**Closes:** #10

---

## Prerequisites

| Issue | Title | Status |
|-------|-------|--------|
| #1 | world_system: spatial starting algorithm | **Closed** |
| #2 | match-1v1: last round not resolving | **Closed** |
| #3 | match-1v1 UI: ability selector | **Closed** |
| #4 | match-1v1 UI: stakes display | **Closed** |
| #5 | match-1v1: auto-reveal stuck (session policies) | **Closed** |
| #6 | match-1v1 UI: Hold status on match page | **Closed** |
| #7 | world_system: untyped parcels at init | **Closed** |
| #8 | matchmaking system | **Open** (not implemented) |
| #9 | world UI: render ability SVGs | **Closed** |

7/8 prerequisites closed. #8 (matchmaking) remains open — no backend or frontend implementation exists.

---

## Flow-by-Flow Audit

### Onboarding

| Item | Status | Notes |
|------|--------|-------|
| Landing page splash + single CTA | ✅ | "SIEGE" header + "ENTER THE MARCHES" button |
| CTA routes to `/world` | ✅ | `href="/world"` wired |
| Wallet connect (Cartridge Controller) | ✅ | `ControllerConnector` + full `SESSION_POLICIES` in `providers.tsx` |
| Hold registration (3 home types, location, starter abilities) | ✅ | `RegisterKingdom.tsx`: 3 parcel type toggles, modal on world page, calls `register_player` |

### Marches (World Hub)

| Item | Status | Notes |
|------|--------|-------|
| Hex grid renders (parcels, markers, ownership) | ✅ | SVG hex geometry, color-coded types, ownership checks, home flag (⛊) |
| Parcel tooltip (position, type, owner, home flag) | ✅ | Hover tooltip with all required fields |
| Your Hold summary (home types, ability icons, parcel count) | ✅ | Home types with color borders, `AbilityIcon` for owned abilities, parcel count in header |
| Battles section (CREATE/JOIN → correct routes) | ✅ | Buttons link to `/match-1v1/create` and `/match-1v1/join` |
| Factions (Polis locked, Unaligned, Invites, In-faction) | ✅ | All 4 views in `FactionPanel.tsx` with proper tier gating |

### Matches (1v1)

| Item | Status | Notes |
|------|--------|-------|
| Create match → share ID | ✅ | Practice + staked paths, ID displayed for sharing |
| Opponent joins via ID | ✅ | ID input, escrow validation for staked, direct nav for practice |
| Stakes display | ✅ | `MatchStakesHeader` shows wagered abilities, practice vs staked badge |
| Hold status display | ✅ | `HoldStatusStrip` shows tier, parcels, wins, bracket for both players |
| Allocation form (pressure, gates, repair, nodes, traps) | ✅ | 6 gate inputs, repair (max 3), 3 node contests, trap toggles (2 pts each), budget enforcement |
| Ability selector (pick, target gate, see effect) | ✅ | Grid selection, gate target for Siege Sword, T2 markers |
| Commit flow (wallet, on-chain, confirmation) | ✅ | Salt → hash → `account.execute()` → confirming state |
| Auto-reveal (no manual refresh) | ✅ | Triggers at 2 commits, auto-submits reveal from localStorage |
| Round resolution (damage calc, HP updates, events) | ✅ | Elected player auto-resolves via VRF, War Dispatch Log shows gate breakdown + node traps |
| Match end (final round resolves, winner, UI unfreezes) | ✅ | Victory/Defeat/Draw screen, stats, settle escrow button |
| Parcel claim (winner picks adjacent parcel + type) | ✅ | Adjacent parcel picker, type selection (Forge/Quarry/Grove), cap enforcement |

### Crafting

| Item | Status | Notes |
|------|--------|-------|
| Ability browser (SVGs, effects) | ✅ | 5 T1 abilities with cards, 3D perspective hover, cost breakdown |
| Resource balance check | ✅ | All 6 resources displayed with live balances, red indicator if insufficient |
| Craft T1 (burns resources, mints ability) | ✅ | Multicall approve + `craft_ability`, button disabled when unaffordable |
| Craft T2 (burns T1 + resources, mints T2) | ❌ | **Contract + session policy ready, but UI hidden.** Craft page only renders T1 cards (IDs 1–5). `craftAbilityTier2()` exists in `craftingContracts.ts` but is unreachable. `requiresT1` metadata defined but unused. |
| Wallet/session coverage | ⚠️ | T1 fully covered. T2 policy exists (`craft_ability_tier2`) but never triggered from UI. |

### Conquest (Async PvE)

| Item | Status | Notes |
|------|--------|-------|
| Set preset defense | ⛔ | **Backend ready** (`setPresetDefense()` in `conquest.ts`, session policy configured). **No UI form exists.** `usePresetDefense()` hook defined but unused. |
| Initiate conquest (pick target, allocate, use ability) | ⛔ | **Backend ready** (`initiateConquest()` in `conquest.ts`, session policy configured). **No UI.** HexGrid has no conquest interaction. |
| vRF resolves preset selection | ⛔ | VRF infra exists for 1v1 matches but **no conquest-specific VRF wiring** in frontend. |
| Combat results display | ⛔ | No results screen. |
| Win: parcel transfers | ⛔ | No UI feedback. |
| Loss behavior | ⛔ | No UI feedback. |

### Pillage

| Item | Status | Notes |
|------|--------|-------|
| Eligibility display | ⛔ | `usePillageEligibilities()` hook exists in `pillage.ts` — **never imported or rendered by any component.** |
| Initiate pillage | ⛔ | **Backend ready** (`initiatePillage()` in `pillage.ts`, session policy configured). **No UI selector.** |
| Claim drip reroute | ⛔ | **Backend ready** (`claimPillageDrip()` in `pillage.ts`). **No button/flow.** |
| Break pillage (target beats pillager) | ⛔ | No frontend wiring. Backend logic exists in `world_system.cairo`. |
| Expiry display | ⛔ | `formatTimeRemaining()` utility exists in `pillage.ts` — **no UI uses it.** `useActivePillages()` defined but unused. |

### Factions

| Item | Status | Notes |
|------|--------|-------|
| Create faction (Strategos-gated, burns resources) | ✅ | `CreateFactionModal`: name/tag inputs, tier gate, cost display (30 Iron, 30 Stone, 20 Wood) |
| Invite + accept flow | ✅ | Leader invite form + `InvitesView` with pending invites and ACCEPT buttons |
| Member list with leader badge | ✅ | Members section with ★ for leader, "you" label for self |
| Kick (two-click confirm) | ✅ | KICK → CONFIRM/CANCEL, 5s auto-revert, leader-only |
| Leave (two-click, leader vs member copy) | ✅ | Contextual: leader sees "dissolve faction", member sees "24h cooldown" |
| Reinforcement toggle | ✅ | ON/OFF button, reads `factionReinforcementEnabled` |
| Friendly-fire block in conquest | ⚠️ | **Contract enforces.** No frontend indicator warns player they can't attack allies. |
| Pillage protection via ally adjacency | ⚠️ | **Contract enforces.** No UI shows which parcels are protected. |
| Conquest reinforcement pool | ⚠️ | Description text + data field exist. **No UI to see active allies or reinforcement preview.** |

### Kingdom Tier (Hold Upgrade)

| Item | Status | Notes |
|------|--------|-------|
| Tier progression on wins | ✅ | `PlayerKingdomData` includes `tier` + `totalWins`, fetched from chain |
| Upgrade cost + requirements displayed | ❌ | `KingdomUpgrade.tsx` component exists with full UI (progress bar, resource costs, upgrade button) — **but is dead code, never rendered anywhere.** `UPGRADE_COSTS` and `TIER_INFO` defined in `tiers.ts`. |
| `upgrade_kingdom` flow | ❌ | `upgradeKingdom()` function exists in `contracts1v1.ts`, session policy configured — **but button is unreachable** since `KingdomUpgrade` component is never mounted. |
| Tier-gated mechanics activate | ✅ | Factions locked until Strategos (tier 1). Match creation respects `TIER_INFO[tier].abilitySlots`. |

### Reputation

| Item | Status | Notes |
|------|--------|-------|
| Bracket derivation on match win/loss | ✅ | `usePlayerReputation()` fetches bracket from chain, `BRACKET_NAMES` maps 0–4 |
| Streak tracking | ❌ | Data fetched (`currentStreak`, `bestStreak` in `PlayerReputationData`) — **no UI displays it anywhere.** |
| Display on profile/match page | ⚠️ | `HoldStatusStrip` shows tier, parcels, wins, bracket. **Missing:** streak, win rate (both computed but unused). |

### Matchmaking (#8)

| Item | Status | Notes |
|------|--------|-------|
| Queue for match | ⛔ | No queue page, no queue UI |
| Auto-match to compatible opponent | ⛔ | No backend support, no contract for auto-assignment |
| Timeout / leave queue | ⛔ | N/A |
| Staked vs unstaked queue separation | ⛔ | N/A |

---

## Summary by Flow

| Flow | ✅ | ⚠️ | ❌ | ⛔ |
|------|----|----|----|----|
| **Onboarding** | 4 | 0 | 0 | 0 |
| **Marches** | 5 | 0 | 0 | 0 |
| **Matches (1v1)** | 11 | 0 | 0 | 0 |
| **Crafting** | 3 | 1 | 1 | 0 |
| **Conquest** | 0 | 0 | 0 | 6 |
| **Pillage** | 0 | 0 | 0 | 5 |
| **Factions** | 6 | 3 | 0 | 0 |
| **Kingdom Tier** | 2 | 0 | 2 | 0 |
| **Reputation** | 1 | 1 | 1 | 0 |
| **Matchmaking** | 0 | 0 | 0 | 4 |
| **TOTAL** | **32** | **5** | **4** | **15** |

---

## Bug Count by Flow

| Flow | Bugs |
|------|------|
| Onboarding | 0 |
| Marches | 0 |
| Matches (1v1) | 0 |
| Crafting | 1 (T2 UI missing) |
| Conquest | 0 (entire flow missing) |
| Pillage | 0 (entire flow missing) |
| Factions | 0 |
| Kingdom Tier | 1 (dead KingdomUpgrade component) |
| Reputation | 1 (streak data unused) |
| Matchmaking | 0 (not started) |

---

## Key Findings

### What works well
- **Core 1v1 match loop is solid.** Create → join → allocate → commit → auto-reveal → resolve → end screen → parcel claim — all 11 checklist items pass.
- **Onboarding is clean.** Single CTA, wallet connect, hold registration all work without friction.
- **World hub is complete.** Hex grid, tooltips, Hold summary, battles section, factions panel — all functional.
- **Faction system is the most polished metagame feature.** All CRUD operations work with proper two-click confirms and tier gating.
- **Session policies are comprehensive.** All 29 entrypoints covered — no wallet prompts during gameplay.

### What needs work

1. **Conquest and Pillage have zero UI.** Backend hooks (`conquest.ts`, `pillage.ts`) are wired with contract calls, session policies, and data-fetching hooks — but no component ever renders them. These are the largest missing features.

2. **T2 crafting UI is hidden.** The craft page only renders 5 T1 ability cards. The contract wrapper, session policy, and ability metadata (including `requiresT1` flag) are all ready — the page just needs to show IDs 6–10.

3. **KingdomUpgrade component is dead code.** Fully implemented (`KingdomUpgrade.tsx`) with progress bar, resource costs, and upgrade button — but never mounted in any page. Needs to be added to the world page.

4. **Reputation streak is fetched but invisible.** `currentStreak` and `bestStreak` are queried from chain but no component displays them. `winRate` is also computed but unused.

5. **Faction backend protections have no UI indicators.** Friendly-fire blocking, pillage protection via ally adjacency, and conquest reinforcement pools all work on-chain but give players no visual feedback.

### Recommendation for next sprint

Priority order based on backend readiness (hooks already wired → faster to ship):

1. **Mount `KingdomUpgrade`** on the world page — smallest lift, highest impact on progression visibility
2. **Add T2 cards to craft page** — metadata and contract wrapper exist, just render IDs 6–10
3. **Show streak + win rate** in `HoldStatusStrip` — data already fetched
4. **Build Conquest UI** — preset defense form + conquest initiator on hex grid (backend fully ready)
5. **Build Pillage UI** — eligibility display + initiate/claim/expiry (backend fully ready)
6. **Add faction UI indicators** — friendly-fire warning, protection badges, reinforcement preview
7. **Matchmaking** (#8) — no backend exists, largest lift
