import { resolveRoundLocal } from "@/lib/resolution1v1";
import type { NodeOwner } from "@/lib/gameState1v1";
import type { HistoricalRound, ReplayedMatch, ReplayedRound } from "./types";

/**
 * Replays a finished match round-by-round through the Cairo-pinned engine to
 * recover the OPPONENT's per-round context (their HP entering each round and
 * their node count), normalized so `move` is always the opponent's move
 * regardless of which slot they held.
 */
export function replayMatch(
  matchId: string,
  rounds: HistoricalRound[], // ascending round order, revealed only
  opponentIsA: boolean,
): ReplayedMatch {
  let hpA = 50;
  let hpB = 50;
  let nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  const out: ReplayedRound[] = [];
  let winnerTeam: 0 | 1 | 2 | null = null;

  const oppTeam: NodeOwner = opponentIsA ? "teamA" : "teamB";

  for (const r of rounds) {
    out.push({
      round: r.round,
      move: opponentIsA ? r.moveA : r.moveB,
      hpBefore: opponentIsA ? hpA : hpB,
      nodesBefore: nodes.filter((n) => n === oppTeam).length,
    });
    const res = resolveRoundLocal({
      moveA: r.moveA,
      moveB: r.moveB,
      nodeOwners: nodes,
      modifiers: r.modifiers,
      vaultAHp: hpA,
      vaultBHp: hpB,
      round: r.round,
    });
    hpA = res.vaultAHpAfter;
    hpB = res.vaultBHpAfter;
    nodes = res.nodeOwnersAfter;
    if (res.finished) {
      winnerTeam = res.winnerTeam;
      break;
    }
  }

  // Truth table: winner 1 & opponentIsA -> true; winner 2 & !opponentIsA ->
  // true; winner 0 or null (draw / unfinished) -> null; otherwise a loss.
  const opponentWon =
    winnerTeam === null || winnerTeam === 0 ? null : (winnerTeam === 1) === opponentIsA;

  return { matchId, rounds: out, opponentWon };
}
