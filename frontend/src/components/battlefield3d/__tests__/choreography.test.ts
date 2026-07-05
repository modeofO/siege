import { describe, it, expect } from "vitest";
import { buildTimeline } from "../choreography";
import { resolveRoundLocal, type PlayerMove, type RoundEvent } from "@/lib/resolution1v1";
import type { NodeOwner } from "@/lib/gameState1v1";

// A neutral move template; override fields per test.
function move(overrides: Partial<PlayerMove> = {}): PlayerMove {
  return {
    attack: [0, 0, 0],
    defense: [0, 0, 0],
    repair: 0,
    nodeContest: [0, 0, 0],
    traps: [0, 0, 0],
    abilityId: 0,
    abilityTarget: 0,
    ...overrides,
  };
}

// Kitchen-sink outcome, produced by the REAL engine so the event shapes and
// ordering are exactly what the scene will replay:
//   - captures node0 and node2 (both from teamB), each with an enemy trap armed
//   - clashes at gate0 (dmg to A) and gate1 (dmg to B); gate2 stays quiet
//   - A repairs 3; A takes 3 gate dmg, B takes 5 gate dmg
//   - A fires Ember (T1) at B; two traps detonate on A
//   - round 10 so the match finishes (A wins on HP)
function kitchenSinkEvents(): RoundEvent[] {
  const outcome = resolveRoundLocal({
    moveA: move({
      attack: [0, 5, 0],
      repair: 3,
      nodeContest: [1, 0, 1],
      abilityId: 3, // Ember Blast T1
    }),
    moveB: move({
      attack: [4, 0, 0],
      traps: [1, 0, 1],
    }),
    nodeOwners: ["teamB", "neutral", "teamB"] as [NodeOwner, NodeOwner, NodeOwner],
    modifiers: [0, 0, 0],
    vaultAHp: 40,
    vaultBHp: 10,
    round: 10,
  });
  return outcome.events;
}

describe("buildTimeline", () => {
  it("returns an empty timeline for no events", () => {
    expect(buildTimeline([])).toEqual({ steps: [], total: 0 });
  });

  it("produces a short timeline for a quiet round (only a gate-damage tick)", () => {
    const { steps, total } = buildTimeline([{ kind: "vault_damaged", side: "a", amount: 4 }]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      at: 2.6,
      duration: 0.8,
      action: { kind: "hp_tick", side: "a", delta: -4 },
    });
    expect(total).toBe(3.4);
  });

  describe("kitchen-sink round (real resolveRoundLocal output)", () => {
    const events = kitchenSinkEvents();
    const { steps, total } = buildTimeline(events);

    it("sanity-checks that the crafted round emits every event kind", () => {
      const kinds = new Set(events.map((e) => e.kind));
      expect(kinds).toEqual(
        new Set([
          "node_captured",
          "troops_clash",
          "vault_repaired",
          "vault_damaged",
          "ember_blast",
          "trap_detonated",
          "match_finished",
        ]),
      );
    });

    it("places both node flips at t=0 simultaneously, 0.5s each", () => {
      const flips = steps.filter((s) => s.action.kind === "node_flip");
      expect(flips).toHaveLength(2);
      for (const s of flips) {
        expect(s.at).toBe(0.0);
        expect(s.duration).toBe(0.5);
      }
      expect(flips.map((s) => (s.action as { node: number }).node).sort()).toEqual([0, 2]);
      expect((flips[0].action as { to: NodeOwner }).to).toBe("teamA");
    });

    it("staggers clashes 0.3s in gate order starting at 0.6s, 1.0s each", () => {
      const clashes = steps.filter((s) => s.action.kind === "clash");
      expect(clashes).toHaveLength(2); // gate2 was quiet -> omitted
      expect(clashes[0]).toEqual({
        at: 0.6,
        duration: 1.0,
        action: { kind: "clash", gate: 0, dmgToA: 3, dmgToB: 0 },
      });
      expect(clashes[1]).toEqual({
        at: 0.9,
        duration: 1.0,
        action: { kind: "clash", gate: 1, dmgToA: 0, dmgToB: 5 },
      });
    });

    it("emits a repair_glow carrying the HP amount (no positive hp_tick)", () => {
      const glows = steps.filter((s) => s.action.kind === "repair_glow");
      expect(glows).toHaveLength(1);
      expect(glows[0]).toEqual({
        at: 2.4,
        duration: 0.6,
        action: { kind: "repair_glow", side: "a", amount: 3 },
      });
      // repair reaches HP via repair_glow.amount; every hp_tick is damage.
      const ticks = steps.filter((s) => s.action.kind === "hp_tick");
      for (const t of ticks) {
        expect((t.action as { delta: number }).delta).toBeLessThan(0);
      }
    });

    it("emits gate-damage hp_ticks at 2.6s with negative deltas", () => {
      const ticks = steps.filter((s) => s.action.kind === "hp_tick");
      expect(ticks).toHaveLength(2);
      for (const t of ticks) {
        expect(t.at).toBe(2.6);
        expect(t.duration).toBe(0.8);
      }
      const byside = Object.fromEntries(
        ticks.map((t) => [(t.action as { side: string }).side, (t.action as { delta: number }).delta]),
      );
      expect(byside).toEqual({ a: -3, b: -5 });
    });

    it("emits the ember at 3.4s, 0.5s", () => {
      const embers = steps.filter((s) => s.action.kind === "ember");
      expect(embers).toHaveLength(1);
      expect(embers[0]).toEqual({
        at: 3.4,
        duration: 0.5,
        action: { kind: "ember", side: "b", amount: 2 },
      });
    });

    it("staggers trap blasts 0.2s from 3.4s, 0.6s each", () => {
      const traps = steps.filter((s) => s.action.kind === "trap_blast");
      expect(traps).toHaveLength(2);
      expect(traps[0]).toEqual({
        at: 3.4,
        duration: 0.6,
        action: { kind: "trap_blast", node: 0, victim: "a" },
      });
      expect(traps[1]).toEqual({
        at: 3.6,
        duration: 0.6,
        action: { kind: "trap_blast", node: 2, victim: "a" },
      });
    });

    it("places banner_finish 0.3s after the last other step ends", () => {
      const banner = steps.find((s) => s.action.kind === "banner_finish");
      expect(banner).toBeDefined();
      // last non-banner step ends at max(0.5, 1.9, 3.0, 3.4, 3.9, 4.2) = 4.2
      expect(banner!.at).toBe(4.5);
      expect(banner!.duration).toBe(0.6);
      expect(banner!.action).toEqual({ kind: "banner_finish", winnerTeam: 1 });
    });

    it("keeps the whole timeline within 5.5s and total = end of last step", () => {
      expect(total).toBe(5.1);
      expect(total).toBeLessThanOrEqual(5.5);
      const computed = Math.max(...steps.map((s) => s.at + s.duration));
      expect(total).toBeCloseTo(computed, 10);
    });

    it("emits steps ordered by start time", () => {
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].at).toBeGreaterThanOrEqual(steps[i - 1].at);
      }
    });
  });

  it("omits zero-amount events (no repair, no clash, no damage)", () => {
    const { steps, total } = buildTimeline([
      { kind: "vault_repaired", side: "a", amount: 0 },
      { kind: "vault_damaged", side: "b", amount: 0 },
      { kind: "ember_blast", side: "a", amount: 0 },
    ]);
    expect(steps).toEqual([]);
    expect(total).toBe(0);
  });
});
