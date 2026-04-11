/**
 * Source of truth for resource tokens.
 * Each resource node produces a pair of ERC-20 tokens (0 decimals).
 * Values from CLAUDE.md "Resource Tokens" table.
 *
 * No icon sprites currently exist in the repo; the AbilityCard
 * cost row renders resources as text labels (e.g. "3 × IRON").
 * When icons are added later, extend the Resource type with
 * iconPath and update AbilityCard accordingly.
 */

export type ResourceToken =
  | 'iron' | 'linen' | 'stone' | 'wood' | 'ember' | 'seeds'

export type ResourceNode = 'forge' | 'quarry' | 'grove'

export type Resource = {
  name: string          // Display name, e.g. "Iron"
  label: string         // Short uppercase label, e.g. "IRON"
  node: ResourceNode    // Which node produces it
  pair: ResourceToken   // Its sibling token on the same node
}

export const RESOURCES: Record<ResourceToken, Resource> = {
  iron:   { name: 'Iron',   label: 'IRON',   node: 'forge',  pair: 'linen' },
  linen:  { name: 'Linen',  label: 'LINEN',  node: 'forge',  pair: 'iron'  },
  stone:  { name: 'Stone',  label: 'STONE',  node: 'quarry', pair: 'wood'  },
  wood:   { name: 'Wood',   label: 'WOOD',   node: 'quarry', pair: 'stone' },
  ember:  { name: 'Ember',  label: 'EMBER',  node: 'grove',  pair: 'seeds' },
  seeds:  { name: 'Seeds',  label: 'SEEDS',  node: 'grove',  pair: 'ember' },
}
