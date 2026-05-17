import { describe, it, expect } from "vitest";
import {
  effectiveMoves,
  predictedDamage,
  MOD_NORMAL,
  MOD_NARROW_PASS,
  MOD_MIRROR,
  MOD_DEADLOCK,
  MOD_OVERFLOW,
} from "../damage.js";

// Helper: run full pipeline (effectiveMoves → predictedDamage)
function fullDamage(
  gates: number[],
  a: { attack: number[]; defense: number[] },
  b: { attack: number[]; defense: number[] },
) {
  const eff = effectiveMoves(gates, a, b)!;
  return predictedDamage(gates, eff.player_a, eff.player_b);
}

// ─── effectiveMoves ──────────────────────────────────────────────────────────

describe("effectiveMoves", () => {
  describe("returns null on invalid input", () => {
    it("null gates", () => {
      expect(effectiveMoves(null, { attack: [1, 1, 1], defense: [1, 1, 1] }, { attack: [1, 1, 1], defense: [1, 1, 1] })).toBeNull();
    });
    it("null player a", () => {
      expect(effectiveMoves([0, 0, 0], null, { attack: [1, 1, 1], defense: [1, 1, 1] })).toBeNull();
    });
    it("null player b", () => {
      expect(effectiveMoves([0, 0, 0], { attack: [1, 1, 1], defense: [1, 1, 1] }, null)).toBeNull();
    });
  });

  describe("individual modifiers", () => {
    it("Normal — values pass through unchanged", () => {
      const r = effectiveMoves(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        { attack: [5, 3, 1], defense: [2, 4, 6] },
        { attack: [7, 2, 0], defense: [1, 5, 3] },
      )!;
      expect(r.player_a).toEqual([
        { attack: 5, defense: 2 },
        { attack: 3, defense: 4 },
        { attack: 1, defense: 6 },
      ]);
      expect(r.player_b).toEqual([
        { attack: 7, defense: 1 },
        { attack: 2, defense: 5 },
        { attack: 0, defense: 3 },
      ]);
    });

    it("NarrowPass — caps attack and defense at 3", () => {
      const r = effectiveMoves(
        [MOD_NARROW_PASS, MOD_NORMAL, MOD_NORMAL],
        { attack: [5, 5, 5], defense: [4, 4, 4] },
        { attack: [6, 6, 6], defense: [7, 7, 7] },
      )!;
      expect(r.player_a[0]).toEqual({ attack: 3, defense: 3 });
      expect(r.player_b[0]).toEqual({ attack: 3, defense: 3 });
      // Other gates unaffected
      expect(r.player_a[1]).toEqual({ attack: 5, defense: 4 });
      expect(r.player_b[1]).toEqual({ attack: 6, defense: 7 });
    });

    it("NarrowPass — values at or below 3 pass through unchanged", () => {
      const r = effectiveMoves(
        [MOD_NARROW_PASS, MOD_NORMAL, MOD_NORMAL],
        { attack: [2, 0, 0], defense: [3, 0, 0] },
        { attack: [1, 0, 0], defense: [0, 0, 0] },
      )!;
      expect(r.player_a[0]).toEqual({ attack: 2, defense: 3 });
      expect(r.player_b[0]).toEqual({ attack: 1, defense: 0 });
    });

    it("Mirror — swaps attack and defense for both players", () => {
      const r = effectiveMoves(
        [MOD_MIRROR, MOD_NORMAL, MOD_NORMAL],
        { attack: [5, 0, 0], defense: [2, 0, 0] },
        { attack: [3, 0, 0], defense: [7, 0, 0] },
      )!;
      expect(r.player_a[0]).toEqual({ attack: 2, defense: 5 });
      expect(r.player_b[0]).toEqual({ attack: 7, defense: 3 });
    });

    it("Deadlock — no value transformation", () => {
      const r = effectiveMoves(
        [MOD_DEADLOCK, MOD_NORMAL, MOD_NORMAL],
        { attack: [5, 0, 0], defense: [2, 0, 0] },
        { attack: [3, 0, 0], defense: [7, 0, 0] },
      )!;
      expect(r.player_a[0]).toEqual({ attack: 5, defense: 2 });
      expect(r.player_b[0]).toEqual({ attack: 3, defense: 7 });
    });

    it("Reflection — no value transformation", () => {
      const r = effectiveMoves(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        { attack: [5, 0, 0], defense: [2, 0, 0] },
        { attack: [3, 0, 0], defense: [7, 0, 0] },
      )!;
      expect(r.player_a[0]).toEqual({ attack: 5, defense: 2 });
      expect(r.player_b[0]).toEqual({ attack: 3, defense: 7 });
    });
  });

  describe("NarrowPass + Mirror on the same gate (order: cap then swap)", () => {
    it("NarrowPass is applied before Mirror in the pipeline", () => {
      // NarrowPass + Mirror cannot coexist on one gate (each gate has one modifier).
      // This test verifies the pipeline: NarrowPass on gate 0, Mirror on gate 1
      const r = effectiveMoves(
        [MOD_NARROW_PASS, MOD_MIRROR, MOD_NORMAL],
        { attack: [5, 5, 0], defense: [1, 2, 0] },
        { attack: [4, 3, 0], defense: [2, 6, 0] },
      )!;
      // Gate 0 (NarrowPass): A atk=3(capped), def=1. B atk=3(capped), def=2
      expect(r.player_a[0]).toEqual({ attack: 3, defense: 1 });
      expect(r.player_b[0]).toEqual({ attack: 3, defense: 2 });
      // Gate 1 (Mirror): A atk=2(was def), def=5(was atk). B atk=6(was def), def=3(was atk)
      expect(r.player_a[1]).toEqual({ attack: 2, defense: 5 });
      expect(r.player_b[1]).toEqual({ attack: 6, defense: 3 });
    });
  });
});

