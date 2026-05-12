import { useEffect, useState, useCallback } from "react";
import { toriiSql, sqlInt } from "./toriiSql";

export interface MatchState {
  matchId: string;
  round: number;
  phase: "committing" | "revealing" | "resolving" | "finished";
  team1Vault: number;
  team2Vault: number;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  team1Budget: number;
  team2Budget: number;
  winner: number | null;
}

export type NodeOwner = "neutral" | "team1" | "team2";

export interface RoundResult {
  round: number;
  team1Attack: number[] | null;
  team1Defense: number[] | null;
  team2Attack: number[] | null;
  team2Defense: number[] | null;
  damageToTeam1: number;
  damageToTeam2: number;
}

const POLL_INTERVAL = 4000;

type MatchStateRow = {
  match_id: number | string;
  team_a_attacker: string;
  team_a_defender: string;
  team_b_attacker: string;
  team_b_defender: string;
  vault_a_hp: number | string;
  vault_b_hp: number | string;
  current_round: number | string;
  status: string;
};

type NodeStateRow = {
  node_index: number | string;
  owner: string;
};

type RoundMovesRow = {
  round: number | string;
  commit_count: number | string;
  reveal_count: number | string;
  atk_a_p0: number | string;
  atk_a_p1: number | string;
  atk_a_p2: number | string;
  atk_b_p0: number | string;
  atk_b_p1: number | string;
  atk_b_p2: number | string;
  def_a_g0: number | string;
  def_a_g1: number | string;
  def_a_g2: number | string;
  def_b_g0: number | string;
  def_b_g1: number | string;
  def_b_g2: number | string;
  def_a_repair: number | string;
  def_b_repair: number | string;
};

export function toNum(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function parseMatchId(matchId: string): number | null {
  const parsed = Number(matchId);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function ownerToNode(owner: string): NodeOwner {
  if (owner === "TeamA") return "team1";
  if (owner === "TeamB") return "team2";
  return "neutral";
}

export function computeBudget(nodes: NodeOwner[], team: "team1" | "team2"): number {
  const bonus = nodes.filter((owner) => owner === team).length;
  return 10 + bonus;
}

export function computeDamage(
  atk0: number,
  atk1: number,
  atk2: number,
  def0: number,
  def1: number,
  def2: number,
): number {
  return Math.max(0, atk0 - def0) + Math.max(0, atk1 - def1) + Math.max(0, atk2 - def2);
}

async function fetchMatchState(matchId: string): Promise<MatchState | null> {
  const id = parseMatchId(matchId);
  if (id == null) return null;

  const matchRows = await toriiSql<MatchStateRow>(
    `SELECT match_id, vault_a_hp, vault_b_hp, current_round, status FROM "siege_dojo-MatchState" WHERE match_id = ${sqlInt(id)}`,
  );
  const matchRow = matchRows[0];
  if (!matchRow) return null;

  const round = toNum(matchRow.current_round);
  const team1Vault = toNum(matchRow.vault_a_hp);
  const team2Vault = toNum(matchRow.vault_b_hp);

  const nodeRows = await toriiSql<NodeStateRow>(
    `SELECT node_index, owner FROM "siege_dojo-NodeState" WHERE match_id = ${sqlInt(id)}`,
  );
  const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  for (const row of nodeRows) {
    const idx = toNum(row.node_index);
    if (idx >= 0 && idx < 3) {
      nodes[idx] = ownerToNode(String(row.owner));
    }
  }

  const team1Budget = computeBudget(nodes, "team1");
  const team2Budget = computeBudget(nodes, "team2");

  let phase: MatchState["phase"] = "committing";
  if (String(matchRow.status) === "Finished") {
    phase = "finished";
  } else {
    const roundRows = await toriiSql<{ commit_count: number; reveal_count: number }>(
      `SELECT commit_count, reveal_count FROM "siege_dojo-RoundMoves" WHERE match_id = ${sqlInt(id)} AND round = ${sqlInt(round)}`,
    );
    const roundRow = roundRows[0];
    if (roundRow) {
      const commitCount = toNum(roundRow.commit_count);
      const revealCount = toNum(roundRow.reveal_count);
      if (commitCount >= 4) {
        phase = revealCount >= 4 ? "resolving" : "revealing";
      }
    }
  }

  let winner: number | null = null;
  if (String(matchRow.status) === "Finished") {
    if (team1Vault === 0 && team2Vault > 0) winner = 2;
    if (team2Vault === 0 && team1Vault > 0) winner = 1;
  }

  return {
    matchId: String(matchRow.match_id),
    round,
    phase,
    team1Vault,
    team2Vault,
    nodes,
    team1Budget,
    team2Budget,
    winner,
  };
}

export function useMatchState(matchId: string | null) {
  const [state, setState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    const s = await fetchMatchState(matchId);
    setState(s);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      void refresh();
    }, 0);
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [refresh]);

  return { state, loading, refresh };
}

