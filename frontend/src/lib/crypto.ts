import { hash } from "starknet";

/**
 * Generate a random salt for commit-reveal
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(31); // 31 bytes to stay within felt252
  crypto.getRandomValues(bytes);
  const hex =
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return hex;
}

/**
 * Compute Poseidon hash commitment for attacker move
 */
export function computeAttackerCommitment(
  salt: string,
  p0: number,
  p1: number,
  p2: number,
  nc0: number,
  nc1: number,
  nc2: number,
): string {
  return hash.computePoseidonHashOnElements([
    salt,
    p0.toString(),
    p1.toString(),
    p2.toString(),
    nc0.toString(),
    nc1.toString(),
    nc2.toString(),
  ]);
}

/**
 * Compute Poseidon hash commitment for defender move
 */
export function computeDefenderCommitment(
  salt: string,
  p0: number,
  p1: number,
  p2: number,
  repair: number,
  nc0: number,
  nc1: number,
  nc2: number,
): string {
  return hash.computePoseidonHashOnElements([
    salt,
    p0.toString(),
    p1.toString(),
    p2.toString(),
    repair.toString(),
    nc0.toString(),
    nc1.toString(),
    nc2.toString(),
  ]);
}

/**
 * Store salt in localStorage for later reveal
 */
export function storeSalt(matchId: string, round: number, salt: string) {
  const key = `siege_salt_${matchId}_${round}`;
  localStorage.setItem(key, salt);
}

/**
 * Retrieve salt from localStorage
 */
export function getSalt(matchId: string, round: number): string | null {
  const key = `siege_salt_${matchId}_${round}`;
  return localStorage.getItem(key);
}

/**
 * Store move allocations for reveal phase
 */
export function storeMove(matchId: string, round: number, move: number[]) {
  const key = `siege_move_${matchId}_${round}`;
  localStorage.setItem(key, JSON.stringify(move));
}

/**
 * Retrieve stored move
 */
export function getMove(matchId: string, round: number): number[] | null {
  const key = `siege_move_${matchId}_${round}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Compute Poseidon hash commitment for 1v1 move (all allocations in one hash)
 */
export function computeCommitment1v1(
  salt: string,
  p0: number,
  p1: number,
  p2: number,
  g0: number,
  g1: number,
  g2: number,
  repair: number,
  nc0: number,
  nc1: number,
  nc2: number,
  trap0: number,
  trap1: number,
  trap2: number,
  abilityId: number,
  abilityTarget: number,
): string {
  return hash.computePoseidonHashOnElements([
    salt,
    p0.toString(),
    p1.toString(),
    p2.toString(),
    g0.toString(),
    g1.toString(),
    g2.toString(),
    repair.toString(),
    nc0.toString(),
    nc1.toString(),
    nc2.toString(),
    trap0.toString(),
    trap1.toString(),
    trap2.toString(),
    abilityId.toString(),
    abilityTarget.toString(),
  ]);
}

/**
 * Store 1v1 move allocations for auto-reveal
 */
export function storeMove1v1(matchId: string, round: number, move: number[]) {
  const key = `siege_1v1_move_${matchId}_${round}`;
  localStorage.setItem(key, JSON.stringify(move));
}

/**
 * Retrieve stored 1v1 move
 */
export function getMove1v1(matchId: string, round: number): number[] | null {
  const key = `siege_1v1_move_${matchId}_${round}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Store salt for 1v1 move
 */
export function storeSalt1v1(matchId: string, round: number, salt: string) {
  const key = `siege_1v1_salt_${matchId}_${round}`;
  localStorage.setItem(key, salt);
}

/**
 * Retrieve stored 1v1 salt
 */
export function getSalt1v1(matchId: string, round: number): string | null {
  const key = `siege_1v1_salt_${matchId}_${round}`;
  return localStorage.getItem(key);
}
