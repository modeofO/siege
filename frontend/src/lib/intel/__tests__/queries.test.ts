import { describe, it, expect } from "vitest";
import { moveFromRow, historicalRoundsFor } from "../queries";

// Zero-padded-hex ids the way Torii returns them.
const M1 = "0x0000000000000001";

function moveRow(over: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    match_id: M1,
    round: 1,
    reveal_count: 2,
  };
  for (const s of ["a", "b"] as const) {
    for (const c of ["p0", "p1", "p2", "g0", "g1", "g2", "repair", "nc0", "nc1", "nc2", "ability_id", "ability_target"]) {
      base[`${s}_${c}`] = 0;
    }
  }
  return { ...base, ...over };
}

describe("moveFromRow", () => {
  it("maps columns into a PlayerMove for the given side", () => {
    const row = moveRow({
      a_p0: 3,
      a_p1: "2", // string coercion via toNum
      a_g2: 4,
      a_repair: 5,
      a_nc1: 1,
      a_ability_id: 6,
      a_ability_target: 2,
    });
    const trapRow = { a_trap0: 1, a_trap1: 0, a_trap2: 1, b_trap0: 0, b_trap1: 0, b_trap2: 0 };
    expect(moveFromRow(row, "a", trapRow)).toEqual({
      attack: [3, 2, 0],
      defense: [0, 0, 4],
      repair: 5,
      nodeContest: [0, 1, 0],
      traps: [1, 0, 1],
      abilityId: 6,
      abilityTarget: 2,
    });
  });

  it("defaults traps to zero when no trap row exists", () => {
    expect(moveFromRow(moveRow({}), "b", undefined).traps).toEqual([0, 0, 0]);
  });
});

describe("historicalRoundsFor", () => {
  it("filters unrevealed rounds, sorts ascending, and defaults missing modifiers", () => {
    const moves = [
      moveRow({ round: 2, reveal_count: 2, a_p0: 2 }),
      moveRow({ round: 1, reveal_count: 2, a_p0: 1 }),
      moveRow({ round: 3, reveal_count: 1, a_p0: 9 }), // unrevealed -> excluded
      moveRow({ match_id: "0x0000000000000002", round: 1, reveal_count: 2 }), // other match
    ];
    const traps = [{ match_id: M1, round: 1, a_trap0: 1, a_trap1: 0, a_trap2: 0, b_trap0: 0, b_trap1: 0, b_trap2: 0 }];
    const mods = [{ match_id: M1, round: 1, gate_0: 4, gate_1: 0, gate_2: 0 }];

    const rounds = historicalRoundsFor("1", moves, traps, mods);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].modifiers).toEqual([4, 0, 0]);
    expect(rounds[0].moveA.traps).toEqual([1, 0, 0]);
    expect(rounds[1].modifiers).toEqual([0, 0, 0]); // round 2 has no modifiers row
    expect(rounds[0].moveA.attack[0]).toBe(1);
    expect(rounds[1].moveA.attack[0]).toBe(2);
  });
});
