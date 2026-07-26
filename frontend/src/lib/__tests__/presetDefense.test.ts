import { describe, expect, it } from "vitest";

import { presetSlotsFromModel } from "../conquest";
import type { PresetDefense as PresetDefenseModel } from "@/bindings/typescript/models.gen";

/**
 * Every field gets a distinct value encoded as <slot><field-index> so a
 * mis-mapped key template (wrong slot, or p/g swapped) produces a visibly
 * wrong number rather than a plausible one.
 */
function model(): PresetDefenseModel {
  const row: Record<string, unknown> = { player: "0xa", preset_count: 3 };
  for (let slot = 0; slot < 4; slot++) {
    row[`p${slot}_p0`] = slot * 10 + 1;
    row[`p${slot}_p1`] = slot * 10 + 2;
    row[`p${slot}_p2`] = slot * 10 + 3;
    row[`p${slot}_g0`] = slot * 10 + 4;
    row[`p${slot}_g1`] = slot * 10 + 5;
    row[`p${slot}_g2`] = slot * 10 + 6;
  }
  return row as unknown as PresetDefenseModel;
}

describe("presetSlotsFromModel", () => {
  it("reassembles all four slots from the flattened columns", () => {
    expect(presetSlotsFromModel(model())).toEqual([
      { p0: 1, p1: 2, p2: 3, g0: 4, g1: 5, g2: 6 },
      { p0: 11, p1: 12, p2: 13, g0: 14, g1: 15, g2: 16 },
      { p0: 21, p1: 22, p2: 23, g0: 24, g1: 25, g2: 26 },
      { p0: 31, p1: 32, p2: 33, g0: 34, g1: 35, g2: 36 },
    ]);
  });

  it("keeps assault and gate values distinct", () => {
    // Guards against a p/g transposition in the key template, which would
    // silently swap a Hold's attack and defense allocations.
    const slots = presetSlotsFromModel(model());
    expect(slots[2].p0).toBe(21);
    expect(slots[2].g0).toBe(24);
  });

  it("coerces the hex strings torii returns for numeric fields", () => {
    // The subscription store hands back BigNumberish — u8 fields arrive as hex
    // strings, not numbers, so safeNum has to do the conversion.
    const row = model() as unknown as Record<string, unknown>;
    row.p0_p0 = "0x0f";
    expect(presetSlotsFromModel(row as unknown as PresetDefenseModel)[0].p0).toBe(15);
  });

  it("yields zeros rather than NaN for an absent slot", () => {
    const sparse = { player: "0xa", preset_count: 1, p0_p0: 5 } as unknown as PresetDefenseModel;
    expect(presetSlotsFromModel(sparse)[3]).toEqual({ p0: 0, p1: 0, p2: 0, g0: 0, g1: 0, g2: 0 });
  });
});
