import { hash } from "starknet";
import { NETWORK } from "./network";

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

// ---------- Commit-reveal local storage ----------
//
// Keys are namespaced by network. Match ids are sequential per world and every
// network shares the same world address (same `siege_dojo_v9` seed), so ids
// collide 1:1 across chains. Without the namespace, playing match #14 on the
// test chain would overwrite the salt for mainnet match #14 — and losing a salt
// means being unable to reveal, which loses the match with real escrow on it.
//
// Losing these entries is not recoverable from chain state: the commitment is a
// Poseidon hash, so the salt exists nowhere else. Treat this module as
// safety-critical.

type CommitKind = "salt" | "move" | "ability";

function key(kind: CommitKind, matchId: string, round: number): string {
  return `siege_1v1_${kind}_${NETWORK}_${matchId}_${round}`;
}

// Un-namespaced key used before per-network namespacing shipped. Read as a
// fallback so a match committed under the old scheme can still reveal; never
// written. Removable once no match predating the change can still be live —
// matches end by round 10 or via force_timeout's 300s deadlines.
function legacyKey(kind: CommitKind, matchId: string, round: number): string {
  return `siege_1v1_${kind}_${matchId}_${round}`;
}

function read(kind: CommitKind, matchId: string, round: number): string | null {
  return (
    localStorage.getItem(key(kind, matchId, round)) ??
    localStorage.getItem(legacyKey(kind, matchId, round))
  );
}

/**
 * Store 1v1 move allocations for auto-reveal
 */
export function storeMove1v1(matchId: string, round: number, move: number[]) {
  localStorage.setItem(key("move", matchId, round), JSON.stringify(move));
}

/**
 * Retrieve stored 1v1 move
 */
export function getMove1v1(matchId: string, round: number): number[] | null {
  const data = read("move", matchId, round);
  return data ? JSON.parse(data) : null;
}

/**
 * Store salt for 1v1 move
 */
export function storeSalt1v1(matchId: string, round: number, salt: string) {
  localStorage.setItem(key("salt", matchId, round), salt);
}

/**
 * Retrieve stored 1v1 salt
 */
export function getSalt1v1(matchId: string, round: number): string | null {
  return read("salt", matchId, round);
}

export type StoredAbility1v1 = { abilityId: number; abilityTarget: number };

/**
 * Store the ability chosen alongside a commit, for auto-reveal
 */
export function storeAbility1v1(matchId: string, round: number, ability: StoredAbility1v1) {
  localStorage.setItem(key("ability", matchId, round), JSON.stringify(ability));
}

/**
 * Retrieve the stored ability, defaulting to "no ability" when absent
 */
export function getAbility1v1(matchId: string, round: number): StoredAbility1v1 {
  const data = read("ability", matchId, round);
  return data ? JSON.parse(data) : { abilityId: 0, abilityTarget: 0 };
}

/**
 * Clear stored commit data after a successful reveal
 */
export function clearCommitData1v1(matchId: string, round: number) {
  for (const kind of ["salt", "move", "ability"] as const) {
    localStorage.removeItem(key(kind, matchId, round));
    localStorage.removeItem(legacyKey(kind, matchId, round));
  }
}
