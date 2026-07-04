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
