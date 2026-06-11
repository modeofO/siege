/**
 * Source of truth for abilities.
 * Values mirror src/systems/crafting_1v1.cairo and
 * frontend/src/lib/craftingContracts.ts.
 *
 * 10 total abilities: 5 T1 (IDs 1-5) and 5 T2 (IDs 6-10). T2 is a
 * stronger variant of each T1 type; T2 crafting burns 1 of the matching
 * T1 in addition to its resource cost.
 *
 * Helpers matching the Cairo + TS sides:
 *   ability_type(id) = ((id - 1) % 5) + 1   → 1..5
 *   ability_tier(id) = ((id - 1) / 5) + 1   → 1 or 2
 */

export type ResourceToken =
  | "iron"
  | "linen"
  | "stone"
  | "wood"
  | "ember"
  | "seeds";

export type ResourceCost = { token: ResourceToken; amount: number };

/**
 * The 5 distinct ability "types". Each type has a T1 and a T2 variant.
 * Type is stable across tiers; tier controls power level + cost.
 */
export type AbilityType = 1 | 2 | 3 | 4 | 5;

export type Ability = {
  id: number; // 1..10, matches on-chain token ID
  type: AbilityType; // ((id - 1) % 5) + 1
  slug: string; // URL-safe, unique per ability (e.g. "siege-sword", "siege-sword-t2")
  name: string; // Display name (T1 and T2 share the same name)
  tier: 1 | 2; // Math.floor((id - 1) / 5) + 1
  flavor: string; // one-line lore (tone B)
  effect: string; // plain-English mechanical effect
  cost: ResourceCost[];
  requiresT1: boolean; // true for every T2; crafting burns the matching T1
  iconPath: string; // path under docs/public; T2 reuses T1's SVG
};

export const ABILITIES: Ability[] = [
  // ─── T1 ───────────────────────────────────────────────
  {
    id: 1,
    type: 1,
    slug: "siege-sword",
    name: "Siege Sword",
    tier: 1,
    flavor: "Forged for one purpose: to find the crack in a gate.",
    effect: "Sets your attack on one chosen gate to 5.",
    cost: [
      { token: "iron", amount: 8 },
      { token: "wood", amount: 5 },
    ],
    requiresT1: false,
    iconPath: "/sprites/abilities/siege-sword.svg",
  },
  {
    id: 2,
    type: 2,
    slug: "stone-cloak",
    name: "Stone Cloak",
    tier: 1,
    flavor: "Drape the walls in quarry-dust and weather the day.",
    effect: "Halves all gate damage taken this round.",
    cost: [
      { token: "stone", amount: 8 },
      { token: "linen", amount: 5 },
    ],
    requiresT1: false,
    iconPath: "/sprites/abilities/stone-cloak.svg",
  },
  {
    id: 3,
    type: 3,
    slug: "ember-blast",
    name: "Ember Blast",
    tier: 1,
    flavor: "Coals hurled past the gates, into the vault itself.",
    effect: "Deals 2 direct damage to the enemy vault, bypassing all gates.",
    cost: [
      { token: "ember", amount: 8 },
      { token: "seeds", amount: 5 },
    ],
    requiresT1: false,
    iconPath: "/sprites/abilities/ember-blast.svg",
  },
  {
    id: 4,
    type: 4,
    slug: "hex",
    name: "Hex",
    tier: 1,
    flavor: "A quiet curse whispered over the opponent's ledger.",
    effect: "Reduces the opponent's total damage by 3 this round.",
    cost: [
      { token: "iron", amount: 5 },
      { token: "stone", amount: 5 },
      { token: "ember", amount: 3 },
    ],
    requiresT1: false,
    iconPath: "/sprites/abilities/hex.svg",
  },
  {
    id: 5,
    type: 5,
    slug: "fortify",
    name: "Fortify",
    tier: 1,
    flavor: "Brace every beam. Nothing comes through today.",
    effect: "Grants +1 defense at every gate this round.",
    cost: [
      { token: "stone", amount: 5 },
      { token: "linen", amount: 5 },
      { token: "wood", amount: 3 },
    ],
    requiresT1: false,
    iconPath: "/sprites/abilities/fortify.svg",
  },

  // ─── T2 ───────────────────────────────────────────────
  {
    id: 6,
    type: 1,
    slug: "siege-sword-t2",
    name: "Siege Sword",
    tier: 2,
    flavor:
      "Twice-tempered steel. When it strikes, the gate has already fallen.",
    effect: "Sets your attack on one chosen gate to 10.",
    cost: [
      { token: "iron", amount: 30 },
      { token: "wood", amount: 20 },
      { token: "ember", amount: 10 },
    ],
    requiresT1: true,
    iconPath: "/sprites/abilities/siege-sword.svg",
  },
  {
    id: 7,
    type: 2,
    slug: "stone-cloak-t2",
    name: "Stone Cloak",
    tier: 2,
    flavor: "Quarry and thread woven so tight the stones hold their breath.",
    effect: "Halves all gate, trap, and Ember Blast damage taken this round.",
    cost: [
      { token: "stone", amount: 30 },
      { token: "linen", amount: 20 },
      { token: "seeds", amount: 10 },
    ],
    requiresT1: true,
    iconPath: "/sprites/abilities/stone-cloak.svg",
  },
  {
    id: 8,
    type: 3,
    slug: "ember-blast-t2",
    name: "Ember Blast",
    tier: 2,
    flavor: "Not coals this time — a furnace loosed straight at the vault.",
    effect: "Deals 6 direct damage to the enemy vault, bypassing all gates.",
    cost: [
      { token: "ember", amount: 30 },
      { token: "seeds", amount: 20 },
      { token: "iron", amount: 10 },
    ],
    requiresT1: true,
    iconPath: "/sprites/abilities/ember-blast.svg",
  },
  {
    id: 9,
    type: 4,
    slug: "hex-t2",
    name: "Hex",
    tier: 2,
    flavor:
      "Written in fire this time. The ledger burns before they can read it.",
    effect: "Reduces the opponent's total damage by 8 this round.",
    cost: [
      { token: "iron", amount: 20 },
      { token: "stone", amount: 20 },
      { token: "ember", amount: 10 },
      { token: "wood", amount: 10 },
    ],
    requiresT1: true,
    iconPath: "/sprites/abilities/hex.svg",
  },
  {
    id: 10,
    type: 5,
    slug: "fortify-t2",
    name: "Fortify",
    tier: 2,
    flavor: "Every beam doubled. Every stone doubled. A wall behind the wall.",
    effect: "Doubles all defense values this round.",
    cost: [
      { token: "stone", amount: 20 },
      { token: "linen", amount: 20 },
      { token: "wood", amount: 10 },
    ],
    requiresT1: true,
    iconPath: "/sprites/abilities/fortify.svg",
  },
];
