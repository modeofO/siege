/**
 * Move allocation Zod shape + budget validation. The shape mirrors the Cairo
 * `commit_reveal_1v1` system; if those change Cairo-side, update both here
 * and the Poseidon hash chain in hash.ts.
 *
 * NOTE: arrays are length-pinned with `.length(3)` rather than `z.tuple([..])`.
 * Zod tuples emit `items: [{...}, {...}]` which is valid in JSON Schema draft 7
 * but invalid in draft 2020-12 (Anthropic's required spec) — there `items` must
 * be a single schema, with tuples expressed via `prefixItems`. The constrained
 * array form `{type: "array", items: {...}, minItems: 3, maxItems: 3}` is valid
 * in every draft and round-trips identically.
 */

import { z, type ZodRawShape } from "zod";
import type { MoveAllocation1v1 } from "./hash.js";

const tripleNonNeg = z.array(z.number().int().nonnegative()).length(3);
const tripleBinary = z.array(z.number().int().min(0).max(1)).length(3);

/** Raw Zod shape for the move fields. Re-spread into tool inputSchemas. */
export const moveShape = {
  attack: tripleNonNeg.describe("[p0, p1, p2] — pressure on each gate"),
  defense: tripleNonNeg.describe("[g0, g1, g2] — garrison on each gate"),
  repair: z.number().int().min(0).max(3).default(0).describe("Repair allocation, max 3"),
  nodes: tripleNonNeg.describe("[nc0, nc1, nc2] — node contest pressure"),
  traps: tripleBinary
    .default([0, 0, 0])
    .describe("[trap0, trap1, trap2], 0 or 1 each. 2 budget per trap."),
  ability_id: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(0)
    .describe("Activated ability token id, 0 for none"),
  ability_target: z
    .number()
    .int()
    .min(0)
    .max(2)
    .default(0)
    .describe("Ability target gate 0..2"),
} satisfies ZodRawShape;

export interface MoveInput {
  attack: number[];
  defense: number[];
  repair: number;
  nodes: number[];
  traps: number[];
  ability_id: number;
  ability_target: number;
}

/** Convert parsed move input into the structural form the hash + reveal expect. */
export function moveAllocationFromInput(input: MoveInput): MoveAllocation1v1 {
  // .length(3) on the schema guarantees these casts are safe at runtime.
  return {
    attack: input.attack as [number, number, number],
    defense: input.defense as [number, number, number],
    repair: input.repair,
    nodes: input.nodes as [number, number, number],
    traps: input.traps as [number, number, number],
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
