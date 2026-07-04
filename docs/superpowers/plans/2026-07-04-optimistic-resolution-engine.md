# Optimistic Resolution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure-TypeScript mirror of `resolution_1v1.cairo`'s round math that computes the round outcome the instant both reveals are indexed, so the UI shows the battle result 30–45 seconds before the chain confirms it.

**Architecture:** One pure module (`resolution1v1.ts`) with a single entry point `resolveRoundLocal(inputs) → outcome`, staged exactly like the Cairo pipeline: node contests → gate math (modifiers + Fortify + Siege Sword + node defense) → Stone Cloak halving → reflection distribution → Hex → repair (with T2 cloak negation) → gate damage → Ember Blast → traps → win condition. The existing partial mirror `computeGateBreakdown` in `gameState1v1.ts` is absorbed into the engine (it currently omits node defense and all abilities, so round-history numbers are subtly wrong today — this fixes them). The match page then computes the outcome optimistically when `reveal_count === 2` and reconciles when the chain resolve indexes.

**Tech Stack:** TypeScript, vitest (already configured — `frontend/src/lib/__tests__/` pattern), React 19 / Next 16. No new dependencies.

## Global Constraints

- Chain is authoritative: on any mismatch between local and chain outcome, log `console.error` and snap to chain state.
- The engine mirrors deployed Cairo (`src/systems/resolution_1v1.cairo`) exactly — where this plan's code and the Cairo disagree, the Cairo wins.
- Frontend rules: `BigInt(0)` not `0n`; no new GraphQL; `react-hooks/set-state-in-effect` is strict — no synchronous setState in effect bodies (use refs/derived state; the existing round-transition effect at `page.tsx:260` is the grandfathered pattern to imitate, not extend).
- All commands run from `/Users/modeofo/Apps/siege/frontend`. Tests: `bunx vitest run <file>`. Full gates: `bun run lint` (baseline: 10 pre-existing problems — add ZERO), `bunx tsc --noEmit`, `bun run build`.
- Commit after every task: author is repo-local config, add trailer `Co-authored-by: Claude <noreply@anthropic.com>`.
- Do NOT touch anything under `.claude/worktrees/`.

## Cairo semantics that WILL be gotten wrong unless copied carefully

