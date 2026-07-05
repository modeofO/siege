// Pure choreography timeline builder for the 3D war table.
//
// Turns a resolved round's `RoundEvent[]` (from resolution1v1.ts) into a flat,
// time-stamped animation script. No three.js, no React, no clock — Task 7's
// ResolutionPlayer walks these steps on the frame clock. Keeping this pure makes
// the timing fully unit-testable and deterministic.
//
// Timing map is FIXED and pinned by tests (all values in seconds):
//   node flips     0.0s,          0.5s each, simultaneous
//   clashes        0.6s +0.3s/clash in gate order, 1.0s each
//   repair glow    2.4s,          0.6s
//   gate hp ticks  2.6s,          0.8s (simultaneous per side)
//   ember          3.4s,          0.5s
//   trap blasts    3.4s +0.2s/trap,          0.6s each
//   banner_finish  0.3s after the last other step ends, 0.6s
//
// Repair→HP mapping decision: the repair increase reaches the HP display via
// `repair_glow.amount` — the player treats a repair_glow's amount as a POSITIVE
// HP delta. We deliberately do NOT emit a separate positive hp_tick. This keeps
// steps 1:1 with events, keeps every hp_tick a damage tick (delta < 0), and
// avoids two HP-mutating steps racing at the same timestamp.
//
// Zero-amount events (no clash, zero repair, zero damage) produce NO step, so
// quiet rounds stay short. `total` is the end (at + duration) of the last step.

import type { RoundEvent } from "@/lib/resolution1v1";
import type { NodeOwner } from "@/lib/gameState1v1";

export interface TimelineStep {
  at: number; // seconds from timeline start
  duration: number; // seconds
  action:
    | { kind: "node_flip"; node: number; to: NodeOwner }
    | { kind: "clash"; gate: number; dmgToA: number; dmgToB: number } // intensity = dmg
    | { kind: "repair_glow"; side: "a" | "b"; amount: number }
    | { kind: "hp_tick"; side: "a" | "b"; delta: number } // negative = damage
    | { kind: "ember"; side: "a" | "b"; amount: number }
    | { kind: "trap_blast"; node: number; victim: "a" | "b" }
    | { kind: "banner_finish"; winnerTeam: 0 | 1 | 2 };
}

const TIMING = {
  nodeFlipAt: 0.0,
  nodeFlipDur: 0.5,
  clashStart: 0.6,
  clashStagger: 0.3,
  clashDur: 1.0,
  repairAt: 2.4,
  repairDur: 0.6,
  hpTickAt: 2.6,
  hpTickDur: 0.8,
  emberAt: 3.4,
  emberDur: 0.5,
  trapStart: 3.4,
  trapStagger: 0.2,
  trapDur: 0.6,
  bannerGap: 0.3,
  bannerDur: 0.6,
} as const;

// Guard against binary-float drift from repeated additions (e.g. 0.6 + 0.3).
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildTimeline(events: RoundEvent[]): { steps: TimelineStep[]; total: number } {
  const steps: TimelineStep[] = [];

  // 1. Node flips — all at t=0, simultaneous.
  for (const e of events) {
    if (e.kind === "node_captured") {
      steps.push({
        at: TIMING.nodeFlipAt,
        duration: TIMING.nodeFlipDur,
        action: { kind: "node_flip", node: e.node, to: e.to },
      });
    }
  }

  // 2. Clashes — staggered in gate order. Engine emits in gate order already;
  // sort defensively so the stagger index tracks gate order regardless of input.
  const clashes = events
    .filter((e): e is Extract<RoundEvent, { kind: "troops_clash" }> => e.kind === "troops_clash")
    .sort((a, b) => a.gate - b.gate);
  clashes.forEach((e, i) => {
    steps.push({
      at: round3(TIMING.clashStart + i * TIMING.clashStagger),
      duration: TIMING.clashDur,
      action: { kind: "clash", gate: e.gate, dmgToA: e.dmgToA, dmgToB: e.dmgToB },
    });
  });

  // 3. Repair glow — carries the HP amount (see file header).
  for (const e of events) {
    if (e.kind === "vault_repaired" && e.amount > 0) {
      steps.push({
        at: TIMING.repairAt,
        duration: TIMING.repairDur,
        action: { kind: "repair_glow", side: e.side, amount: e.amount },
      });
    }
  }

  // 4. Gate-damage HP ticks — negative delta, simultaneous.
  for (const e of events) {
    if (e.kind === "vault_damaged" && e.amount > 0) {
      steps.push({
        at: TIMING.hpTickAt,
        duration: TIMING.hpTickDur,
        action: { kind: "hp_tick", side: e.side, delta: -e.amount },
      });
    }
  }

  // 5. Ember blasts (side = victim).
  for (const e of events) {
    if (e.kind === "ember_blast" && e.amount > 0) {
      steps.push({
        at: TIMING.emberAt,
        duration: TIMING.emberDur,
        action: { kind: "ember", side: e.side, amount: e.amount },
      });
    }
  }

  // 6. Trap blasts — staggered in detonation order.
  const traps = events.filter(
    (e): e is Extract<RoundEvent, { kind: "trap_detonated" }> => e.kind === "trap_detonated",
  );
  traps.forEach((e, i) => {
    steps.push({
      at: round3(TIMING.trapStart + i * TIMING.trapStagger),
      duration: TIMING.trapDur,
      action: { kind: "trap_blast", node: e.node, victim: e.victim },
    });
  });

  // 7. Banner — 0.3s after everything else ends. Computed before it is added.
  const lastOtherEnd = steps.reduce((max, s) => Math.max(max, s.at + s.duration), 0);
  for (const e of events) {
    if (e.kind === "match_finished") {
      steps.push({
        at: round3(lastOtherEnd + TIMING.bannerGap),
        duration: TIMING.bannerDur,
        action: { kind: "banner_finish", winnerTeam: e.winnerTeam },
      });
    }
  }

  const total = round3(steps.reduce((max, s) => Math.max(max, s.at + s.duration), 0));
  return { steps, total };
}
