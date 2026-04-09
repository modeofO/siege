export const TIER_NAMES = ["Polis", "Strategos", "Hegemonia", "Basileia"] as const;
export type TierName = (typeof TIER_NAMES)[number];

export const TIER_INFO = [
  { name: "Polis",      abilitySlots: 1, parcelCap: 2,  defensePresets: 1 },
  { name: "Strategos",  abilitySlots: 2, parcelCap: 5,  defensePresets: 2 },
  { name: "Hegemonia",  abilitySlots: 3, parcelCap: 8,  defensePresets: 3 },
  { name: "Basileia",   abilitySlots: 4, parcelCap: 12, defensePresets: 4 },
] as const;

export const UPGRADE_COSTS = [
  null,
  { wins: 10, iron: 20, stone: 20, wood: 10 },
  { wins: 30, iron: 50, stone: 50, wood: 30, ember: 20 },
  { wins: 60, iron: 100, stone: 100, wood: 60, ember: 40, seeds: 20 },
] as const;

export function tierName(tier: number): TierName {
  return TIER_NAMES[tier] ?? "Polis";
}
