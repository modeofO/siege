import { describe, test, expect } from "vitest";
import { hexDistance, isNeighbor } from "../hex";

// Parity with src/utils/hex.cairo — even-row offset coordinates.
// Cases mirror src/tests/test_hex.cairo plus adversarial even/odd checks.

describe("hexDistance", () => {
  test.each([
    { args: [3, 3, 3, 3], expected: 0, label: "same cell" },
    { args: [1, 0, 2, 0], expected: 1, label: "adjacent (even row)" },
    { args: [0, 0, 2, 0], expected: 2, label: "two apart same row" },
    { args: [0, 0, 0, 2], expected: 2, label: "two rows apart" },
    { args: [0, 0, 3, 3], expected: 5, label: "far" },
  ])("$label: hexDistance$args → $expected", ({ args, expected }) => {
    const [c1, r1, c2, r2] = args;
    expect(hexDistance(c1, r1, c2, r2)).toBe(expected);
  });

  test("is symmetric", () => {
    expect(hexDistance(2, 2, 5, 1)).toBe(hexDistance(5, 1, 2, 2));
  });
});

describe("isNeighbor", () => {
  test("true for adjacent cells", () => {
    expect(isNeighbor(1, 0, 2, 0)).toBe(true);
  });

  test("false for distant cells", () => {
    expect(isNeighbor(0, 0, 3, 3)).toBe(false);
  });

  test("false for same cell", () => {
    expect(isNeighbor(2, 2, 2, 2)).toBe(false);
  });

  // Even-row neighbors at (2, 2) — exactly 6 cells, from hex.cairo even branch
  const evenRowNeighbors = [
    [1, 1], [2, 1], [1, 2], [3, 2], [1, 3], [2, 3],
  ] as const;
  test.each(evenRowNeighbors)("(2,2) even-row neighbor (%d,%d)", (c, r) => {
    expect(isNeighbor(2, 2, c, r)).toBe(true);
  });

  // Odd-row neighbors at (1, 1) — exactly 6 cells, from hex.cairo odd branch
  const oddRowNeighbors = [
    [1, 0], [2, 0], [0, 1], [2, 1], [1, 2], [2, 2],
  ] as const;
  test.each(oddRowNeighbors)("(1,1) odd-row neighbor (%d,%d)", (c, r) => {
    expect(isNeighbor(1, 1, c, r)).toBe(true);
  });

  // Adversarial: these flip if someone swaps even/odd branches in the port.
  test("(2,2) → (1,1) is neighbor (even-row only)", () => {
    expect(isNeighbor(2, 2, 1, 1)).toBe(true);
  });
  test("(2,2) → (3,1) is NOT neighbor (would be under swapped parity)", () => {
    expect(isNeighbor(2, 2, 3, 1)).toBe(false);
  });
});