export interface MatchPlayers {
  teamAAttacker: string;
  teamADefender: string;
  teamBAttacker: string;
  teamBDefender: string;
}

export function useMatchPlayers(matchId: string | null): MatchPlayers | null {
  const [players, setPlayers] = useState<MatchPlayers | null>(null);

  useEffect(() => {
    if (!matchId) return;

    const id = parseMatchId(matchId);
    if (id == null) {
      return;
    }

    const fetchPlayers = async () => {
      const rows = await toriiSql<MatchStateRow>(
        `SELECT team_a_attacker, team_a_defender, team_b_attacker, team_b_defender FROM "siege_dojo-MatchState" WHERE match_id = ${sqlInt(id)}`,
      );
      const row = rows[0];
      if (!row) return;

      setPlayers({
        teamAAttacker: row.team_a_attacker,
        teamADefender: row.team_a_defender,
        teamBAttacker: row.team_b_attacker,
        teamBDefender: row.team_b_defender,
      });
    };

    const initTimer = setTimeout(() => {
      void fetchPlayers();
    }, 0);
    const interval = setInterval(() => {
      void fetchPlayers();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [matchId]);

  return players;
}

export function useRoundHistory(matchId: string | null) {
  const [history, setHistory] = useState<RoundResult[]>([]);

  useEffect(() => {
    if (!matchId) return;

    const id = parseMatchId(matchId);
    if (id == null) {
      return;
    }

    const fetchHistory = async () => {
      const rows = await toriiSql<RoundMovesRow>(
        `SELECT round, commit_count, reveal_count, atk_a_p0, atk_a_p1, atk_a_p2, atk_b_p0, atk_b_p1, atk_b_p2, def_a_g0, def_a_g1, def_a_g2, def_b_g0, def_b_g1, def_b_g2, def_a_repair, def_b_repair FROM "siege_dojo-RoundMoves" WHERE match_id = ${sqlInt(id)} ORDER BY round DESC`,
      );

      const revealed = rows.filter((r) => toNum(r.reveal_count) >= 4).slice(0, 10);

      const parsed: RoundResult[] = revealed.map((node) => {
        const t1Attack = [toNum(node.atk_a_p0), toNum(node.atk_a_p1), toNum(node.atk_a_p2)];
        const t2Attack = [toNum(node.atk_b_p0), toNum(node.atk_b_p1), toNum(node.atk_b_p2)];
        const t1Defense = [toNum(node.def_a_g0), toNum(node.def_a_g1), toNum(node.def_a_g2)];
        const t2Defense = [toNum(node.def_b_g0), toNum(node.def_b_g1), toNum(node.def_b_g2)];

        return {
          round: toNum(node.round),
          team1Attack: t1Attack,
          team1Defense: t1Defense,
          team2Attack: t2Attack,
          team2Defense: t2Defense,
          damageToTeam1: computeDamage(t2Attack[0], t2Attack[1], t2Attack[2], t1Defense[0], t1Defense[1], t1Defense[2]),
          damageToTeam2: computeDamage(t1Attack[0], t1Attack[1], t1Attack[2], t2Defense[0], t2Defense[1], t2Defense[2]),
        };
      });

      setHistory(parsed);
    };

    const initTimer = setTimeout(() => {
      void fetchHistory();
    }, 0);
    const interval = setInterval(() => {
      void fetchHistory();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [matchId]);

  return history;
}

// Role enum from Cairo: 0 = TeamAAttacker, 1 = TeamADefender, 2 = TeamBAttacker, 3 = TeamBDefender
function roleIndex(team: 1 | 2, role: "attacker" | "defender"): number {
  if (team === 1 && role === "attacker") return 0;
  if (team === 1 && role === "defender") return 1;
  if (team === 2 && role === "attacker") return 2;
  return 3;
}

export interface CommitmentStatus {
  committed: boolean;
  revealed: boolean;
}

export function useCommitmentStatus(
  matchId: string | null,
  round: number,
  team: 1 | 2,
  role: "attacker" | "defender",
): CommitmentStatus {
  const [status, setStatus] = useState<CommitmentStatus>({ committed: false, revealed: false });

  useEffect(() => {
    if (!matchId) return;
    const id = parseMatchId(matchId);
    if (id == null) return;

    const rIdx = roleIndex(team, role);

    const fetchStatus = async () => {
      const rows = await toriiSql<{ committed: number | boolean; revealed: number | boolean }>(
        `SELECT committed, revealed FROM "siege_dojo-Commitment" WHERE match_id = ${sqlInt(id)} AND round = ${sqlInt(round)} AND role = ${sqlInt(rIdx)}`,
      );
      const row = rows[0];
      if (row) {
        setStatus({ committed: !!row.committed, revealed: !!row.revealed });
      }
    };

    const initTimer = setTimeout(() => {
      void fetchStatus();
    }, 0);
    const interval = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [matchId, round, team, role]);

  return status;
}
