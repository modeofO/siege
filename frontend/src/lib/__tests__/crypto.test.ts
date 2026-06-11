import { describe, test, expect } from "vitest";
import { generateSalt, computeCommitment1v1 } from "../crypto";

describe("generateSalt", () => {
  test("returns hex string starting with 0x", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]+$/);
  });

  test("is 31 bytes (62 hex chars + 0x prefix)", () => {
    const salt = generateSalt();
    expect(salt.length).toBe(64); // "0x" + 62 hex chars
  });

  test("generates unique salts", () => {
    const salts = new Set(Array.from({ length: 10 }, () => generateSalt()));
    expect(salts.size).toBe(10);
  });
});

describe("computeCommitment1v1", () => {
  const commit = (salt: string, fields: number[]) =>
    computeCommitment1v1(
      salt,
      fields[0], fields[1], fields[2],
      fields[3], fields[4], fields[5],
      fields[6],
      fields[7], fields[8], fields[9],
      fields[10], fields[11], fields[12],
      fields[13], fields[14],
    );
  const baseMove = [5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  test("returns a felt hex string", () => {
    expect(commit("0xaaa", baseMove)).toMatch(/^0x[0-9a-f]+$/);
  });

  test("is deterministic for identical inputs", () => {
    expect(commit("0xaaa", baseMove)).toBe(commit("0xaaa", baseMove));
  });

  test("differs when salt differs", () => {
    expect(commit("0xaaa", baseMove)).not.toBe(commit("0xbbb", baseMove));
  });

  test("differs when any allocation differs", () => {
    const moved = [...baseMove];
    moved[14] = 1; // ability target
    expect(commit("0xaaa", baseMove)).not.toBe(commit("0xaaa", moved));
  });
});