// ─── predictedDamage ─────────────────────────────────────────────────────────

describe("predictedDamage", () => {
  describe("individual modifiers in isolation", () => {
    it("Normal — direct damage = max(atk - def, 0)", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 5, defense: 1 }, { attack: 0, defense: 3 }, { attack: 2, defense: 0 }],
        [{ attack: 3, defense: 2 }, { attack: 4, defense: 0 }, { attack: 0, defense: 1 }],
      );
      // A attacks B: gate0: 5-2=3, gate1: 0-0=0, gate2: 2-1=1
      expect(r.per_gate_to_b).toEqual([3, 0, 1]);
      // B attacks A: gate0: 3-1=2, gate1: 4-3=1, gate2: 0-0=0
      expect(r.per_gate_to_a).toEqual([2, 1, 0]);
      expect(r.total_to_a).toBe(3);
      expect(r.total_to_b).toBe(4);
    });

    it("Normal — defense exceeds attack yields zero damage", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 2, defense: 5 }, { attack: 1, defense: 4 }, { attack: 0, defense: 3 }],
        [{ attack: 3, defense: 4 }, { attack: 2, defense: 3 }, { attack: 1, defense: 2 }],
      );
      // A attacks B: 2-4=0, 1-3=0, 0-2=0
      expect(r.total_to_b).toBe(0);
      // B attacks A: 3-5=0, 2-4=0, 1-3=0
      expect(r.total_to_a).toBe(0);
    });

    it("Deadlock — zero damage at that gate", () => {
      const r = predictedDamage(
        [MOD_DEADLOCK, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 10, defense: 0 }, { attack: 3, defense: 0 }, { attack: 3, defense: 0 }],
        [{ attack: 10, defense: 0 }, { attack: 0, defense: 1 }, { attack: 0, defense: 1 }],
      );
      // Gate 0 deadlocked — massive attack does nothing
      expect(r.per_gate_to_b[0]).toBe(0);
      expect(r.per_gate_to_a[0]).toBe(0);
      // Gates 1, 2 normal
      expect(r.per_gate_to_b[1]).toBe(2); // 3-1
      expect(r.per_gate_to_b[2]).toBe(2); // 3-1
      expect(r.total_to_b).toBe(4);
    });

    it("Reflection — overflow splits evenly to other gates", () => {
      // Gate 0 is Reflection. A attacks with 6, B defends with 2.
      // Overflow = 6-2 = 4, per gate = floor(4/2) = 2 to each of gates 1 and 2
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 6, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 2 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.per_gate_to_b[0]).toBe(0); // Reflection gate itself does no direct damage
      expect(r.per_gate_to_b[1]).toBe(2); // overflow/2
      expect(r.per_gate_to_b[2]).toBe(2); // overflow/2
      expect(r.total_to_b).toBe(4);
    });

    it("Reflection — odd overflow rounds down (integer division)", () => {
      // Overflow = 5-2 = 3, per gate = floor(3/2) = 1
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 5, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 2 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.per_gate_to_b[1]).toBe(1);
      expect(r.per_gate_to_b[2]).toBe(1);
      expect(r.total_to_b).toBe(2); // 1 damage point lost to rounding
    });

    it("Reflection — unused defense at target gates absorbs overflow", () => {
      // Overflow at gate 0: 6-0=6, per=3 to gates 1 and 2
      // Gate 1 has unused_def = max(5-0, 0) = 5. per(3) > def(5) is false → no damage
      // Gate 2 has unused_def = max(1-0, 0) = 1. per(3) > def(1) → dmg = 3-1 = 2
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 6, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 5 }, { attack: 0, defense: 1 }],
      );
      expect(r.per_gate_to_b[1]).toBe(0); // absorbed by 5 unused def
      expect(r.per_gate_to_b[2]).toBe(2); // 3 - 1 unused def
      expect(r.total_to_b).toBe(2);
    });
  });

  describe("modifier interactions across gates", () => {
    it("Reflection + Deadlock — overflow skips the deadlocked gate", () => {
      // Gate 0: Reflection. Overflow = 6-0 = 6, per = 3
      // Gate 1: Deadlock — skipped
      // Gate 2: Normal — receives full overflow (3)
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_DEADLOCK, MOD_NORMAL],
        [{ attack: 6, defense: 0 }, { attack: 5, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.per_gate_to_b[0]).toBe(0); // Reflection source
      expect(r.per_gate_to_b[1]).toBe(0); // Deadlock blocks overflow
      expect(r.per_gate_to_b[2]).toBe(3); // Only target, gets full per-gate amount
      expect(r.total_to_b).toBe(3);
    });

    it("Reflection + two Deadlocks — overflow has nowhere to go", () => {
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_DEADLOCK, MOD_DEADLOCK],
        [{ attack: 10, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.total_to_b).toBe(0); // All overflow blocked
    });

    it("Reflection + NarrowPass — NarrowPass affects values, overflow distributes normally", () => {
      // Gate 0: Reflection. A atk=5 (already effective), B def=2. Overflow=3, per=1
      // Gate 1: NarrowPass (values already capped by effectiveMoves). B unused_def at gate 1 = 0
      // Gate 2: Normal. B unused_def at gate 2 = 0
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NARROW_PASS, MOD_NORMAL],
        [{ attack: 5, defense: 0 }, { attack: 3, defense: 0 }, { attack: 2, defense: 0 }],
        [{ attack: 0, defense: 2 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.per_gate_to_b[0]).toBe(0); // Reflection source
      expect(r.per_gate_to_b[1]).toBe(4); // NarrowPass gate: direct(3-0=3) + overflow(1-0=1) = 4
      expect(r.per_gate_to_b[2]).toBe(3); // Normal gate: direct(2-0=2) + overflow(1-0=1) = 3
      expect(r.total_to_b).toBe(7);
    });

    it("Reflection + Normal — unused defense at normal gate absorbs overflow", () => {
      // Gate 0: Reflection. Overflow = 8-0 = 8, per = 4
      // Gate 1: Normal. B has def=3, A atk=0. unused_def = 3. per(4) > 3 → dmg = 1
      // Gate 2: Normal. B has def=5, A atk=0. unused_def = 5. per(4) > 5 is false → 0
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 8, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 3 }, { attack: 0, defense: 5 }],
      );
      expect(r.per_gate_to_b[1]).toBe(1); // 4 - 3 unused def
      expect(r.per_gate_to_b[2]).toBe(0); // absorbed by 5 unused def
      expect(r.total_to_b).toBe(1);
    });

    it("Deadlock + Normal — deadlock isolates its gate only", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_DEADLOCK, MOD_NORMAL],
        [{ attack: 5, defense: 0 }, { attack: 5, defense: 0 }, { attack: 5, defense: 0 }],
        [{ attack: 0, defense: 2 }, { attack: 0, defense: 2 }, { attack: 0, defense: 2 }],
      );
      expect(r.per_gate_to_b[0]).toBe(3); // 5-2
      expect(r.per_gate_to_b[1]).toBe(0); // Deadlock
      expect(r.per_gate_to_b[2]).toBe(3); // 5-2
      expect(r.total_to_b).toBe(6);
    });

    it("Two Reflections + Normal — both overflow into each other and Normal", () => {
      // Gate 0: Reflection. A atk=5, B def=1. Overflow=4, per=2
      // Gate 1: Reflection. A atk=4, B def=1. Overflow=3, per=1
      // Gate 2: Normal. A atk=0, B def=0.
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_OVERFLOW, MOD_NORMAL],
        [{ attack: 5, defense: 0 }, { attack: 4, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 1 }, { attack: 0, defense: 1 }, { attack: 0, defense: 0 }],
      );
      // Gate 0 overflow (per=2): → gate 1 (unused_b=0, not deadlock): dmg+=2. → gate 2 (unused_b=0): dmg+=2
      // Gate 1 overflow (per=1): → gate 0 (unused_b=0, not deadlock): dmg+=1. → gate 2 (unused_b=0): dmg+=1
      expect(r.per_gate_to_b[0]).toBe(1); // from gate 1 overflow
      expect(r.per_gate_to_b[1]).toBe(2); // from gate 0 overflow
      expect(r.per_gate_to_b[2]).toBe(3); // 2 from gate 0 + 1 from gate 1
      expect(r.total_to_b).toBe(6);
    });

    it("Two Reflections + Deadlock — overflow skips Deadlock", () => {
      // Gate 0: Reflection. Overflow=4, per=2. Only gate 1 is eligible (gate 2 is Deadlock)
      // Gate 1: Reflection. Overflow=3, per=1. Only gate 0 is eligible (gate 2 is Deadlock)
      // Gate 2: Deadlock.
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_OVERFLOW, MOD_DEADLOCK],
        [{ attack: 5, defense: 0 }, { attack: 4, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 1 }, { attack: 0, defense: 1 }, { attack: 0, defense: 0 }],
      );
      // Gate 0 overflow per=2: → gate 1 only (gate 2 deadlock). unused_b[1]=0. dmg_b[1]+=2
      // Gate 1 overflow per=1: → gate 0 only (gate 2 deadlock). unused_b[0]=0. dmg_b[0]+=1
      expect(r.per_gate_to_b[0]).toBe(1);
      expect(r.per_gate_to_b[1]).toBe(2);
      expect(r.per_gate_to_b[2]).toBe(0); // Deadlock
      expect(r.total_to_b).toBe(3);
    });

    it("Multiple overflow sources — unused defense absorbs independently per source", () => {
      // Gate 0: Reflection. Overflow=6, per=3
      // Gate 1: Reflection. Overflow=6, per=3
      // Gate 2: Normal. B has def=5, A atk=0. unused_def=5.
      // Each overflow checks unused_def independently (not consumed):
      //   Gate 0 per=3 vs unused=5 → no damage
      //   Gate 1 per=3 vs unused=5 → no damage
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_OVERFLOW, MOD_NORMAL],
        [{ attack: 6, defense: 0 }, { attack: 6, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 5 }],
      );
      expect(r.per_gate_to_b[2]).toBe(0); // Both overflows absorbed by same unused defense
      // But overflow to each other (gate 0→1 and gate 1→0) has no unused def:
      expect(r.per_gate_to_b[0]).toBe(3); // from gate 1
      expect(r.per_gate_to_b[1]).toBe(3); // from gate 0
      expect(r.total_to_b).toBe(6);
    });
  });

  describe("all-same modifiers", () => {
    it("All Normal — standard damage calculation", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 4, defense: 1 }, { attack: 3, defense: 2 }, { attack: 2, defense: 3 }],
        [{ attack: 2, defense: 2 }, { attack: 3, defense: 1 }, { attack: 4, defense: 0 }],
      );
      // A→B: 4-2=2, 3-1=2, 2-0=2 → total 6
      expect(r.per_gate_to_b).toEqual([2, 2, 2]);
      expect(r.total_to_b).toBe(6);
      // B→A: 2-1=1, 3-2=1, 4-3=1 → total 3
      expect(r.per_gate_to_a).toEqual([1, 1, 1]);
      expect(r.total_to_a).toBe(3);
    });

    it("All Deadlock — zero total damage", () => {
      const r = predictedDamage(
        [MOD_DEADLOCK, MOD_DEADLOCK, MOD_DEADLOCK],
        [{ attack: 10, defense: 10 }, { attack: 10, defense: 10 }, { attack: 10, defense: 10 }],
        [{ attack: 10, defense: 10 }, { attack: 10, defense: 10 }, { attack: 10, defense: 10 }],
      );
      expect(r.total_to_a).toBe(0);
      expect(r.total_to_b).toBe(0);
    });

    it("All Reflection — each overflows to the other two", () => {
      // Each gate: A atk=4, B def=0. Overflow=4, per=2
      // Gate 0 per=2 → gate 1 (unused_b=0): +2, gate 2 (unused_b=0): +2
      // Gate 1 per=2 → gate 0 (unused_b=0): +2, gate 2 (unused_b=0): +2
      // Gate 2 per=2 → gate 0 (unused_b=0): +2, gate 1 (unused_b=0): +2
      // dmg_b = [2+2, 2+2, 2+2] = [4, 4, 4]
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_OVERFLOW, MOD_OVERFLOW],
        [{ attack: 4, defense: 0 }, { attack: 4, defense: 0 }, { attack: 4, defense: 0 }],
        [{ attack: 0, defense: 0 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.per_gate_to_b).toEqual([4, 4, 4]);
      expect(r.total_to_b).toBe(12);
    });
  });

  describe("three different modifiers", () => {
    it("NarrowPass + Deadlock + Reflection [1, 3, 4]", () => {
      // Values are post-effectiveMoves (NarrowPass already applied)
      // Gate 0 (NarrowPass treated as Normal in damage): A atk=3, B def=1 → dmg=2
      // Gate 1 (Deadlock): no damage
      // Gate 2 (Reflection): A atk=5, B def=2. Overflow=3, per=1
      //   → gate 0: unused_b[0] = max(1-3, 0) = 0. per(1) > 0 → dmg_b[0] += 1
      //   → gate 1: Deadlock, skipped
      const r = predictedDamage(
        [MOD_NARROW_PASS, MOD_DEADLOCK, MOD_OVERFLOW],
        [{ attack: 3, defense: 0 }, { attack: 5, defense: 0 }, { attack: 5, defense: 0 }],
        [{ attack: 0, defense: 1 }, { attack: 0, defense: 0 }, { attack: 0, defense: 2 }],
      );
      expect(r.per_gate_to_b[0]).toBe(3); // direct(2) + overflow(1)
      expect(r.per_gate_to_b[1]).toBe(0); // Deadlock
      expect(r.per_gate_to_b[2]).toBe(0); // Reflection source
      expect(r.total_to_b).toBe(3);
    });

    it("Mirror + Deadlock + Reflection [2, 3, 4]", () => {
      // Mirror doesn't change damage calc — values already swapped by effectiveMoves
      // Gate 0 (Mirror, treated as Normal): A atk=2(was def), B def=5(was atk)
      //   → dmg_b[0] = max(2-5, 0) = 0
      // Gate 1 (Deadlock): no damage
      // Gate 2 (Reflection): A atk=6, B def=1. Overflow=5, per=2
      //   → gate 0: unused_b[0] = max(5-2, 0) = 3. per(2) > 3? No → 0
      //   → gate 1: Deadlock, skip
      const r = predictedDamage(
        [MOD_MIRROR, MOD_DEADLOCK, MOD_OVERFLOW],
        [{ attack: 2, defense: 5 }, { attack: 0, defense: 0 }, { attack: 6, defense: 0 }],
        [{ attack: 5, defense: 3 }, { attack: 0, defense: 0 }, { attack: 0, defense: 1 }],
      );
      // Gate 2 overflow = 5, per = 2. → gate 0: unused_b[0]=max(3-2,0)=1. per(2)>1 → +1
      expect(r.per_gate_to_b[0]).toBe(1); // overflow(2-1=1) leaks past unused defense
      expect(r.per_gate_to_b[1]).toBe(0); // Deadlock
      expect(r.per_gate_to_b[2]).toBe(0); // Reflection source
      expect(r.total_to_b).toBe(1);
    });

    it("NarrowPass + Mirror + Reflection [1, 2, 4]", () => {
      // Gate 0 (NarrowPass, Normal in damage): A atk=3, B def=2 → dmg=1
      // Gate 1 (Mirror, Normal in damage): A atk=4(was def), B def=3(was atk) → dmg=1
      // Gate 2 (Reflection): A atk=7, B def=1. Overflow=6, per=3
      //   → gate 0: unused_b[0] = max(2-3, 0)=0. per(3) > 0 → +3
      //   → gate 1: unused_b[1] = max(3-4, 0)=0. per(3) > 0 → +3
      const r = predictedDamage(
        [MOD_NARROW_PASS, MOD_MIRROR, MOD_OVERFLOW],
        [{ attack: 3, defense: 0 }, { attack: 4, defense: 3 }, { attack: 7, defense: 0 }],
        [{ attack: 0, defense: 2 }, { attack: 3, defense: 1 }, { attack: 0, defense: 1 }],
      );
      expect(r.per_gate_to_b[0]).toBe(4); // direct: max(3-2,0)=1 + overflow 3 = 4
      expect(r.per_gate_to_b[1]).toBe(6); // direct: max(4-1,0)=3 + overflow 3 = 6
      expect(r.per_gate_to_b[2]).toBe(0); // Reflection source
      expect(r.total_to_b).toBe(10);
    });

    it("NarrowPass + Mirror + Deadlock [1, 2, 3]", () => {
      // No Reflection → no overflow. Each gate acts independently.
      // Gate 0 (NarrowPass, Normal damage): A atk=3, B def=3 → 0
      // Gate 1 (Mirror, Normal damage): A atk=2(was def), B def=4(was atk) → 0
      // Gate 2 (Deadlock): 0
      const r = predictedDamage(
        [MOD_NARROW_PASS, MOD_MIRROR, MOD_DEADLOCK],
        [{ attack: 3, defense: 2 }, { attack: 2, defense: 1 }, { attack: 5, defense: 5 }],
        [{ attack: 3, defense: 3 }, { attack: 4, defense: 2 }, { attack: 5, defense: 5 }],
      );
      expect(r.per_gate_to_b[0]).toBe(0); // 3-3
      expect(r.per_gate_to_b[1]).toBe(0); // 2-2 (B's def=4 from atk swap, A's atk was def=1... wait)
      // Let me recalculate: effective moves already applied, so these ARE the post-transform values.
      // Gate 1 (Mirror gate, treated as Normal for damage): A atk=2, B def=2 → max(2-2,0)=0
      expect(r.per_gate_to_b[2]).toBe(0); // Deadlock
      expect(r.total_to_b).toBe(0);
      // B→A: gate 0: B atk=3, A def=2 → 1. gate 1: B atk=4, A def=1 → 3. gate 2: Deadlock → 0
      expect(r.per_gate_to_a).toEqual([1, 3, 0]);
      expect(r.total_to_a).toBe(4);
    });
  });

  describe("unused defense tracking", () => {
    it("reports unused defense at each gate", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 2, defense: 5 }, { attack: 0, defense: 3 }, { attack: 4, defense: 1 }],
        [{ attack: 3, defense: 4 }, { attack: 1, defense: 2 }, { attack: 0, defense: 0 }],
      );
      // A's unused def: gate0: max(5-3,0)=2, gate1: max(3-1,0)=2, gate2: max(1-0,0)=1
      expect(r.unused_def_a).toEqual([2, 2, 1]);
      // B's unused def: gate0: max(4-2,0)=2, gate1: max(2-0,0)=2, gate2: max(0-4,0)=0
      expect(r.unused_def_b).toEqual([2, 2, 0]);
    });

    it("Deadlock preserves full defense as unused", () => {
      const r = predictedDamage(
        [MOD_DEADLOCK, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 5, defense: 3 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 5, defense: 4 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      expect(r.unused_def_a[0]).toBe(3); // full defense preserved
      expect(r.unused_def_b[0]).toBe(4); // full defense preserved
    });
  });

  describe("edge cases", () => {
    it("zero attack everywhere — no damage", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_OVERFLOW, MOD_DEADLOCK],
        [{ attack: 0, defense: 5 }, { attack: 0, defense: 5 }, { attack: 0, defense: 5 }],
        [{ attack: 0, defense: 5 }, { attack: 0, defense: 5 }, { attack: 0, defense: 5 }],
      );
      expect(r.total_to_a).toBe(0);
      expect(r.total_to_b).toBe(0);
    });

    it("Reflection with zero overflow (defense >= attack)", () => {
      const r = predictedDamage(
        [MOD_OVERFLOW, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 2, defense: 0 }, { attack: 3, defense: 0 }, { attack: 3, defense: 0 }],
        [{ attack: 0, defense: 5 }, { attack: 0, defense: 0 }, { attack: 0, defense: 0 }],
      );
      // Overflow at gate 0: max(2-5, 0) = 0. No overflow distributed.
      expect(r.per_gate_to_b[0]).toBe(0);
      // Gates 1, 2 normal: 3-0=3 each
      expect(r.per_gate_to_b[1]).toBe(3);
      expect(r.per_gate_to_b[2]).toBe(3);
      expect(r.total_to_b).toBe(6);
    });

    it("asymmetric — one player all attack, other all defense", () => {
      const r = predictedDamage(
        [MOD_NORMAL, MOD_NORMAL, MOD_NORMAL],
        [{ attack: 5, defense: 0 }, { attack: 5, defense: 0 }, { attack: 0, defense: 0 }],
        [{ attack: 0, defense: 3 }, { attack: 0, defense: 3 }, { attack: 0, defense: 4 }],
      );
      // A→B: 5-3=2, 5-3=2, 0-4=0
      expect(r.total_to_b).toBe(4);
      // B→A: 0-0=0, 0-0=0, 0-0=0
      expect(r.total_to_a).toBe(0);
    });
  });
});

