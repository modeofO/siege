# Resource Nodes (Phase 1) — Design Spec

## Goal

Rename the 3 generic nodes to themed resource nodes (Forge, Quarry, Grove) and award persistent ERC-20 resource tokens for each round of node control. This is the foundation for the crafting/ability system in future phases.

## Node Definitions

| Index | Name | Resources | Theme |
|-------|------|-----------|-------|
| 0 | **Forge** | Iron + Linen | Military supply |
| 1 | **Quarry** | Stone + Wood | Construction |
| 2 | **Grove** | Ember + Seeds | Elemental |

## Resource Accumulation

After each round resolves, each player earns 1 of each resource token from nodes they control at the end of the round (after contests resolve, after traps trigger).

- Controlling Forge for 1 round = +1 Iron token, +1 Linen token
- Controlling all 3 nodes for 5 rounds = 30 total tokens (5 of each type)
- Resources are ERC-20 tokens — tradeable, transferable, visible in wallets

## ERC-20 Resource Tokens

6 separate ERC-20 token contracts, one per resource:

| Token | Symbol | Decimals |
|-------|--------|----------|
| Iron | IRON | 0 |
| Linen | LINEN | 0 |
| Stone | STONE | 0 |
| Wood | WOOD | 0 |
| Ember | EMBER | 0 |
| Seeds | SEEDS | 0 |

**Decimals = 0** — resources are whole units (you earn 1 Iron, not 0.001 Iron). This keeps it simple and matches the game logic.

### Token Deployment

Each token is a standard ERC-20 with a `minter` role. Only the `resolution_1v1` contract can mint tokens (it's the minter). No max supply cap — resources are earned through gameplay indefinitely.

### Implementation

Use OpenZeppelin's Cairo ERC-20 implementation (`openzeppelin::token::erc20`). Each token is a standalone contract deployed alongside the game contracts.

Alternatively, if Dojo's ERC-20 support is available, use that for consistency with the world namespace. Otherwise, standard Starknet ERC-20 contracts work fine — the resolution contract just needs to call `mint(player, amount)` on each token contract.

## Contract Changes

### `resolution_1v1.cairo`

After node contests resolve and trap damage is applied, mint resource tokens:

```
For each node n (0, 1, 2):
    Read post-contest NodeState for node n
    If owner == TeamA:
        Mint 1 of each resource token for node n to player_a
    If owner == TeamB:
        Mint 1 of each resource token for node n to player_b
```

Node-to-token mapping:
- Node 0 (Forge): mint 1 IRON + 1 LINEN to owner
- Node 1 (Quarry): mint 1 STONE + 1 WOOD to owner
- Node 2 (Grove): mint 1 EMBER + 1 SEEDS to owner

The player addresses come from `MatchState1v1.player_a` and `MatchState1v1.player_b`.

### New contracts: 6 ERC-20 token contracts

Deploy as part of the migration. The `resolution_1v1` contract needs the addresses of all 6 tokens to call `mint`. These can be stored as constants or in a configuration model.

## Frontend Changes

### Label Renames

Update everywhere nodes are displayed:

**`AllocationForm1v1.tsx`:**
- "Node 1" → "Forge (Iron + Linen)"
- "Node 2" → "Quarry (Stone + Wood)"
- "Node 3" → "Grove (Ember + Seeds)"

**Match page node display (`match-1v1/[id]/page.tsx`):**
- Node indicators: show name + resource icons
- Node ownership labels: "Forge: Yours" / "Quarry: Enemy" / "Grove: Neutral"

**Round history:**
- "Node 1 trapped" → "Forge trapped"
- Gate names unchanged (East Gate, West Gate, Underground)

### Resource Display

Show a resource counter on the match page — tokens earned this match so far. Can query ERC-20 balances directly or track locally based on node ownership history.

## What Does NOT Change

- Node contest mechanics (same spend-to-win)
- Trap mechanics (traps work on named nodes, same 5 damage)
- Budget system (base 10 + 1 per controlled node)
- Gate modifiers (unchanged)
- Gate labels (East Gate, West Gate, Underground stay the same)

## Future Design Notes

These items are OUT OF SCOPE for Phase 1 but should be kept in mind:

- **Phase 2: Crafting** — define 4-5 abilities with resource recipes. Crafting burns ERC-20 tokens (transfer to zero address or explicit burn). A new `PlayerAbilities` model or ERC-721 stores crafted abilities.
- **Phase 3: Ability NFTs** — abilities as ERC-721 NFTs. Equippable, tradeable, with art/metadata.
- **Round win rewards** — milestone system (win X rounds → earn a specific ability). Separate tracking model.
- **Ability usage in battle** — equip up to 3 per match. Contract changes for ability effects during resolution.
- **Ability art/metadata** — Loot-style generative or hand-crafted art. IPFS metadata.
- **Resource balancing** — may need to adjust yield rates (currently 1 per round per node) once crafting costs are defined.
- **Resource marketplace** — since they're ERC-20, players can trade on any Starknet DEX.


Based on the style reference image and what we've built so far, the next sprites I'd suggest are:

    1. Gate sprites (East Gate, West Gate, Underground) — right now they're just text cards in the Battlefield panel. Small fortress gate/archway
    sprites would make the battlefield feel like an actual fortress instead of a data table.
    2. Resource node sprites (Forge, Quarry, Grove) — small isometric buildings to replace the plain colored dots. A furnace for Forge, a stone
    quarry, and a grove of trees.
    3. Resource token icons — tiny icons for Iron, Linen, Stone, Wood, Ember, Seeds to replace the plain text in the resources bar.

    The gate sprites would have the most visual impact since the Battlefield panel is the centerpiece of the page. Three small illustrated
    gate/archway sprites that match the citadel's isometric style would tie the whole look together.