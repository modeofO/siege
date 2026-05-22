> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Siege Dojo — Game Direction Redesign

**Date:** 2026-04-08
**Status:** Approved design
**Supersedes:** `2026-04-06-world-system-design.md`, `2026-04-06-phase-2b-ability-effects-design.md` (concepts absorbed and revised here)

## Problem Statement

The current game has three core issues:

1. **Flat progression** — A new player can access the same 5 abilities as a veteran. There's no reward for long-term play.
2. **No personal identity** — Matches are anonymous, there's no reputation, no rivalry system, no visible history. Players don't feel known.
3. **No win condition** — The game is an endless sandbox with no goal, no urgency, and no story arc.

The game borrows from battle royale (1v1 stakes) and Clash of Clans (resource farming, territory) but doesn't fully deliver on either because the commit-reveal async mechanic prevents real-time tension, and the flat ability system prevents meaningful progression.

## Design Philosophy

- **Core battle loop is sacred** — the 1v1 commit-reveal allocation puzzle (gates, nodes, repair, traps) stays exactly as-is. It's the atomic unit of all gameplay.
- **Everything onchain** — all game state, resources, abilities, trophies, and reputation live on Starknet. Your wallet is your identity.
- **Three types of depth** — power (kingdom tier), options (ability tiers), and status (reputation and trophies). Veterans have all three; new players ramp into them.
- **Social by default** — known opponents, visible identity, alliances, rivalries. The game remembers who you are and who you've fought.
- **Always something to fight for** — campaigns at three tiers ensure there's never a dead period.

## Section 1: Core Battle Loop

The 1v1 commit-reveal game remains the foundation. Both match types (regular and conquest) use this system.

### What stays unchanged
- Budget of 10 allocated across attack (3 pressure points), defense (3 gates + repair), nodes (3 resource nodes), and traps
- Gate modifiers via vRNG (Normal, Narrow Pass, Mirror, Deadlock, Reflection) visible before allocation
- Commit-reveal with Poseidon hashing — blind simultaneous decisions
- 10 rounds per regular match
- Resource nodes generate tokens each round you hold them

### What changes
- **Opponent identity is visible** — name, kingdom tier, reputation stats, alliance tag shown pre-match and during play
- **Match history recorded onchain** — who fought who, who won, what was at stake. Feeds the reputation system.
- **Ability slots scale with kingdom tier:**
  - Polis: 1 ability slot
  - Strategos: 2 ability slots
  - Hegemonia: 3 ability slots
  - Basileia: 4 ability slots
- **Ability tiers** (T1/T2/T3) replace flat abilities. A T3 Siege Sword is stronger than a T1. Same 5 types, but tier matters.

The battle itself is still pure skill + reads — budget is always 10, gates are always 3. But *what you bring into the puzzle* reflects your progression.

## Section 2: Kingdom Progression (Slow, Permanent)

Your kingdom is your onchain identity — it represents everything you've built over time.

### Tiers

| Tier | Name | Ability Slots | Defense Presets | Parcel Cap | Unlock Requirements |
|------|------|--------------|-----------------|------------|-------------------|
| 0 | Polis | 1 | 1 | 2 | Starting tier (free) |
| 1 | Strategos | 2 | 2 | 5 | Cumulative wins + resource investment |
| 2 | Hegemonia | 3 | 3 | 8 | Cumulative wins + rarer resources + campaign participation |
| 3 | Basileia | 4 | 4 | 12 | Cumulative wins + T3 resources + campaign victory |

Exact numeric thresholds TBD during implementation.

### What each tier unlocks
- **Ability slots** — how many abilities you bring into battle. Primary power advantage.
- **Defense presets** — stored defense configurations for conquest. More presets = harder to attack (vRNG picks from larger pool).
- **Parcel cap** — maximum conquered (non-home) parcels you can hold. Prevents early snowballing.
- **Visual identity** — kingdom appearance evolves on the hex map. Other players see your tier at a glance.

