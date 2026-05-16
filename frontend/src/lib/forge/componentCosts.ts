import type { ComponentKind } from "./circuits";
import type { ResourceBalances } from "../useResourceBalances";

export type ComponentCost = Partial<ResourceBalances>;

export const COMPONENT_COSTS: Record<ComponentKind, ComponentCost | null> = {
  "origin-crystal": null,
  "void-drain": null,
  "rune-stone": { stone: 15, iron: 8 },
  "flux-well": { ember: 15, linen: 8 },
  "spiral-coil": { iron: 15, wood: 8 },
  "one-way-valve": { stone: 10, ember: 10, seeds: 5 },
};

export const CRAFTABLE_COMPONENTS: ComponentKind[] = [
  "rune-stone",
  "flux-well",
  "spiral-coil",
  "one-way-valve",
];

export const COMPONENT_NAMES: Record<ComponentKind, string> = {
  "origin-crystal": "Origin Crystal",
  "void-drain": "Void Drain",
  "rune-stone": "Rune Stone",
  "flux-well": "Flux Well",
  "spiral-coil": "Spiral Coil",
  "one-way-valve": "One-Way Valve",
};

export function canAffordComponent(
  kind: ComponentKind,
  balances: Record<string, number>,
  quantity = 1,
): boolean {
  const cost = COMPONENT_COSTS[kind];
  if (!cost) return false;
  return Object.entries(cost).every(
    ([resource, amount]) => (balances[resource] || 0) >= (amount ?? 0) * quantity,
  );
}

export function maxAffordableComponent(
  kind: ComponentKind,
  balances: Record<string, number>,
): number {
  const cost = COMPONENT_COSTS[kind];
  if (!cost) return 0;
  let max = Infinity;
  for (const [resource, amount] of Object.entries(cost)) {
    if (!amount || amount <= 0) continue;
    max = Math.min(max, Math.floor((balances[resource] || 0) / amount));
  }
  return max === Infinity ? 0 : max;
}
