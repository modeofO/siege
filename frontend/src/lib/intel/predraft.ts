import { computeBudget, type NodeOwner } from "@/lib/gameState1v1";

export interface PreDraft {
  allocations: number[];
  forRound: number;
}

// Keeps the `siege_1v1_*` localStorage naming family (see lib/crypto.ts).
const KEY_PREFIX = "siege_intel_predraft_";

function keyFor(matchId: string, forRound: number): string {
  return `${KEY_PREFIX}${matchId}_${forRound}`;
}

// SSR-safe accessor: on the server `window` is undefined, so callers no-op.
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Persist a scratchpad allocation for a specific match + round. */
export function savePreDraft(
  matchId: string,
  forRound: number,
  allocations: number[],
): void {
  const store = storage();
  if (!store) return;
  const payload: PreDraft = { allocations, forRound };
  try {
    store.setItem(keyFor(matchId, forRound), JSON.stringify(payload));
  } catch {
    // localStorage may be full or unavailable; a lost scratchpad is harmless.
  }
}

/** Load the scratchpad for a match + round, or null if absent/malformed. */
export function loadPreDraft(matchId: string, forRound: number): PreDraft | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(keyFor(matchId, forRound));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PreDraft;
    if (!Array.isArray(parsed.allocations)) return null;
    return { allocations: parsed.allocations, forRound: parsed.forRound };
  } catch {
    return null;
  }
}

/** Remove every stored round for this match (leaves other matches untouched). */
export function clearPreDraft(matchId: string): void {
  const store = storage();
  if (!store) return;
  const matchPrefix = `${KEY_PREFIX}${matchId}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(matchPrefix)) toRemove.push(k);
  }
  for (const k of toRemove) store.removeItem(k);
}

/** Budget the opponent-facing form should assume for `forRound`. */
export function projectedBudget(
  nodes: NodeOwner[],
  team: "teamA" | "teamB",
  forRound: number,
): number {
  return computeBudget(nodes, team, forRound);
}
