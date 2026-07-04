import { describe, it, expect } from "vitest";
import { abilityType, abilityTier, resolveNodeContests } from "@/lib/resolution1v1";

describe("ability decode", () => {
  it("id 0 is none", () => {
    expect(abilityType(0)).toBe(0);
    expect(abilityTier(0)).toBe(0);
  });
  it("ids 1-5 are tier 1 types 1-5", () => {
    expect(abilityType(1)).toBe(1); // Siege Sword T1
    expect(abilityType(2)).toBe(2); // Stone Cloak T1
    expect(abilityType(5)).toBe(5); // Fortify T1
    expect(abilityTier(3)).toBe(1);
  });
  it("ids 6-10 are tier 2 types 1-5", () => {
    expect(abilityType(6)).toBe(1); // Siege Sword T2
    expect(abilityType(10)).toBe(5); // Fortify T2
    expect(abilityTier(7)).toBe(2);
  });
});

describe("node contests", () => {
  it("strictly greater contest captures; tie holds", () => {
    const { owners, captures } = resolveNodeContests(
      [2, 1, 0],           // A's contest points per node
      [1, 1, 3],           // B's contest points per node
      ["neutral", "teamB", "teamA"],
    );
    expect(owners).toEqual(["teamA", "teamB", "teamB"]);
    expect(captures).toEqual([
      { node: 0, from: "neutral", to: "teamA" },
      { node: 2, from: "teamA", to: "teamB" },
    ]);
  });
});
