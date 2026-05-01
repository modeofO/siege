/**
 * Move allocation Zod schema + budget validation. The move shape and budget
 * rules mirror the Cairo `commit_reveal_1v1` system; if those change the
 * Cairo side, update both here and the Poseidon hash chain in hash.ts.
 */

import { z } from "zod";
import type { MoveAllocation1v1 } from "./hash.js";

const triple = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);

const trapTriple = z.tuple([
  z.number().int().min(0).max(1),
  z.number().int().min(0).max(1),
  z.number().int().min(0).max(1),
]);

export const moveSchema = z.object({
  attack: triple.describe("[p0, p1, p2] — pressure on each gate"),
  defense: triple.describe("[g0, g1, g2] — garrison on each gate"),
  repair: z.number().int().min(0).max(3).default(0).describe("Repair allocation, max 3"),
  nodes: triple.describe("[nc0, nc1, nc2] — node contest pressure"),
  traps: trapTriple.default([0, 0, 0]).describe("[trap0, trap1, trap2], 0 or 1 each. 2 budget per trap."),
  ability_id: z.number().int().min(0).max(10).default(0).describe("Activated ability token id, 0 for none"),
  ability_target: z.number().int().min(0).max(2).default(0).describe("Ability target gate 0..2"),
});

export type MoveInput = z.infer<typeof moveSchema>;

export function moveAllocationFromInput(input: MoveInput): MoveAllocation1v1 {
  return {
    attack: input.attack,
    defense: input.defense,
    repair: input.repair,
    nodes: input.nodes,
    traps: input.traps,
    abilityId: input.ability_id,
    abilityTarget: input.ability_target,
  };
}

/**
 * Verify a move fits within `budget`. Returns the total spent.
 * Throws with a precise message on overspend so the agent gets a usable signal.
 */
export function validateMove(move: MoveAllocation1v1, budget: number): number {
  const trapCost = move.traps.reduce((sum, t) => sum + t * 2, 0);
  const total =
    move.attack.reduce((s, n) => s + n, 0) +
    move.defense.reduce((s, n) => s + n, 0) +
    move.repair +
    move.nodes.reduce((s, n) => s + n, 0) +
    trapCost;

  if (total > budget) {
    throw new Error(`Total allocation (${total}) exceeds budget (${budget})`);
  }
  return total;
}
