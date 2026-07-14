export const TIER_NAMES = ["Polis", "Strategos", "Hegemonia", "Basileia"] as const;
export type TierName = (typeof TIER_NAMES)[number];

export const TIER_INFO = [
  { name: "Polis", abilitySlots: 1, defensePresets: 1 },
  { name: "Strategos", abilitySlots: 2, defensePresets: 2 },
  { name: "Hegemonia", abilitySlots: 3, defensePresets: 3 },
  { name: "Basileia", abilitySlots: 3, defensePresets: 4 },
] as const;

export interface UpgradeCost {
  wins: number;
  iron: number;
  stone: number;
  wood: number;
  ember?: number;
  seeds?: number;
}

export const UPGRADE_COSTS: (UpgradeCost | null)[] = [
  null,
  { wins: 10, iron: 20, stone: 20, wood: 10 },
  { wins: 30, iron: 50, stone: 50, wood: 30, ember: 20 },
  { wins: 60, iron: 100, stone: 100, wood: 60, ember: 40, seeds: 20 },
];

export function tierName(tier: number): TierName {
  return TIER_NAMES[tier] ?? "Polis";
}

// Number of defense presets a tier unlocks. Mirrors tier_preset_count in
// src/systems/world_system.cairo — keep in sync.
export function tierPresetCount(tier: number): number {
  switch (tier) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    default:
      return 1;
  }
}