1. **Operation order is load-bearing:** node contests happen BEFORE gate math (captured node grants +1 defense same round). Repair applies BEFORE gate damage. Ember applies AFTER gate damage. Traps apply LAST (post-repair, unhealable).
2. **Modifier codes:** 0 Normal, 1 Narrow Pass (cap all four values at 3), 2 Mirror (swap attack↔defense per player), 3 Deadlock (no damage at gate; reflection never targets it), 4 Reflection (attack−defense becomes overflow; half of each gate's overflow, floored, goes to EACH other non-Deadlock gate, reduced by that gate's unused defense; unused defense is NOT consumed — each reflection checks the same value).
3. **Unused defense** is only recorded at Normal/NarrowPass/Mirror gates where defense ≥ attack (`def − atk`). Cairo records nothing at Deadlock/Reflection gates. (The old TS `computeGateBreakdown` sets it at Deadlock gates too — harmless since distribution skips Deadlock targets, but the engine should match Cairo: don't record it.)
4. **Ability decode:** `type = ((id−1) % 5) + 1`, `tier = ((id−1) / 5 | 0) + 1`, id 0 = none. Types: 1 Siege Sword, 2 Stone Cloak, 3 Ember Blast, 4 Hex, 5 Fortify.
5. **Fortify** boosts the caster's defense at EVERY gate (T1: +1, T2: ×2), applied after Narrow/Mirror transforms. **Siege Sword** OVERRIDES (not adds) the caster's attack at the target gate only (T1: 5, T2: 10). **Node defense** (+1 at gate g for post-contest owner of node g) applies after both.
6. **Stone Cloak** (either tier) halves — integer floor — every per-gate damage AND overflow entry aimed at the caster, BEFORE reflection distribution. T2 additionally zeroes the OPPONENT's repair.
7. **Hex** reduces the caster's total incoming gate damage (post-reflection sum) by 3 (T1) / 8 (T2), floor 0.
8. **HP application half-open comparisons differ:** gate/trap damage uses `if dmg >= hp → 0`; Ember uses `if hp > dmg → hp − dmg else 0`. Same outcome, but copy them as written so vector tests pass.
9. **Repair** caps HP at 50. **Traps:** a node that CHANGED owner this round where the previous owner had armed a trap deals a flat 5 to the capturing side; sum across nodes.
10. **Node contest:** strictly greater wins; tie leaves ownership unchanged.
11. **Win:** if either HP is 0 → finished (winner = side with HP > 0, both 0 → draw 0). Else if `round >= 10` → finished by HP comparison. Else round advances (next-round modifiers come from VRF — NOT mirrored; the engine returns `nextModifiersKnown: false`).

## File Structure

- Create: `frontend/src/lib/resolution1v1.ts` — the pure engine (types, ability helpers, `resolveRoundLocal`)
- Create: `frontend/src/lib/__tests__/resolution1v1.test.ts` — unit tests + Cairo-derived vectors
- Modify: `frontend/src/lib/gameState1v1.ts` — `useRoundHistory1v1` delegates gate math to the engine; delete `computeGateBreakdown`
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx` — optimistic trigger + reconcile

---

### Task 1: Engine types, ability helpers, node contests

**Files:**
- Create: `frontend/src/lib/resolution1v1.ts`
- Test: `frontend/src/lib/__tests__/resolution1v1.test.ts`

**Interfaces:**
- Consumes: `NodeOwner` type from `@/lib/gameState1v1` (`"teamA" | "teamB" | "neutral"`).
- Produces: `PlayerMove`, `RoundInputs`, `RoundOutcome`, `RoundEvent`, `abilityType(id)`, `abilityTier(id)`, `resolveNodeContests(a, b, owners)` — exact shapes below; Tasks 2–4 build on them verbatim.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/__tests__/resolution1v1.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: FAIL — module `@/lib/resolution1v1` not found.

- [ ] **Step 3: Implement types + helpers**

```ts
// frontend/src/lib/resolution1v1.ts
// Pure mirror of src/systems/resolution_1v1.cairo round math.
// Chain is authoritative; this exists so the UI can act on the outcome
// the moment both reveals are indexed instead of waiting for resolve.
import type { NodeOwner } from "@/lib/gameState1v1";

export interface PlayerMove {
  attack: [number, number, number]; // p0..p2
  defense: [number, number, number]; // g0..g2
  repair: number;
  nodeContest: [number, number, number]; // nc0..nc2
  traps: [number, number, number]; // 0 | 1 per node
  abilityId: number; // 0 = none, 1-10
  abilityTarget: number; // gate index (Siege Sword)
}

export interface RoundInputs {
  moveA: PlayerMove;
  moveB: PlayerMove;
  nodeOwners: [NodeOwner, NodeOwner, NodeOwner]; // pre-round
  modifiers: [number, number, number]; // this round's gate mods
  vaultAHp: number;
  vaultBHp: number;
  round: number;
}

export interface NodeCapture {
  node: number;
  from: NodeOwner;
  to: NodeOwner;
}

export interface GateOutcome {
  gate: number;
  modifier: number;
  // Effective values after Narrow/Mirror/Fortify/Siege Sword/node defense
  attackA: number;
  defenseA: number;
  attackB: number;
  defenseB: number;
  dmgToA: number; // final per-gate, incl. reflection and cloak halving
  dmgToB: number;
}

export type RoundEvent =
  | { kind: "node_captured"; node: number; from: NodeOwner; to: NodeOwner }
  | { kind: "troops_clash"; gate: number; dmgToA: number; dmgToB: number }
  | { kind: "vault_repaired"; side: "a" | "b"; amount: number }
  | { kind: "vault_damaged"; side: "a" | "b"; amount: number }
  | { kind: "ember_blast"; side: "a" | "b"; amount: number } // side = victim
  | { kind: "trap_detonated"; node: number; victim: "a" | "b"; amount: number }
  | { kind: "match_finished"; winnerTeam: 0 | 1 | 2 };

export interface RoundOutcome {
  nodeOwnersAfter: [NodeOwner, NodeOwner, NodeOwner];
  nodeCaptures: NodeCapture[];
  gates: [GateOutcome, GateOutcome, GateOutcome];
  totalDamageToA: number; // post-Hex gate damage
  totalDamageToB: number;
  repairA: number; // post T2-cloak negation
  repairB: number;
  emberToA: number;
  emberToB: number;
  trapDamageToA: number;
  trapDamageToB: number;
  vaultAHpAfter: number;
  vaultBHpAfter: number;
  finished: boolean;
  winnerTeam: 0 | 1 | 2 | null; // null when not finished
  nextModifiersKnown: false; // VRF — always awaits chain
  events: RoundEvent[];
}

// Cairo: ability_type_from_token / ability_tier_from_token
export function abilityType(tokenId: number): number {
  return tokenId === 0 ? 0 : ((tokenId - 1) % 5) + 1;
}
export function abilityTier(tokenId: number): number {
  return tokenId === 0 ? 0 : Math.floor((tokenId - 1) / 5) + 1;
}

// Cairo: node contest loop — strictly greater wins, tie holds.
export function resolveNodeContests(
  contestA: [number, number, number],
  contestB: [number, number, number],
  owners: [NodeOwner, NodeOwner, NodeOwner],
): { owners: [NodeOwner, NodeOwner, NodeOwner]; captures: NodeCapture[] } {
  const after = [...owners] as [NodeOwner, NodeOwner, NodeOwner];
  const captures: NodeCapture[] = [];
  for (let n = 0; n < 3; n++) {
    let winner: NodeOwner | null = null;
    if (contestA[n] > contestB[n]) winner = "teamA";
    else if (contestB[n] > contestA[n]) winner = "teamB";
    if (winner !== null && winner !== after[n]) {
      captures.push({ node: n, from: after[n], to: winner });
      after[n] = winner;
    }
  }
  return { owners: after, captures };
}
```

Note one deliberate divergence from Cairo bookkeeping: Cairo rewrites the NodeState even when the winner already owns the node; `captures` only records actual ownership *changes* (that is also exactly the trap-trigger condition, used in Task 3).

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: PASS (2 describe blocks, 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolution1v1.ts src/lib/__tests__/resolution1v1.test.ts
git commit -m "resolution engine: types, ability decode, node contests

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 2: Gate stage — modifiers, Fortify, Siege Sword, node defense, reflection

**Files:**
- Modify: `frontend/src/lib/resolution1v1.ts`
- Test: `frontend/src/lib/__tests__/resolution1v1.test.ts`

**Interfaces:**
- Consumes: `abilityType`, `abilityTier`, `NodeOwner` from Task 1.
- Produces: `computeGateStage(moveA, moveB, modifiers, postNodeOwners): GateStage` where `GateStage = { dmgToA: number[]; dmgToB: number[]; effective: { attackA: number[]; defenseA: number[]; attackB: number[]; defenseB: number[] } }`. Per-gate damage here is pre-Hex but post-cloak-halving and post-reflection. Task 4 consumes it.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
import { computeGateStage } from "@/lib/resolution1v1";

const MOVE0 = {
  attack: [0, 0, 0] as [number, number, number],
  defense: [0, 0, 0] as [number, number, number],
  repair: 0,
  nodeContest: [0, 0, 0] as [number, number, number],
  traps: [0, 0, 0] as [number, number, number],
  abilityId: 0,
  abilityTarget: 0,
};
const NO_NODES: ["neutral", "neutral", "neutral"] = ["neutral", "neutral", "neutral"];

describe("gate stage", () => {
  it("basic damage: attack minus defense, floored at 0", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [5, 2, 0] },
      { ...MOVE0, defense: [3, 4, 0] },
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([2, 0, 0]);
    expect(s.dmgToA).toEqual([0, 0, 0]);
  });

  it("narrow pass caps all four values at 3", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [8, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0] },
      [1, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB[0]).toBe(1); // min(8,3) - min(2,3)
  });

  it("mirror swaps attack and defense per player", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [0, 0, 0], defense: [4, 0, 0] },
      { ...MOVE0, attack: [0, 0, 0], defense: [1, 0, 0] },
      [2, 0, 0],
      NO_NODES,
    );
    // A's effective attack = 4 (was defense), B's effective defense = 0 (was attack)
    expect(s.dmgToB[0]).toBe(4);
  });

  it("deadlock deals no damage", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [9, 0, 0] },
      MOVE0,
      [3, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([0, 0, 0]);
  });

  it("reflection splits overflow to other gates minus unused defense", () => {
    // Gate 0 Reflection: A overflow = 6. per_gate = 3 to gates 1 and 2.
    // B's unused defense at gate 1 = 2 (def 2, atk 0) -> 1 lands; gate 2 = 0 -> 3 lands.
    const s = computeGateStage(
      { ...MOVE0, attack: [6, 0, 0] },
      { ...MOVE0, defense: [0, 2, 0] },
      [4, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([0, 1, 3]);
  });

  it("fortify T1 adds 1 defense everywhere; T2 doubles", () => {
    const t1 = computeGateStage(
      { ...MOVE0, attack: [3, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0], abilityId: 5 },
      [0, 0, 0],
      NO_NODES,
    );
    expect(t1.dmgToB[0]).toBe(0); // 3 - (2+1)
    const t2 = computeGateStage(
      { ...MOVE0, attack: [5, 0, 0] },
      { ...MOVE0, defense: [2, 0, 0], abilityId: 10 },
      [0, 0, 0],
      NO_NODES,
    );
    expect(t2.dmgToB[0]).toBe(1); // 5 - (2*2)
  });

  it("siege sword overrides attack at target gate only", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [1, 1, 0], abilityId: 6, abilityTarget: 0 }, // T2 -> 10
      { ...MOVE0, defense: [3, 0, 0] },
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB).toEqual([7, 1, 0]); // gate 0 overridden to 10, gate 1 untouched
  });

  it("owning node g grants +1 defense at gate g", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [2, 0, 0] },
      { ...MOVE0, defense: [1, 0, 0] },
      [0, 0, 0],
      ["teamB", "neutral", "neutral"],
    );
    expect(s.dmgToB[0]).toBe(0); // 2 - (1+1)
  });

  it("stone cloak halves per-gate damage to caster before reflection lands", () => {
    const s = computeGateStage(
      { ...MOVE0, attack: [5, 0, 0] },
      { ...MOVE0, defense: [0, 0, 0], abilityId: 2 }, // B cloaks T1
      [0, 0, 0],
      NO_NODES,
    );
    expect(s.dmgToB[0]).toBe(2); // floor(5/2)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: FAIL — `computeGateStage` not exported.

- [ ] **Step 3: Implement**

Append to `resolution1v1.ts`. This is a straight port of Cairo lines 142–355 — keep the stage order: caps/swaps → Fortify → Siege Sword → node defense → damage/overflow/unused split → **cloak halving** → reflection distribution.

```ts
export interface GateStage {
  dmgToA: number[]; // per gate, post-cloak, post-reflection, pre-Hex
  dmgToB: number[];
  effective: {
    attackA: number[];
    defenseA: number[];
    attackB: number[];
    defenseB: number[];
  };
}

const MOD_NARROW = 1;
const MOD_MIRROR = 2;
const MOD_DEADLOCK = 3;
const MOD_REFLECT = 4;

export function computeGateStage(
  moveA: PlayerMove,
  moveB: PlayerMove,
  modifiers: [number, number, number],
  postNodeOwners: [NodeOwner, NodeOwner, NodeOwner],
): GateStage {
  const aType = abilityType(moveA.abilityId);
  const aTier = abilityTier(moveA.abilityId);
  const bType = abilityType(moveB.abilityId);
  const bTier = abilityTier(moveB.abilityId);

  const dmgToA = [0, 0, 0];
  const dmgToB = [0, 0, 0];
  const ovfToA = [0, 0, 0];
  const ovfToB = [0, 0, 0];
  // Unused defense only recorded at Normal/Narrow/Mirror gates (Cairo parity).
  const unusedDefA = [0, 0, 0];
  const unusedDefB = [0, 0, 0];
  const eff = {
    attackA: [0, 0, 0],
    defenseA: [0, 0, 0],
    attackB: [0, 0, 0],
    defenseB: [0, 0, 0],
  };

  for (let g = 0; g < 3; g++) {
    const mod = modifiers[g];
    let aa = moveA.attack[g];
    let ad = moveA.defense[g];
    let ba = moveB.attack[g];
    let bd = moveB.defense[g];

    if (mod === MOD_NARROW) {
      aa = Math.min(aa, 3);
      ad = Math.min(ad, 3);
      ba = Math.min(ba, 3);
      bd = Math.min(bd, 3);
    }
    if (mod === MOD_MIRROR) {
      [aa, ad] = [ad, aa];
      [ba, bd] = [bd, ba];
    }

    // Fortify: caster's defense at every gate. T1 +1, T2 x2.
    if (aType === 5) ad = aTier === 1 ? ad + 1 : ad * 2;
    if (bType === 5) bd = bTier === 1 ? bd + 1 : bd * 2;

    // Siege Sword: override caster's attack at the target gate.
    if (aType === 1 && g === moveA.abilityTarget) aa = aTier === 1 ? 5 : 10;
    if (bType === 1 && g === moveB.abilityTarget) ba = bTier === 1 ? 5 : 10;

    // Node defense: post-contest owner of node g gets +1 at gate g.
    if (postNodeOwners[g] === "teamA") ad += 1;
    else if (postNodeOwners[g] === "teamB") bd += 1;

    eff.attackA[g] = aa;
    eff.defenseA[g] = ad;
    eff.attackB[g] = ba;
    eff.defenseB[g] = bd;

    if (mod === MOD_DEADLOCK) {
      // no damage, no unused-defense bookkeeping (Cairo parity)
    } else if (mod === MOD_REFLECT) {
      if (aa > bd) ovfToB[g] = aa - bd;
      if (ba > ad) ovfToA[g] = ba - ad;
    } else {
      if (aa > bd) dmgToB[g] = aa - bd;
      else unusedDefB[g] = bd - aa;
      if (ba > ad) dmgToA[g] = ba - ad;
      else unusedDefA[g] = ad - ba;
    }
  }

  // Stone Cloak (either tier): halve damage and overflow aimed at caster,
  // BEFORE reflection distribution (Cairo lines 287-310).
  if (aType === 2) {
    for (let g = 0; g < 3; g++) {
      dmgToA[g] = Math.floor(dmgToA[g] / 2);
      ovfToA[g] = Math.floor(ovfToA[g] / 2);
    }
  }
  if (bType === 2) {
    for (let g = 0; g < 3; g++) {
      dmgToB[g] = Math.floor(dmgToB[g] / 2);
      ovfToB[g] = Math.floor(ovfToB[g] / 2);
    }
  }

  // Reflection distribution: half of each gate's overflow to every other
  // non-Deadlock gate, reduced by (not consuming) unused defense there.
  for (let g = 0; g < 3; g++) {
    if (ovfToB[g] > 0) {
      const per = Math.floor(ovfToB[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && modifiers[t] !== MOD_DEADLOCK && per > unusedDefB[t]) {
          dmgToB[t] += per - unusedDefB[t];
        }
      }
    }
    if (ovfToA[g] > 0) {
      const per = Math.floor(ovfToA[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && modifiers[t] !== MOD_DEADLOCK && per > unusedDefA[t]) {
          dmgToA[t] += per - unusedDefA[t];
        }
      }
    }
  }

  return { dmgToA, dmgToB, effective: eff };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: PASS (all gate-stage tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolution1v1.ts src/lib/__tests__/resolution1v1.test.ts
git commit -m "resolution engine: gate stage with modifiers, abilities, reflection

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: Full pipeline — Hex, repair, Ember, traps, win condition, events

**Files:**
- Modify: `frontend/src/lib/resolution1v1.ts`
- Test: `frontend/src/lib/__tests__/resolution1v1.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: `resolveRoundLocal(inputs: RoundInputs): RoundOutcome` — the module's public entry point. Task 5 and Task 6 call exactly this.

- [ ] **Step 1: Write the failing tests**

```ts
import { resolveRoundLocal } from "@/lib/resolution1v1";
import type { RoundInputs } from "@/lib/resolution1v1";

function baseInputs(partial: Partial<RoundInputs> = {}): RoundInputs {
  return {
    moveA: { ...MOVE0 },
    moveB: { ...MOVE0 },
    nodeOwners: ["neutral", "neutral", "neutral"],
    modifiers: [0, 0, 0],
    vaultAHp: 50,
    vaultBHp: 50,
    round: 1,
    ...partial,
  };
}

describe("resolveRoundLocal pipeline", () => {
  it("hex reduces total incoming damage (T1: 3, T2: 8, floor 0)", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [4, 4, 0] },       // 8 raw to B
      moveB: { ...MOVE0, abilityId: 9 },            // Hex T2
    }));
    expect(out.totalDamageToB).toBe(0);
    expect(out.vaultBHpAfter).toBe(50);
  });

  it("repair applies before damage and caps at 50", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultBHp: 48,
      moveA: { ...MOVE0, attack: [5, 0, 0] },
      moveB: { ...MOVE0, repair: 4 },               // 48 +4 -> capped 50, then -5
    }));
    expect(out.repairB).toBe(4);
    expect(out.vaultBHpAfter).toBe(45);
  });

  it("enemy T2 stone cloak zeroes repair; T1 does not", () => {
    const t2 = resolveRoundLocal(baseInputs({
      vaultBHp: 40,
      moveA: { ...MOVE0, abilityId: 7 },            // Stone Cloak T2
      moveB: { ...MOVE0, repair: 3 },
    }));
    expect(t2.repairB).toBe(0);
    expect(t2.vaultBHpAfter).toBe(40);
    const t1 = resolveRoundLocal(baseInputs({
      vaultBHp: 40,
      moveA: { ...MOVE0, abilityId: 2 },            // Stone Cloak T1
      moveB: { ...MOVE0, repair: 3 },
    }));
    expect(t1.repairB).toBe(3);
  });

  it("ember blast is direct vault damage after gate damage (T1: 2, T2: 6)", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, abilityId: 8 },            // Ember T2
    }));
    expect(out.emberToB).toBe(6);
    expect(out.vaultBHpAfter).toBe(44);
  });

  it("trap fires only when a trapped node changes owner, 5 dmg, post-repair", () => {
    const out = resolveRoundLocal(baseInputs({
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, traps: [1, 0, 0] },
      moveB: { ...MOVE0, nodeContest: [2, 0, 0], repair: 5 }, // B captures node 0
      vaultBHp: 30,
    }));
    expect(out.nodeOwnersAfter[0]).toBe("teamB");
    expect(out.trapDamageToB).toBe(5);
    expect(out.vaultBHpAfter).toBe(30); // 30 +5 repair -5 trap
  });

  it("vault at 0 finishes the match with the survivor as winner", () => {
    const out = resolveRoundLocal(baseInputs({
      vaultBHp: 3,
      moveA: { ...MOVE0, attack: [5, 0, 0] },
    }));
    expect(out.vaultBHpAfter).toBe(0);
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(1);
    expect(out.events.at(-1)).toEqual({ kind: "match_finished", winnerTeam: 1 });
  });

  it("round 10 finishes by HP comparison", () => {
    const out = resolveRoundLocal(baseInputs({ round: 10, vaultAHp: 20, vaultBHp: 30 }));
    expect(out.finished).toBe(true);
    expect(out.winnerTeam).toBe(2);
  });

  it("events are ordered: captures, clashes, repair, damage, ember, traps", () => {
    const out = resolveRoundLocal(baseInputs({
      nodeOwners: ["teamA", "neutral", "neutral"],
      moveA: { ...MOVE0, attack: [4, 0, 0], traps: [1, 0, 0], abilityId: 3 },
      moveB: { ...MOVE0, nodeContest: [2, 0, 0], repair: 2 },
    }));
    const kinds = out.events.map((e) => e.kind);
    expect(kinds).toEqual([
      "node_captured",
      "troops_clash",
      "vault_repaired",
      "vault_damaged",
      "ember_blast",
      "trap_detonated",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: FAIL — `resolveRoundLocal` not exported.

- [ ] **Step 3: Implement**

```ts
export function resolveRoundLocal(inputs: RoundInputs): RoundOutcome {
  const { moveA, moveB, modifiers, round } = inputs;
  const events: RoundEvent[] = [];

  // 1. Node contests (before gate math — captured node defends same round).
  const contests = resolveNodeContests(moveA.nodeContest, moveB.nodeContest, inputs.nodeOwners);
  for (const c of contests.captures) {
    events.push({ kind: "node_captured", node: c.node, from: c.from, to: c.to });
  }

  // 2. Gate stage (modifiers, Fortify, Siege Sword, node defense, cloak, reflection).
  const stage = computeGateStage(moveA, moveB, modifiers, contests.owners);
  for (let g = 0; g < 3; g++) {
    if (stage.dmgToA[g] > 0 || stage.dmgToB[g] > 0) {
      events.push({ kind: "troops_clash", gate: g, dmgToA: stage.dmgToA[g], dmgToB: stage.dmgToB[g] });
    }
  }

  // 3. Hex: reduce total incoming gate damage.
  const aType = abilityType(moveA.abilityId);
  const aTier = abilityTier(moveA.abilityId);
  const bType = abilityType(moveB.abilityId);
  const bTier = abilityTier(moveB.abilityId);

  let totalToA = stage.dmgToA[0] + stage.dmgToA[1] + stage.dmgToA[2];
  let totalToB = stage.dmgToB[0] + stage.dmgToB[1] + stage.dmgToB[2];
  if (aType === 4) totalToA = Math.max(0, totalToA - (aTier === 1 ? 3 : 8));
  if (bType === 4) totalToB = Math.max(0, totalToB - (bTier === 1 ? 3 : 8));

  // 4. Repair (enemy T2 cloak negates), capped at 50, BEFORE damage.
  const repairA = bType === 2 && bTier === 2 ? 0 : moveA.repair;
  const repairB = aType === 2 && aTier === 2 ? 0 : moveB.repair;
  let hpA = inputs.vaultAHp;
  let hpB = inputs.vaultBHp;
  hpA = Math.min(50, hpA + repairA);
  hpB = Math.min(50, hpB + repairB);
  if (repairA > 0) events.push({ kind: "vault_repaired", side: "a", amount: repairA });
  if (repairB > 0) events.push({ kind: "vault_repaired", side: "b", amount: repairB });

  // 5. Gate damage (dmg >= hp -> 0, Cairo comparison).
  hpA = totalToA >= hpA ? 0 : hpA - totalToA;
  hpB = totalToB >= hpB ? 0 : hpB - totalToB;
  if (totalToA > 0) events.push({ kind: "vault_damaged", side: "a", amount: totalToA });
  if (totalToB > 0) events.push({ kind: "vault_damaged", side: "b", amount: totalToB });

  // 6. Ember Blast: direct vault damage after gate damage (hp > dmg comparison).
  let emberToA = 0;
  let emberToB = 0;
  if (aType === 3) {
    emberToB = aTier === 1 ? 2 : 6;
    hpB = hpB > emberToB ? hpB - emberToB : 0;
    events.push({ kind: "ember_blast", side: "b", amount: emberToB });
  }
  if (bType === 3) {
    emberToA = bTier === 1 ? 2 : 6;
    hpA = hpA > emberToA ? hpA - emberToA : 0;
    events.push({ kind: "ember_blast", side: "a", amount: emberToA });
  }

  // 7. Traps: node changed owner + previous owner armed a trap -> flat 5,
  // applied post-repair (unhealable).
  let trapToA = 0;
  let trapToB = 0;
  for (const c of contests.captures) {
    if (c.from === "teamA" && moveA.traps[c.node] === 1) {
      trapToB += 5;
      events.push({ kind: "trap_detonated", node: c.node, victim: "b", amount: 5 });
    }
    if (c.from === "teamB" && moveB.traps[c.node] === 1) {
      trapToA += 5;
      events.push({ kind: "trap_detonated", node: c.node, victim: "a", amount: 5 });
    }
  }
  hpA = trapToA >= hpA ? 0 : hpA - trapToA;
  hpB = trapToB >= hpB ? 0 : hpB - trapToB;

  // 8. Win condition.
  let finished = false;
  let winnerTeam: 0 | 1 | 2 | null = null;
  if (hpA === 0 || hpB === 0) {
    finished = true;
    winnerTeam = hpB === 0 && hpA > 0 ? 1 : hpA === 0 && hpB > 0 ? 2 : 0;
  } else if (round >= 10) {
    finished = true;
    winnerTeam = hpA > hpB ? 1 : hpB > hpA ? 2 : 0;
  }
  if (finished && winnerTeam !== null) {
    events.push({ kind: "match_finished", winnerTeam });
  }

  const gates = [0, 1, 2].map((g) => ({
    gate: g,
    modifier: modifiers[g],
    attackA: stage.effective.attackA[g],
    defenseA: stage.effective.defenseA[g],
    attackB: stage.effective.attackB[g],
    defenseB: stage.effective.defenseB[g],
    dmgToA: stage.dmgToA[g],
    dmgToB: stage.dmgToB[g],
  })) as [GateOutcome, GateOutcome, GateOutcome];

  return {
    nodeOwnersAfter: contests.owners,
    nodeCaptures: contests.captures,
    gates,
    totalDamageToA: totalToA,
    totalDamageToB: totalToB,
    repairA,
    repairB,
    emberToA,
    emberToB,
    trapDamageToA: trapToA,
    trapDamageToB: trapToB,
    vaultAHpAfter: hpA,
    vaultBHpAfter: hpB,
    finished,
    winnerTeam,
    nextModifiersKnown: false,
    events,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolution1v1.ts src/lib/__tests__/resolution1v1.test.ts
git commit -m "resolution engine: full pipeline with events and win condition

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 4: Cairo-derived test vectors

**Files:**
- Test: `frontend/src/lib/__tests__/resolution1v1.test.ts` (new describe block)
- Read-only reference: `/Users/modeofo/Apps/siege/src/tests/test_resolution_1v1.cairo`, `test_modifiers_1v1.cairo`, `test_ability_tiers.cairo`, `test_abilities_1v1.cairo` (find trap tests with `grep -rn "trap" src/tests/`)

**Interfaces:**
- Consumes: `resolveRoundLocal` from Task 3.
- Produces: nothing new — this task is the correctness anchor for the whole feature.

- [ ] **Step 1: Extract vectors from the Cairo tests**

Read each named Cairo test file. For every test that drives `resolve_round` with two revealed moves and asserts resulting HP / node ownership, transcribe: both moves, starting HP, modifiers, expected HP after / node owners after / winner. Target **~20 vectors, minimum 12**, covering: plain damage, narrow pass, mirror, deadlock, reflection with unused defense, each of the 5 abilities at both tiers where a Cairo test exists, trap trigger, trap non-trigger (node held), and a win-by-zero.

Format each as one `it(...)` with a comment naming the source Cairo test:

```ts
describe("Cairo-derived vectors", () => {
  // src/tests/test_resolution_1v1.cairo::test_basic_damage_1v1
  it("matches test_basic_damage_1v1", () => {
    const out = resolveRoundLocal(baseInputs({
      moveA: { ...MOVE0, attack: [5, 3, 0], defense: [1, 0, 0] },
      moveB: { ...MOVE0, attack: [2, 0, 0], defense: [2, 1, 0] },
    }));
    expect(out.vaultBHpAfter).toBe(45); // copy the exact expected value from the Cairo assert
    expect(out.vaultAHpAfter).toBe(49);
  });
  // ... 11+ more
});
```

The expected values MUST be copied from the Cairo test asserts, not computed by running the TS engine — the whole point is independent confirmation. If a Cairo test's expected value disagrees with the engine, the engine is wrong: fix the engine, never the vector.

- [ ] **Step 2: Run to verify all vectors pass**

Run: `bunx vitest run src/lib/__tests__/resolution1v1.test.ts`
Expected: PASS. Any failure = engine bug; fix the engine stage that diverges, re-run.

- [ ] **Step 3: Full frontend gates**

Run: `bun run test` (expect: only the pre-existing stakedMatch.test.ts suite failure), `bunx tsc --noEmit`, `bun run lint` (10 pre-existing problems, zero new).

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/resolution1v1.test.ts
git commit -m "resolution engine: Cairo-derived test vectors

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 5: Round history uses the engine

**Files:**
- Modify: `frontend/src/lib/gameState1v1.ts` (delete `computeGateBreakdown` at lines ~115–212; rewire `useRoundHistory1v1` at ~360–410)
- Test: existing suites must stay green

**Interfaces:**
- Consumes: `resolveRoundLocal` — history rows feed it per-round moves and modifiers.
- Produces: `RoundResult1v1` unchanged in shape (the match page and spectate page consume it as-is).

- [ ] **Step 1: Rewire `useRoundHistory1v1`**

Inside the `.map((n): RoundResult1v1 => {...})` in `useRoundHistory1v1`, replace the `computeGateBreakdown(...)` call with the engine:

```ts
const outcome = resolveRoundLocal({
  moveA: {
    attack: aAtk as [number, number, number],
    defense: aDef as [number, number, number],
    repair: safeNum(n.a_repair),
    nodeContest: [safeNum(n.a_nc0), safeNum(n.a_nc1), safeNum(n.a_nc2)],
    traps: aTraps,
    abilityId: aAbilityId,
    abilityTarget: aAbilityTarget,
  },
  moveB: {
    attack: bAtk as [number, number, number],
    defense: bDef as [number, number, number],
    repair: safeNum(n.b_repair),
    nodeContest: [safeNum(n.b_nc0), safeNum(n.b_nc1), safeNum(n.b_nc2)],
    traps: bTraps,
    abilityId: bAbilityId,
    abilityTarget: bAbilityTarget,
  },
  nodeOwners: ["neutral", "neutral", "neutral"], // see limitation note below
  modifiers: mods,
  vaultAHp: 50,
  vaultBHp: 50,
  round: safeNum(n.round),
});
```

(`safeNum` is the numeric coercion helper already used throughout `gameState1v1.ts`; the `aAtk`/`bAtk`/`aTraps`/`bTraps`/ability locals already exist in that map body — read it and reuse them rather than re-deriving.)

```ts
const gateBreakdown = outcome.gates.map((g) => ({
  gate: g.gate, modifier: g.modifier,
  attackA: g.attackA, defenseA: g.defenseA,
  attackB: g.attackB, defenseB: g.defenseB,
  dmgToA: g.dmgToA, dmgToB: g.dmgToB,
}));
const damageToA = outcome.totalDamageToA;
const damageToB = outcome.totalDamageToB;
```

Adapt local variable names to what actually exists in that map body (read it first — `aAtk`/`aDef`/`mods`/`aTraps` etc. are already built there; reuse them). Delete the now-unused `computeGateBreakdown` function entirely.

**Documented limitation (add as a comment):** historical rows don't know each past round's pre-round node ownership, so history passes neutral nodes — same behavior as the old code (node defense was never reflected in history), now explicit. Per-round HP display in history remains driven by the `RoundResolved` data as today; the engine here only supplies the per-gate breakdown.

- [ ] **Step 2: Verify gates**

Run: `bunx vitest run src/lib/__tests__` then `bunx tsc --noEmit`, `bun run lint`, `bun run build`.
Expected: all green at baseline; no references to `computeGateBreakdown` remain (`grep -rn computeGateBreakdown src/` → empty).

- [ ] **Step 3: Commit**

```bash
git add src/lib/gameState1v1.ts
git commit -m "round history: derive gate breakdown from resolution engine

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 6: Optimistic trigger + reconcile in the match page

**Files:**
- Modify: `frontend/src/lib/gameState1v1.ts` (new hook `useRevealedMoves1v1`)
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

**Interfaces:**
- Consumes: `resolveRoundLocal`, `RoundOutcome`; existing hooks `useMatchState1v1` (already subscribes to `RoundMoves1v1`, `RoundTraps1v1`, `RoundModifiers1v1` — see the entity query at gameState1v1.ts ~line 230), `useRoundModifiers1v1`.
- Produces: `useRevealedMoves1v1(matchId, round): { moveA: PlayerMove; moveB: PlayerMove } | null` — returns both moves only when `reveal_count === 2` for that round, else null.

- [ ] **Step 1: Add `useRevealedMoves1v1` to gameState1v1.ts**

Pure `useMemo` over the already-subscribed model stores — no effects, no state, no new subscription (the entity query in `useMatchState1v1` already includes `RoundMoves1v1` and `RoundTraps1v1`):

```ts
export function useRevealedMoves1v1(
  matchId: string | null,
  round: number,
): { moveA: PlayerMove; moveB: PlayerMove } | null {
  const roundMoves = useModels(ModelsMapping.RoundMoves1v1);
  const roundTraps = useModels(ModelsMapping.RoundTraps1v1);

  return useMemo(() => {
    if (!matchId || round < 1) return null;
    const idBig = BigInt(matchId);
    const rm = flatModels<RoundMoves1v1Model>(roundMoves).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    if (!rm || safeNum(rm.reveal_count) < 2) return null;
    const rt = flatModels<RoundTraps1v1Model>(roundTraps).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    const traps = (side: "a" | "b"): [number, number, number] =>
      rt
        ? [safeNum(rt[`${side}_trap0`]), safeNum(rt[`${side}_trap1`]), safeNum(rt[`${side}_trap2`])]
        : [0, 0, 0];
    const move = (s: "a" | "b"): PlayerMove => ({
      attack: [safeNum(rm[`${s}_p0`]), safeNum(rm[`${s}_p1`]), safeNum(rm[`${s}_p2`])],
      defense: [safeNum(rm[`${s}_g0`]), safeNum(rm[`${s}_g1`]), safeNum(rm[`${s}_g2`])],
      repair: safeNum(rm[`${s}_repair`]),
      nodeContest: [safeNum(rm[`${s}_nc0`]), safeNum(rm[`${s}_nc1`]), safeNum(rm[`${s}_nc2`])],
      traps: traps(s),
      abilityId: safeNum(rm[`${s}_ability_id`]),
      abilityTarget: safeNum(rm[`${s}_ability_target`]),
    });
    return { moveA: move("a"), moveB: move("b") };
  }, [matchId, round, roundMoves, roundTraps]);
}
```

Import `RoundTraps1v1` model type from the generated bindings the same way `RoundMoves1v1Model` is imported at the top of the file. If the template-literal indexing fights the generated types, index via `(rm as Record<string, unknown>)[...]` inside `safeNum` — do not weaken the exported signature.

- [ ] **Step 2: Compute the optimistic outcome in page.tsx**

Derived value, no new effects:

```ts
const revealedMoves = useRevealedMoves1v1(matchId, state?.round ?? 0);
const optimisticOutcome = useMemo(() => {
  if (!revealedMoves || !state || state.phase !== "resolving") return null;
  return resolveRoundLocal({
    moveA: revealedMoves.moveA,
    moveB: revealedMoves.moveB,
    nodeOwners: state.nodes,
    modifiers: modifiers ?? [0, 0, 0],
    vaultAHp: state.vaultAHp,
    vaultBHp: state.vaultBHp,
    round: state.round,
  });
}, [revealedMoves, state, modifiers]);
```

`state.phase === "resolving"` is already derived from `reveal_count >= 2` (gameState1v1.ts ~line 281), so this fires the moment reveal #2 indexes — before the resolve transaction even submits.

- [ ] **Step 3: Show the outcome immediately**

While `state.phase === "resolving"` and `optimisticOutcome` exists, replace the dead "Resolving round..." panel with the round outcome: reuse the existing result-display path by feeding `optimisticOutcome` into the same UI that `pendingResult` drives (BattleAnimation + HP bars via `heldHp`). Concretely:

- Extend the `pendingResult`/`heldHp` state to accept an optimistic source: when `optimisticOutcome` is non-null and no chain result for this round is in `history` yet, render `BattleAnimation` from the optimistic data (map `RoundOutcome.gates` → the `GateDamage[]` shape and totals that `BattleAnimation` already takes; pass current `state.vaultAHp/state.vaultBHp` as the pre-damage HP and `outcome.vaultAHpAfter/BHpAfter` as targets).
- Show a subtle "confirming on-chain…" pill while the chain resolve is still pending, which disappears on reconcile.
- Keep the auto-resolve effect exactly as-is (it still submits the real transaction).

- [ ] **Step 4: Reconcile**

The existing round-transition effect (page.tsx ~line 260) already fires when `state.round` advances (chain resolve indexed). Extend it: if an optimistic outcome was shown for the round that just resolved, compare `outcome.vaultAHpAfter/vaultBHpAfter` and `nodeOwnersAfter` against the chain values now in `state`; on mismatch `console.error("[optimistic-resolve] mismatch", {...local, ...chain})` and let the chain values render (they already do — state is chain-derived). No user-facing error; chain truth simply replaces the display.

- [ ] **Step 5: Verify gates**

Run: `bun run lint` (baseline only), `bunx tsc --noEmit`, `bun run test` (baseline only), `bun run build`.
Expected: all green. Watch specifically for `react-hooks/set-state-in-effect` — steps 2–3 must stay derived-value-based.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gameState1v1.ts "src/app/match-1v1/[id]/page.tsx"
git commit -m "match page: optimistic round outcome the moment both reveals index

Co-authored-by: Claude <noreply@anthropic.com>"
```
