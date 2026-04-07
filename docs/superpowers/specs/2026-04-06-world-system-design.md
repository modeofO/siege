# World System Design

Persistent hex-grid world where players build kingdoms through match victories and territorial conquest. Replaces the current isolated-match model with a metagame layer connecting resource generation, ability crafting, and PvP combat.

## World Map

- Hex grid of ~500 parcels (start with ~10 for initial testing).
- 3 parcel types tied to the existing resource token system:
  - **Forge** — generates Iron + Linen
  - **Quarry** — generates Stone + Wood
  - **Grove** — generates Ember + Seeds
- Parcel states: **unclaimed**, **owned**, or **home** (permanent, unconquerable).
- Adjacency is defined by hex neighbors (each parcel has up to 6 neighbors).

## New Player On-Ramp

1. **3 free starter parcels** — player chooses types (Forge/Quarry/Grove). These are permanent and unconquerable (home base).
2. **Starter kit** — 3 random abilities from the 5 available types.
3. **Passive resource drip** — home parcels generate a small amount of resources without playing matches.
4. **Free first craft** — first ability craft costs no resources.

## Match Type 1: Regular Match

The existing 10-round commit-reveal game, extended with stakes.

### Entry Requirements
- Minimum 1 ability to queue.
- Player selects which abilities to bring (up to 3).

### Ability Stakes — Matched Wagers
- Both players wager abilities equal to `min(player_a_count, player_b_count)`, capped at 3.
- Example: Player A has 10 abilities, Player B has 2. Each wagers 2.
- Players choose which of their abilities to wager before the match.

### Abilities in Battle
- Players can activate any of their 3 brought abilities during any of the 10 rounds.
- No constraint on timing — all 3 in one round, spread across rounds, or not used at all.
- Ability effects (Siege Sword, Stone Cloak, Ember Blast, Hex, Fortify) apply during the round they're activated.
- No crafting during a match.

### Outcome
- **Winner:**
  - Takes all wagered abilities from both sides.
  - Claims 1 unclaimed parcel adjacent to their territory (player chooses which).
  - If no unclaimed adjacent parcels exist, no land is gained.
- **Loser:**
  - Loses all wagered abilities.
  - Loses 1 parcel — their **furthest parcel from home base** (max hex distance from nearest home parcel). It becomes **unclaimed** (available for any adjacent player to claim).
  - Home parcels cannot be lost.
- **Draw:** Each player gets their own wagered abilities back. No land changes. No parcels lost.

### Matchmaking
- Open queue — play anyone, anytime.
- ELO/skill rating is a future consideration (not in initial implementation).

## Match Type 2: Conquest

A single-round siege for direct territorial warfare. The attacker challenges a specific neighbor for one of their parcels.

### Initiating Conquest
- Attacker must own a parcel adjacent to the target parcel.
- Only non-home parcels can be targeted.
- Attacker selects which of their abilities to bring (tactical use, not wagered).

### Defender's Preset Defense
- Every player sets **3 preset defense configurations** for their territory.
- Each preset allocates across **6 slots only**: p0, p1, p2 (attack) and g0, g1, g2 (defense). No nodes, no repair — single round makes them meaningless.
- Defender budget: **12** per preset. Attacker budget: **10**.
- Both sides start with **15 vault HP**. Whoever has the highest remaining HP wins. **Tie goes to defender** (home advantage).
- All 3 presets are stored on-chain (publicly readable). When a conquest occurs, **VRF randomly selects which preset is used**. The attacker can see all 3 but doesn't know which will be active.
- Abilities cannot be part of the preset — defense is budget-only.
- Defenders can update their presets at any time. Active players optimize; inactive players have stale, potentially weak defenses.
- Defender does NOT need to be online during the attack.

