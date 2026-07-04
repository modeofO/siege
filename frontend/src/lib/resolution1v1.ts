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

// Public entry point — mirrors resolution_1v1.cairo resolve_round (lines 357-537).
// Pipeline order is load-bearing: node contests -> gate stage -> Hex on totals ->
// repair (enemy T2 cloak negation, cap 50) -> gate damage -> Ember -> traps -> win.
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
