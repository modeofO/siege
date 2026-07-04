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