### Attack Resolution
- Attacker submits their allocation **blind** — they know the 3 possible defenses but not which one VRF selects.
- Attacker CAN use abilities during the single round (the attacker's key advantage).
- Resolution: mutual damage at 3 gates. Damage per gate = max(0, attack - defense). Both sides take damage simultaneously.
- Winner = highest remaining HP after damage. Tie = defender wins.

### Outcome
- **Attacker wins:** Takes the targeted parcel. It becomes part of the attacker's territory.
- **Attacker loses:** Loses 1 of their own parcels — specifically the one **closest to the defender** (by hex distance). That parcel goes to the defender.
- **Last stand rule:** Players with only home parcels (no conquerable land to lose) can initiate conquest with no downside. If they lose, nothing happens. This punishes overextension — empires that push deep into enemy territory face free counterattacks on their border parcels.

## Resource & Crafting Economy

Uses the existing token infrastructure with minor extensions.

### Resource Generation
- **Owned parcels (non-home):** Generate resources only when the owner plays matches. Each match played generates 1 of each resource paired with the parcel type, per parcel owned.
- **Home parcels:** Generate resources passively (slow drip, no match required). Rate is lower than active-play generation.

### Crafting
- Same 5 abilities with existing resource costs (Siege Sword, Stone Cloak, Ember Blast, Hex, Fortify).
- Crafting only between matches, never during.
- Existing `crafting_1v1` contract and `AbilityToken` ERC-1155 are reused.

## Anti-Cheat

### Alt Account / Sybil Defense
- **Minimum 1 ability to queue** for regular matches — prevents zero-risk farming.
- **No mid-match crafting** — alt must grind resources between matches to re-enter.
- **Matched stakes** — can only extract what the opponent risks. Farming a 0-ability alt yields nothing.
- **Adjacency constraint** — land expansion is always adjacent to your own territory. An alt's territory is disconnected from the main account. To feed land to a main, the alt would need to legitimately expand all the way to the main's border.
- **Self-defeating loop** — a losing alt bleeds abilities faster than it can craft replacements. At 0 abilities with only home parcels, the alt is limited to slow passive drip to re-craft one ability at a time.

### Bot Play
- Commit-reveal prevents reading opponent moves.
- A bot that plays well is legitimate skill expression (not cheating).
- A bot that loses intentionally to farm nodes still needs abilities to queue, and losing bleeds those abilities away.

## Recovery (Rock Bottom)

A player who has lost all abilities and all conquered parcels:
1. Still has 3 permanent home parcels.
2. Home parcels passively drip resources.
3. Craft 1 ability from dripped resources.
4. Queue for a regular match.
5. Can also launch free conquest attempts against neighbors (last stand rule — no parcel to lose).

## AI Agent Integration

The existing MCP server enables AI agents to:
- Query match history through Torii (GraphQL/SQL).
- Analyze opponent tendencies across rounds (attack/defense allocation patterns).
- Recommend counter-strategies for regular matches.
- Infer defender preset patterns from historical data for conquest planning.
- This is a competitive edge that rewards player investment in their AI tooling.

## Contract Changes Required

### New Contracts
- **World** — hex grid state, parcel ownership, parcel types, adjacency graph.
- **Matchmaking** — queue management, stake escrow, matched wager calculation.
- **Conquest** — preset defense storage, single-round resolution, parcel transfer.

### Modified Contracts
- **actions_1v1** — integrate with matchmaking (ability escrow at match start), parcel claim on win, parcel release on loss.
- **resolution_1v1** — trigger post-match parcel changes and ability transfers.
- **crafting_1v1** — no changes needed (crafting logic is unchanged).

### Existing Contracts Reused As-Is
- **AbilityToken** (ERC-1155) — abilities are still the same tokens.
- **Resource tokens** (6 ERC-20s) — generation logic moves to the World contract but token contracts unchanged.
- **commit_reveal_1v1** — commit-reveal mechanics unchanged for regular matches.

## Open Design Decisions (Finalize During Implementation)

- Fine-tuning budget (12 vs 10) and HP (10 vs 10) through playtesting.
- Regular match resource generation rate (how many resources per parcel per match played).
- Home parcel passive drip rate.
- Hex grid coordinate system (axial, offset, or cube coordinates).
- How starter parcel locations are assigned on the grid.
- Draw conditions in conquest (both vault HP hits 0 simultaneously) — likely same rule: no parcel changes, status quo holds.
- Algorithm for calculating "furthest from home base" (max hex distance from nearest home parcel, tiebreaking strategy).