### Upgrade rules
- Requires cumulative wins (not streak — you can lose and still progress)
- Requires burning resources (creates economic sink)
- Higher tiers require campaign-exclusive materials (can't reach Basileia without engaging campaigns)
- **Upgrades are permanent** — you never lose your tier. Territory and abilities can be lost, but tier cannot.

## Section 3: Arsenal & Ability Tiers (Medium, Collectible)

The 5 ability types remain. They now come in 3 tiers of increasing power.

### Tier structure

| Tier | Crafting Cost | Source | Power Level |
|------|--------------|--------|-------------|
| T1 | Base resources (current system) | Craft anytime | Baseline effects |
| T2 | T1 ability + rarer resources | Craft anytime | ~1.5x effect strength |
| T3 | T2 ability + campaign-exclusive materials | Requires campaign materials | ~2x effect strength |

### Example scaling (Siege Sword)
- T1: Attack on target gate becomes 8
- T2: Attack on target gate becomes 10
- T3: Attack on target gate becomes 10 + 2 splash damage to adjacent gates

Exact values TBD during balancing.

### Ability effects (Phase 2B, revised)

| ID | Ability | T1 Effect |
|----|---------|-----------|
| 1 | Siege Sword | Max attack on target gate |
| 2 | Stone Cloak | Block all gate damage (not Ember Blast) |
| 3 | Ember Blast | Direct vault damage bypassing gates |
| 4 | Hex | Reduce opponent's total damage output |
| 5 | Fortify | Double defense values at all gates |

Resolution order (unchanged from Phase 2B design):
1. Gate modifiers → 2. Fortify → 3. Siege Sword → 4. Per-gate damage → 5. Stone Cloak → 6. Overflow/Reflection → 7. Hex → 8. Repair → 9. Ember Blast → 10. Trap damage

### Design rules
- **Consume-to-upgrade** — crafting T2 burns the T1 token + resources, mints T2. Same for T2→T3.
- **All tiers tradeable** — ERC-1155 tokens. Market economy emerges.
- **T3 gated by campaign materials** — ties progression to campaign engagement.
- **Staking in matches** — ability wagers are specific tokens. Win against someone with a T3 Stone Cloak → you take that T3 Stone Cloak.
- **Single use per match** — each brought ability activates once across 10 rounds.

### Commitment hash (revised)
16 elements: `salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target`
- `ability_id`: 0 = none, 1-5 = which ability type, tier determined by what the player brought
- `ability_target`: 0-2 = target gate (relevant for Siege Sword only)

## Section 4: Reputation System (Fast, Earned)

Reputation is your public onchain record. Earned, never bought.

### Components
- **Match record** — wins, losses, win rate. Per-opponent history (you can see your record against any player).
- **Rival graph** — players you've fought multiple times are marked as rivals. Frequent opponents with close win rates become "blood rivals" — visible on both profiles. Automatic, not opt-in.
- **Campaign record** — campaigns entered, placements, victories.
- **Alliance history** — factions joined, contribution records. Faction-hoppers have a visible trail.
- **Streak tracking** — current win streak, longest all-time streak.

### What reputation unlocks
- **Matchmaking brackets** — reputation tiers determine regular match opponents. Prevents veteran farming of new players.
- **Championship eligibility** — only the seasonal Championship event requires reputation/qualification. Regional and World campaigns are open to all.
- **Alliance recruitment signal** — factions see your full reputation before inviting you.

### Titles and trophies
- Earned for specific achievements (campaign wins, milestones, upsets, etc.)
- **Soulbound tokens** — visible in wallet, shown on profile, non-transferable.
- Displayed on the hex map next to your kingdom.

## Section 5: Alliances / Factions

Factions are onchain entities — a contract tracking membership, territory, and contributions.

### Formation and membership
- Any player can create a faction (costs resources to prevent spam)
- Factions have a name, tag (shown next to member names), and a leader
- Leader can invite/kick members. Changes recorded onchain (visible in alliance history).
- Benefits scale with *active* members (players who play matches), not headcount.
- Cooldown on leaving before joining another faction — prevents hopping during campaigns.

### Mechanical benefits
- **Shared borders** — faction territory treated as friendly. No accidental conquest between allies.
- **Conquest reinforcement** — nearby faction members contribute defense presets to the pool when a member is attacked. Attacker faces a harder fight.
- **Pillage protection** — faction members adjacent to your home parcels can block or reduce pillaging from outsiders.
- **Resource gifting** — faction members can transfer resources to each other (ERC-20 transfers with faction UI).
- **Campaign coordination** — faction members' contributions pooled toward shared campaign objectives.

### Solo viability
Every mechanical benefit caps at a level achievable solo — factions just get there faster:
- No shared defense, but more presets as kingdom tier rises
- No pillage protection, but strategic territory positioning helps
- No pooled contributions, but solo leaderboards exist for all campaigns
- **A solo Basileia is the rarest, most respected achievement on the map.**

### Faction reputation
- Faction-level reputation derived from member activity
- Faction leaderboard visible on world map
- Top factions in campaigns get faction-wide rewards

## Section 6: World Map & Territory

Persistent hex grid revised to fit the new systems.

### Map structure
- Hex grid that scales with player count — starts small, expands as players register
- Three parcel types: Forge (Iron/Linen), Quarry (Stone/Wood), Grove (Ember/Seeds)
- Parcels generate resources **only when the owner plays matches**

### Home parcels (3 per player)
- Permanent, unconquerable
- **Can be pillaged** — neighboring enemies siphon a percentage of resource production for X rounds
- Pillage broken by: winning a match against the raider, or faction ally intervention
- This is the "rock bottom punishment" — you're never out, but pillaged players are struggling and everyone can see it

### Conquered parcels
- Capped by kingdom tier (Polis: 2, Strategos: 5, Hegemonia: 8, Basileia: 12)
- Taken via conquest matches, lost when conquered by others

### Conquest matches
- 1 round, commit-reveal core
- Defender stores presets (count = kingdom tier). Faction members adjacent to the defended parcel can each contribute 1 additional preset to the pool.
- vRNG selects active preset from the full pool (owner presets + faction presets)
- Attacker can use abilities, defender cannot (static preset)
- **Attacker wins** → takes the parcel
- **Attacker loses** → loses one of their own border parcels to defender
- **Last stand** — players with only home parcels can attempt conquest with no parcel risk

### Regular matches
- 10 rounds, full commit-reveal with abilities
- Reputation-bracket matchmaking — known opponents with visible identity
- Stakes: both players wager abilities (matched to minimum each has, capped). Winner takes all.
- Winner claims 1 unclaimed adjacent parcel (if available)

### Map visibility
- Full map visible to all — territory, tiers, faction tags, active pillages
- Player inspection shows reputation, titles, match history against you, faction
- Campaign objectives visible when active
- Faction territories color-coded

## Section 7: Campaigns

Three concurrent tiers, each serving a different purpose.

### Regional Campaigns (always active, rotating)
- Small, localized objectives tied to map areas
- Rotate every few days — always something to chase
- Open to everyone, solo and faction leaderboards
- Rewards: resources, T2 crafting materials, minor titles

### World Campaigns (every 2-3 weeks)
- Major objective affecting the whole map
- Campaign *types* rotate:
  - **Construction** — structure on map requires resource contributions. Race to contribute.
  - **Conquest** — special zone activates. Fight for territory control within it.
  - **Tournament** — 1v1 bracket, open entry. Reputation affects seeding, not eligibility.
- Open to everyone
- Rewards: T3 crafting materials, significant titles, faction-wide recognition

### Championship (every 2-3 months, seasonal)
- Prestige event — qualification based on World Campaign performance
- Format varies per season
- Rewards: rarest T3 materials, unique soulbound trophy NFTs, permanent map monuments
- **This is the "win condition"** — winning a Championship is the highest achievement. Doesn't end the game, but marks you permanently.

### Campaign materials
- World and Championship campaigns drop exclusive materials (ERC-20, tradeable)
- Required for T3 ability crafting
- Cannot be farmed any other way — ties campaigns to arsenal progression

## Section 8: Onchain Token Architecture

### ERC-20 (fungible, tradeable)
- 6 resource tokens (existing): Iron, Linen, Stone, Wood, Ember, Seeds
- Campaign materials: new token types dropped by World and Championship campaigns

### ERC-1155 (semi-fungible, tradeable)
- Abilities: token IDs encode ability type + tier (15 total: 5 types x 3 tiers)
- Crafting T2 burns T1 + resources, mints T2. Same for T3.

### Soulbound tokens (non-transferable)
- Titles and trophies: campaign wins, achievement milestones, rival badges
- Visible in wallet and profile, cannot be traded
- Implementation: ERC-1155 with transfer restrictions or dedicated soulbound contract

### Dojo models (onchain state, not tokens)
- Kingdom tier and progression
- Match history and reputation
- Faction membership and contributions
- Parcel ownership and pillage state
- Conquest defense presets
- Campaign objectives, progress, leaderboards

### Split logic
- Economic value + tradeable → token (ERC-20/1155)
- Personal achievement → soulbound
- Game state driving mechanics → Dojo model
- Everything onchain regardless

## Section 9: New Player Experience

### First session
1. Register on world map — choose location for 3 home parcels (pick types)
2. Receive starter kit: enough resources to craft 2-3 T1 abilities
3. Start at Polis (1 ability slot, 1 defense preset, 2 parcel cap)
4. Matched into lowest reputation bracket

### Early game loop (first week)
- Regular matches against other new players — learn the commit-reveal puzzle
- Win → claim unclaimed parcels, build territory
- Resources flow from match nodes + parcel ownership → craft more T1 abilities
- Strategos upgrade achievable within a reasonable number of sessions

### Social on-ramp
- Regional campaigns visible from day one — participate immediately
- Faction invites can come anytime — strong new players are recruitment targets
- Rivals form naturally from repeated matchups in the same bracket

### Protection from veterans
- Reputation brackets separate new players from Basileias in matchmaking
- New players placed at map edges — fewer aggressive neighbors
- Last stand mechanic gives struggling players free conquest attempts

### Progression hooks by timeframe
- **Week 1:** Learning the battle system, winning matches
- **Month 1:** Strategos tier, rivals in bracket, joined a faction
- **Month 3:** Hegemonia tier, faction placed in World Campaign, crafting T2 abilities
- **Month 6+:** Pushing for Basileia, Championship qualification, name on the map

## What This Supersedes

This design replaces:
- **World system design** (2026-04-06) — concepts absorbed into Sections 6-7 with revisions (pillaging, parcel caps by tier, campaign structure)
- **Phase 2B ability effects** (2026-04-06) — concepts absorbed into Sections 1 and 3 with revisions (tiered abilities, slot scaling)

The core Phase 2B ability effects (Siege Sword, Stone Cloak, Ember Blast, Hex, Fortify) and resolution order are preserved. The changes are: abilities now have tiers, ability slots scale with kingdom tier, and the staking model is revised for the new match structure.

## Implementation Priority

Suggested order (to be detailed in implementation plan):
1. Phase 2B ability effects (T1 only) — prerequisite for everything
2. Kingdom tier system + ability slot scaling
3. Reputation system + match history
4. World map revisions (pillaging, parcel caps)
5. Conquest match revisions
6. T2/T3 ability tiers + consume-to-upgrade crafting
7. Alliance/faction system
8. Campaign infrastructure (regional first, then world, then championship)
9. Campaign materials + T3 gating
10. Soulbound titles and trophies
