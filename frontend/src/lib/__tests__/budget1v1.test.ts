import { describe, expect, it } from "vitest";

import { computeBudget } from "../gameState1v1";

describe("computeBudget", () => {
  it("is 10 with no nodes in early rounds", () => {
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 1)).toBe(10);
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 6)).toBe(10);
  });

  it("adds 1 per owned node", () => {
    expect(computeBudget(["teamA", "teamA", "neutral"], "teamA", 3)).toBe(12);
    expect(computeBudget(["teamA", "teamA", "neutral"], "teamB", 3)).toBe(10);
  });

  it("escalates +1 per round above 6", () => {
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 7)).toBe(11);
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 8)).toBe(12);
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 9)).toBe(13);
    expect(computeBudget(["neutral", "neutral", "neutral"], "teamA", 10)).toBe(14);
  });

  it("stacks nodes and escalation", () => {
    expect(computeBudget(["teamB", "teamB", "teamB"], "teamB", 10)).toBe(17);
  });
});