// ─── Full pipeline (effectiveMoves → predictedDamage) ────────────────────────

describe("full pipeline: modifier interactions", () => {
  describe("NarrowPass affects Reflection overflow", () => {
    it("NarrowPass caps values before Reflection calculates overflow", () => {
      // Raw: A atk=[5,3,3], def=[0,0,0]. B atk=[0,0,0], def=[2,0,0]
      // Gate 0: Reflection. Gate 1: NarrowPass. Gate 2: Normal.
      // effectiveMoves: gate 1 NarrowPass caps A atk to 3 (already 3, no change)
      // predictedDamage: gate 0 overflow = 5-2 = 3, per = 1
      //   → gate 1: direct(3-0=3) + overflow(1-0=1) = 4 (NarrowPass doesn't block overflow)
      //   → gate 2: direct(3-0=3) + overflow(1-0=1) = 4
      const r = fullDamage(
        [MOD_OVERFLOW, MOD_NARROW_PASS, MOD_NORMAL],
        { attack: [5, 3, 3], defense: [0, 0, 0] },
        { attack: [0, 0, 0], defense: [2, 0, 0] },
      );
      expect(r.per_gate_to_b[0]).toBe(0); // Reflection source
      expect(r.per_gate_to_b[1]).toBe(4); // direct + overflow
      expect(r.per_gate_to_b[2]).toBe(4); // direct + overflow
      expect(r.total_to_b).toBe(8);
    });

    it("NarrowPass caps high attack — reduces potential overflow from Reflection gate", () => {
      // Gate 0: NarrowPass (caps A atk from 8 to 3)
      // Gate 1: Reflection
      // Gate 2: Normal
      // If NarrowPass didn't cap, gate 0 direct damage would be 8-1=7
      // With cap: gate 0 direct damage is 3-1=2
      const r = fullDamage(
        [MOD_NARROW_PASS, MOD_OVERFLOW, MOD_NORMAL],
        { attack: [8, 6, 2], defense: [0, 0, 0] },
        { attack: [0, 0, 0], defense: [1, 2, 1] },
      );
      // Gate 0 NarrowPass direct: cap(8)=3, 3-1=2
      // Gate 1 Reflection: overflow = 6-2 = 4, per = 2
      //   → gate 0: unused_b[0] = max(1-3,0) = 0. per(2) > 0 → +2. Total gate 0: 2+2=4
      //   → gate 2: unused_b[2] = max(1-2,0) = 0. per(2) > 0 → +2. Total gate 2: 1+2=3
      expect(r.per_gate_to_b[0]).toBe(4); // direct(2) + overflow(2)
      expect(r.per_gate_to_b[1]).toBe(0); // Reflection source
      expect(r.per_gate_to_b[2]).toBe(3); // direct(2-1=1) + overflow(2)
      expect(r.total_to_b).toBe(7);
    });
  });

  describe("Mirror affects Reflection", () => {
    it("Mirror swaps values — reversed attack becomes overflow source", () => {
      // Raw: A atk=[0,0,0], def=[5,0,0]. B atk=[0,0,0], def=[1,0,0]
      // Gate 0: Mirror. A: atk=def(5), def=atk(0). B: atk=def(1), def=atk(0)
      // Gate 1: Reflection.
      // Gate 2: Normal.
      // After effectiveMoves: A=[{5,0},{0,0},{0,0}], B=[{1,0},{0,0},{0,0}]
      // predictedDamage:
      //   Gate 0 (Mirror, Normal damage): A atk=5, B def=0 → dmg_b=5
      //   Gate 1 (Reflection): A atk=0, B def=0 → overflow=0
      //   Gate 2 (Normal): A atk=0, B def=0 → 0
      const r = fullDamage(
        [MOD_MIRROR, MOD_OVERFLOW, MOD_NORMAL],
        { attack: [0, 0, 0], defense: [5, 0, 0] },
        { attack: [0, 0, 0], defense: [1, 0, 0] },
      );
      // Mirror turned A's defense into attack
      // A at gate 0: atk = A's raw def = 5, def = A's raw atk = 0
      // B at gate 0: atk = B's raw def = 1, def = B's raw atk = 0
      // A→B: 5-0=5. B→A: 1-0=1.
      expect(r.per_gate_to_b[0]).toBe(5);
      expect(r.per_gate_to_a[0]).toBe(1);
      expect(r.total_to_b).toBe(5);
      expect(r.total_to_a).toBe(1);
    });

    it("Mirror + Reflection — swapped defense feeds into overflow calculation", () => {
      // Raw: A atk=[0,6,0], def=[4,0,0]. B atk=[0,0,0], def=[0,1,0]
      // Gate 0: Mirror. A: atk=4, def=0. B: atk=0, def=0
      // Gate 1: Reflection. No transform.
      // Gate 2: Normal. No transform.
      const r = fullDamage(
        [MOD_MIRROR, MOD_OVERFLOW, MOD_NORMAL],
        { attack: [0, 6, 0], defense: [4, 0, 0] },
        { attack: [0, 0, 0], defense: [0, 1, 0] },
      );
      // Gate 0 (Mirror, Normal damage): A atk=4, B def=0 → dmg_b[0]=4. unused_b[0]=0
      // Gate 1 (Reflection): A atk=6, B def=1. Overflow=5, per=2
      //   → gate 0: unused_b[0]=0. per(2)>0 → dmg_b[0]+=2. Total: 4+2=6
      //   → gate 2: unused_b[2]=0. per(2)>0 → dmg_b[2]+=2. Total: 0+2=2
      expect(r.per_gate_to_b[0]).toBe(6);
      expect(r.per_gate_to_b[1]).toBe(0); // Reflection source
      expect(r.per_gate_to_b[2]).toBe(2);
      expect(r.total_to_b).toBe(8);
    });
  });

  describe("NarrowPass + Mirror on adjacent gates", () => {
    it("NarrowPass gate has capped values, Mirror gate has swapped values", () => {
      // Gate 0: NarrowPass — A atk 7→3, def 1→1. B atk 5→3, def 6→3
      // Gate 1: Mirror — A atk=def(2), def=atk(4). B atk=def(3), def=atk(2)
      // Gate 2: Normal
      const r = fullDamage(
        [MOD_NARROW_PASS, MOD_MIRROR, MOD_NORMAL],
        { attack: [7, 4, 3], defense: [1, 2, 1] },
        { attack: [5, 2, 1], defense: [6, 3, 2] },
      );
      // Gate 0: A atk=3, B def=3 → 0. B atk=3, A def=1 → 2
      expect(r.per_gate_to_b[0]).toBe(0);
      expect(r.per_gate_to_a[0]).toBe(2);
      // Gate 1: A atk=2(was def), def=4(was atk). B atk=3(was def), def=2(was atk)
      // A→B: 2-2=0. B→A: 3-4=0
      expect(r.per_gate_to_b[1]).toBe(0);
      expect(r.per_gate_to_a[1]).toBe(0);
      // Gate 2: A atk=3, B def=2 → 1. B atk=1, A def=1 → 0
      expect(r.per_gate_to_b[2]).toBe(1);
      expect(r.per_gate_to_a[2]).toBe(0);
      expect(r.total_to_b).toBe(1);
      expect(r.total_to_a).toBe(2);
    });
  });

  describe("all modifiers in play", () => {
    it("Normal + NarrowPass + Mirror [0, 1, 2] — no overflow mechanics", () => {
      const r = fullDamage(
        [MOD_NORMAL, MOD_NARROW_PASS, MOD_MIRROR],
        { attack: [4, 5, 1], defense: [2, 1, 4] },
        { attack: [3, 4, 2], defense: [1, 2, 3] },
      );
      // Gate 0 Normal: A atk=4, B def=1 → 3. B atk=3, A def=2 → 1
      expect(r.per_gate_to_b[0]).toBe(3);
      expect(r.per_gate_to_a[0]).toBe(1);
      // Gate 1 NarrowPass: A atk=3(capped from 5), def=1. B atk=3(capped from 4), def=2
      // A→B: 3-2=1. B→A: 3-1=2
      expect(r.per_gate_to_b[1]).toBe(1);
      expect(r.per_gate_to_a[1]).toBe(2);
      // Gate 2 Mirror: A atk=4(was def), def=1(was atk). B atk=3(was def), def=2(was atk)
      // A→B: 4-2=2. B→A: 3-1=2
      expect(r.per_gate_to_b[2]).toBe(2);
      expect(r.per_gate_to_a[2]).toBe(2);
      expect(r.total_to_b).toBe(6);
      expect(r.total_to_a).toBe(5);
    });

    it("Deadlock + Reflection + Normal [3, 4, 0] — overflow only reaches Normal gate", () => {
      const r = fullDamage(
        [MOD_DEADLOCK, MOD_OVERFLOW, MOD_NORMAL],
        { attack: [5, 8, 2], defense: [0, 0, 0] },
        { attack: [3, 0, 0], defense: [0, 2, 1] },
      );
      // Gate 0 Deadlock: no damage
      // Gate 1 Reflection: overflow = 8-2 = 6, per = 3
      //   → gate 0: Deadlock, skip
      //   → gate 2: unused_b[2] = max(1-2, 0)=0. per(3) > 0 → +3
      // Gate 2 Normal: direct = 2-1=1. + overflow(3) = 4
      expect(r.per_gate_to_b[0]).toBe(0);
      expect(r.per_gate_to_b[1]).toBe(0);
      expect(r.per_gate_to_b[2]).toBe(4); // direct(1) + overflow(3)
      expect(r.total_to_b).toBe(4);
    });

    it("Reflection + Reflection + Reflection [4, 4, 4] — all overflow to each other", () => {
      const r = fullDamage(
        [MOD_OVERFLOW, MOD_OVERFLOW, MOD_OVERFLOW],
        { attack: [3, 5, 7], defense: [0, 0, 0] },
        { attack: [0, 0, 0], defense: [1, 2, 3] },
      );
      // Gate 0: overflow = 3-1=2, per=1
      // Gate 1: overflow = 5-2=3, per=1
      // Gate 2: overflow = 7-3=4, per=2
      // unused_b = [0, 0, 0] (all B def consumed by A attack at overflow gates)
      //   Actually: unused_b[g] = max(bd - aa, 0)
      //   Gate 0: max(1-3, 0) = 0
      //   Gate 1: max(2-5, 0) = 0
      //   Gate 2: max(3-7, 0) = 0
      // Distribution:
      //   Gate 0 per=1: → gate 1: +1, gate 2: +1
      //   Gate 1 per=1: → gate 0: +1, gate 2: +1
      //   Gate 2 per=2: → gate 0: +2, gate 1: +2
      // dmg_b = [1+2, 1+2, 1+1] = [3, 3, 2]
      expect(r.per_gate_to_b).toEqual([3, 3, 2]);
      expect(r.total_to_b).toBe(8);
    });

    it("real match scenario: Match 16 Round 2 (NarrowPass + Normal + Mirror)", () => {
      // From playtest: gates = [NarrowPass, Normal, Mirror]
      // Agent (B): atk=[2,4,0], def=[0,0,2], nodes+repair omitted
      // Opponent (A): atk=[0,3,0], def=[3,0,4]
      const r = fullDamage(
        [MOD_NARROW_PASS, MOD_NORMAL, MOD_MIRROR],
        { attack: [0, 3, 0], defense: [3, 0, 4] },
        { attack: [2, 4, 0], defense: [0, 0, 2] },
      );
      // Gate 0 NarrowPass: A atk=0, def=3. B atk=2, def=0
      //   A→B: 0-0=0. B→A: 2-3=0 (capped doesn't matter, already ≤3)
      expect(r.per_gate_to_b[0]).toBe(0);
      expect(r.per_gate_to_a[0]).toBe(0);
      // Gate 1 Normal: A atk=3, B def=0 → dmg_to_b=3. B atk=4, A def=0 → dmg_to_a=4
      expect(r.per_gate_to_b[1]).toBe(3);
      expect(r.per_gate_to_a[1]).toBe(4);
      // Gate 2 Mirror: A atk=4(was def), def=0(was atk). B atk=2(was def), def=0(was atk)
      // A→B: 4-0=4. B→A: 2-0=2... wait
      // Wait: A raw atk=0, def=4 at gate 2. Mirror swaps: A atk=4, def=0
      //        B raw atk=0, def=2 at gate 2. Mirror swaps: B atk=2, def=0
      // A→B: 4 - 0 = 4. B→A: 2 - 0 = 2
      expect(r.per_gate_to_b[2]).toBe(4);
      expect(r.per_gate_to_a[2]).toBe(2);
      // Totals: B takes 0+4+4=8 from A, A takes 0+3+2=5 from B... hmm
      // Wait, let me re-check. A→B means damage TO B from A's attacks.
      // per_gate_to_b = damage dealt TO player B
      //   gate 0: A atk=0 vs B def=0 → max(0-0,0) = 0 ✓
      //   gate 1: A atk=3 vs B def=0 → 3
      //   gate 2: A atk=4 vs B def=0 → 4
      // Hmm that gives total_to_b = 7, not matching my earlier calc.
      // Let me redo: per_gate_to_b[g] = max(A_attack - B_defense, 0)
      expect(r.total_to_b).toBe(7);
      expect(r.total_to_a).toBe(6);
    });
  });
});
