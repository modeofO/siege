import type { PlayerMove } from "@/lib/resolution1v1";

export interface HistoricalRound {
  round: number;
  moveA: PlayerMove;
  moveB: PlayerMove;
  modifiers: [number, number, number];
}

export interface ReplayedRound {
  round: number;
  /** The OPPONENT's move this round (side-normalized by replayMatch). */
  move: PlayerMove;
  /** Opponent's vault HP entering the round. */
  hpBefore: number;
  /** Opponent's owned-node count entering the round (drives budget). */
  nodesBefore: number;
}

export interface ReplayedMatch {
  matchId: string;
  rounds: ReplayedRound[];
  opponentWon: boolean | null; // null = draw/unfinished-at-10
}
