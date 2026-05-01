/**
 * Poseidon hashing for Siege commit/reveal. Matches the Cairo contract's
 * `PoseidonTrait::new().update(...)*.finalize()` chain exactly.
 */

import { hash } from "starknet";
import { randomBytes } from "node:crypto";

export interface MoveAllocation1v1 {
  attack: [number, number, number];
  defense: [number, number, number];
  repair: number;
  nodes: [number, number, number];
  traps: [number, number, number];
  abilityId: number;
  abilityTarget: number;
}

/** Random felt252-compatible salt (251 bits). */
export function generateSalt(): string {
  const raw = BigInt(`0x${randomBytes(32).toString("hex")}`);
  return `0x${BigInt.asUintN(251, raw).toString(16)}`;
}

/**
 * Poseidon hash of:
 *   salt, p0..p2, g0..g2, repair, nc0..nc2, trap0..trap2, ability_id, ability_target
 */
export function buildMoveCommitHash1v1(salt: string, move: MoveAllocation1v1): string {
  const elements = [
    BigInt(salt),
    BigInt(move.attack[0]),
    BigInt(move.attack[1]),
    BigInt(move.attack[2]),
    BigInt(move.defense[0]),
    BigInt(move.defense[1]),
    BigInt(move.defense[2]),
    BigInt(move.repair),
    BigInt(move.nodes[0]),
    BigInt(move.nodes[1]),
    BigInt(move.nodes[2]),
    BigInt(move.traps[0]),
    BigInt(move.traps[1]),
    BigInt(move.traps[2]),
    BigInt(move.abilityId),
    BigInt(move.abilityTarget),
  ];
  return hash.computePoseidonHashOnElements(elements);
}

/** Calldata for `commit_reveal_1v1.reveal(match_id, salt, ...move)`. */
export function revealCalldata(matchId: number, salt: string, move: MoveAllocation1v1): string[] {
  return [
    String(matchId),
    salt,
    String(move.attack[0]),
    String(move.attack[1]),
    String(move.attack[2]),
    String(move.defense[0]),
    String(move.defense[1]),
    String(move.defense[2]),
    String(move.repair),
    String(move.nodes[0]),
    String(move.nodes[1]),
    String(move.nodes[2]),
    String(move.traps[0]),
    String(move.traps[1]),
    String(move.traps[2]),
    String(move.abilityId),
    String(move.abilityTarget),
  ];
}
