import { describe, test, expect } from "vitest";
import { hexDistance, isNeighbor } from "../hex";

// Parity with src/utils/hex.cairo — even-row offset coordinates.
// Cases mirror src/tests/test_hex.cairo plus adversarial even/odd checks.

describe("hexDistance", () => {
  test.each([
    { a: { col: 3, row: 3 }, b: { col: 3, row: 3 }, expected: 0, label: "same cell" },
    { a: { col: 1, row: 0 }, b: { col: 2, row: 0 }, expected: 1, label: "adjacent (even row)" },
    { a: { col: 0, row: 0 }, b: { col: 2, row: 0 }, expected: 2, label: "two apart same row" },
    { a: { col: 0, row: 0 }, b: { col: 0, row: 2 }, expected: 2, label: "two rows apart" },
    { a: { col: 0, row: 0 }, b: { col: 3, row: 3 }, expected: 5, label: "far" },
  ])("$label → $expected", ({ a, b, expected }) => {
    expect(hexDistance(a, b)).toBe(expected);
  });

  test("is symmetric", () => {
    expect(hexDistance({ col: 2, row: 2 }, { col: 5, row: 1 })).toBe(
      hexDistance({ col: 5, row: 1 }, { col: 2, row: 2 }),
    );
  });
});

describe("isNeighbor", () => {
  test("true for adjacent cells", () => {
    expect(isNeighbor({ col: 1, row: 0 }, { col: 2, row: 0 })).toBe(true);
  });

  test("false for distant cells", () => {
    expect(isNeighbor({ col: 0, row: 0 }, { col: 3, row: 3 })).toBe(false);
  });

  test("false for same cell", () => {
    expect(isNeighbor({ col: 2, row: 2 }, { col: 2, row: 2 })).toBe(false);
  });

  // Even-row neighbors at (2, 2) — exactly 6 cells, from hex.cairo even branch
  const evenRowNeighbors = [
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 1, row: 2 },
    { col: 3, row: 2 },
    { col: 1, row: 3 },
    { col: 2, row: 3 },
  ];
  test.each(evenRowNeighbors)("(2,2) even-row neighbor ($col,$row)", (n) => {
    expect(isNeighbor({ col: 2, row: 2 }, n)).toBe(true);
  });

  // Odd-row neighbors at (1, 1) — exactly 6 cells, from hex.cairo odd branch
  const oddRowNeighbors = [
    { col: 1, row: 0 },
    { col: 2, row: 0 },
    { col: 0, row: 1 },
    { col: 2, row: 1 },
    { col: 1, row: 2 },
    { col: 2, row: 2 },
  ];
  test.each(oddRowNeighbors)("(1,1) odd-row neighbor ($col,$row)", (n) => {
    expect(isNeighbor({ col: 1, row: 1 }, n)).toBe(true);
  });

  // Adversarial: these flip if someone swaps even/odd branches in the port.
  test("(2,2) → (1,1) is neighbor (even-row only)", () => {
    expect(isNeighbor({ col: 2, row: 2 }, { col: 1, row: 1 })).toBe(true);
  });
  test("(2,2) → (3,1) is NOT neighbor (would be under swapped parity)", () => {
    expect(isNeighbor({ col: 2, row: 2 }, { col: 3, row: 1 })).toBe(false);
  });
});
