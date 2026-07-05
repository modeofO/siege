import { describe, it, expect, beforeEach } from "vitest";
import {
  savePreDraft,
  loadPreDraft,
  clearPreDraft,
  projectedBudget,
} from "../predraft";
import { computeBudget, type NodeOwner } from "@/lib/gameState1v1";

// The vitest env is "node" (no DOM); stub a minimal localStorage backed by a
// Map so the predraft store has something to read/write. Also define a window
// object so the SSR guard (typeof window === "undefined") does not no-op.
function makeStorageStub() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(i: number): string | null {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string): string | null {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string): void {
      map.set(k, String(v));
    },
    removeItem(k: string): void {
      map.delete(k);
    },
    clear(): void {
      map.clear();
    },
    _map: map,
  };
}

beforeEach(() => {
  const stub = makeStorageStub();
  (globalThis as { window?: unknown }).window = { localStorage: stub };
  (globalThis as { localStorage?: unknown }).localStorage = stub;
});

describe("savePreDraft / loadPreDraft", () => {
  it("round-trips allocations for a given match and round", () => {
    const alloc = [1, 2, 3, 4, 5, 6, 2, 0, 1, 0, 0, 1, 0];
    savePreDraft("m1", 4, alloc);
    expect(loadPreDraft("m1", 4)).toEqual({ allocations: alloc, forRound: 4 });
  });

  it("returns null for a round that was never saved", () => {
    savePreDraft("m1", 4, [1, 2, 3]);
    expect(loadPreDraft("m1", 5)).toBeNull();
  });

  it("returns null for malformed stored JSON", () => {
    localStorage.setItem("siege_intel_predraft_m1_4", "{not json");
    expect(loadPreDraft("m1", 4)).toBeNull();
  });
});

describe("clearPreDraft", () => {
  it("removes all rounds for the match but leaves other matches intact", () => {
    savePreDraft("m1", 3, [1]);
    savePreDraft("m1", 4, [2]);
    savePreDraft("m2", 3, [3]);

    clearPreDraft("m1");

    expect(loadPreDraft("m1", 3)).toBeNull();
    expect(loadPreDraft("m1", 4)).toBeNull();
    expect(loadPreDraft("m2", 3)).toEqual({ allocations: [3], forRound: 3 });
  });
});

describe("SSR safety", () => {
  it("no-ops save and returns null on load when window is undefined", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(() => savePreDraft("m1", 4, [1, 2, 3])).not.toThrow();
    expect(loadPreDraft("m1", 4)).toBeNull();
    expect(() => clearPreDraft("m1")).not.toThrow();
  });
});

describe("projectedBudget", () => {
  it("matches computeBudget including endgame escalation (round 8)", () => {
    const nodes: NodeOwner[] = ["teamA", "teamB", "teamA"];
    // 10 + 2 owned + max(0, 8-6)=2 -> 14
    expect(projectedBudget(nodes, "teamA", 8)).toBe(14);
    expect(projectedBudget(nodes, "teamA", 8)).toBe(computeBudget(nodes, "teamA", 8));
  });

  it("matches computeBudget for a base round with no escalation", () => {
    const nodes: NodeOwner[] = ["neutral", "neutral", "neutral"];
    expect(projectedBudget(nodes, "teamB", 3)).toBe(10);
    expect(projectedBudget(nodes, "teamB", 3)).toBe(computeBudget(nodes, "teamB", 3));
  });
});
