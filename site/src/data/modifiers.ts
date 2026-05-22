/**
 * Source of truth for gate modifiers.
 * Each round, every gate independently rolls one modifier via vRNG.
 * Probabilities and effects mirror actions_1v1.cairo and resolution_1v1.cairo.
 */

export type Modifier = {
  slug: string;
  name: string;
  probability: number; // percentage, 0-100
  flavor: string;
  effect: string;
};

export const MODIFIERS: Modifier[] = [
  {
    slug: "normal",
    name: "Normal",
    probability: 60,
    flavor: "The gate stands as it was built.",
    effect: "No change. Attack and defense resolve as normal.",
  },
  {
    slug: "narrow-pass",
    name: "Narrow Pass",
    probability: 10,
    flavor: "The way is choked with rubble. Only so many can pass.",
    effect: "Both attack and defense at this gate are capped at 3.",
  },
  {
    slug: "mirror-gate",
    name: "Mirror Gate",
    probability: 10,
    flavor: "The gate reflects intent. Attackers find themselves defending.",
    effect: "Attack and defense values swap at this gate.",
  },
  {
    slug: "deadlock",
    name: "Deadlock",
    probability: 10,
    flavor: "Neither side yields an inch.",
    effect: "No damage is dealt at this gate this round.",
  },
  {
    slug: "reflection",
    name: "Reflection",
    probability: 10,
    flavor: "Every blow echoes to the walls beside it.",
    effect:
      "Overflow damage at this gate is split onto the other non-deadlock gates and reduced by unused defense.",
  },
];
