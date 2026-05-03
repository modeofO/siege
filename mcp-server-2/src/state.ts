/**
 * Read-only Torii SQL queries. Matches the schema produced by the
 * `siege_dojo` namespace on Sepolia / local.
 */

export type MatchStatus = "Pending" | "Active" | "Finished";
export type NodeOwner = "None" | "TeamA" | "TeamB";

export interface MatchStateData {
  match_id: number;
  player_a: string;
  player_b: string;
  vault_a_hp: number;
  vault_b_hp: number;
  current_round: number;
  status: MatchStatus;
}

export interface RoundMovesData {
  match_id: number;
  round: number;
  commit_count: number;
  reveal_count: number;
  commit_deadline: number;
  reveal_deadline: number;
  a_p0: number; a_p1: number; a_p2: number;
  a_g0: number; a_g1: number; a_g2: number;
  a_repair: number;
  a_nc0: number; a_nc1: number; a_nc2: number;
  b_p0: number; b_p1: number; b_p2: number;
  b_g0: number; b_g1: number; b_g2: number;
  b_repair: number;
  b_nc0: number; b_nc1: number; b_nc2: number;
  a_ability_id: number;
  a_ability_target: number;
  b_ability_id: number;
  b_ability_target: number;
}

export interface NodeStateData {
  match_id: number;
  node_index: number;
  owner: NodeOwner;
}

export interface CommitmentData {
  match_id: number;
  round: number;
  role: number;
  hash: string;
  committed: boolean;
  revealed: boolean;
}

export interface RoundModifiersData {
  match_id: number;
  round: number;
  gates: [number, number, number];
}

export interface RoundTrapsData {
  match_id: number;
  round: number;
  player_a: [number, number, number];
  player_b: [number, number, number];
}

export interface MatchAbilitiesData {
  match_id: number;
  player_a: {
    abilities: [number, number, number];
    used: [boolean, boolean, boolean];
  };
  player_b: {
    abilities: [number, number, number];
    used: [boolean, boolean, boolean];
  };
}

export interface MatchStakesData {
  match_id: number;
  player_a: [number, number, number];
  player_b: [number, number, number];
  stake_count: number;
  settled: boolean;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function u64SqlKey(value: number): string {
  assertSafeInteger(value, "match_id");
  return `'0x${value.toString(16).padStart(16, "0")}'`;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

function toStatus(v: unknown): MatchStatus {
  const s = String(v);
  if (s === "Pending" || s === "Active" || s === "Finished") return s;
  const n = toNum(v);
  if (n === 0) return "Pending";
  if (n === 1) return "Active";
  return "Finished";
}

function toOwner(v: unknown): NodeOwner {
  const s = String(v);
  if (s === "TeamA" || s === "TeamB") return s;
  const n = toNum(v);
  if (n === 1) return "TeamA";
  if (n === 2) return "TeamB";
  return "None";
}

export class StateClient {
  constructor(private readonly toriiUrl: string) {}

  private async sql<T extends Record<string, unknown>>(query: string): Promise<T[]> {
    const resp = await fetch(`${this.toriiUrl}/sql?query=${encodeURIComponent(query)}`);
    if (!resp.ok) throw new Error(`Torii SQL failed: HTTP ${resp.status}`);
    return (await resp.json()) as T[];
  }

  /**
   * Find the most recently created match between the given players, polling
   * Torii until it indexes the new row or the deadline passes. Used right after
   * `create_match_1v1` to surface the assigned match_id without making the
   * caller query Torii themselves. Addresses are normalized to padded 32-byte
   * lowercase hex (Torii's storage format).
   */
  async findLatestMatchForPlayers(
    playerA: string,
    playerB: string,
    timeoutMs = 20000,
  ): Promise<number | null> {
    const norm = (a: string): string =>
      "0x" + a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    const a = norm(playerA);
    const b = norm(playerB);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await this.sql<Record<string, unknown>>(
        `SELECT match_id FROM "siege_dojo-MatchState1v1" WHERE player_a = '${a}' AND player_b = '${b}' ORDER BY internal_created_at DESC LIMIT 1`,
      );
      if (rows[0]) return toNum(rows[0].match_id);
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  async matchState(matchId: number): Promise<MatchStateData> {
    assertSafeInteger(matchId, "match_id");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, player_a, player_b, vault_a_hp, vault_b_hp, current_round, status FROM "siege_dojo-MatchState1v1" WHERE match_id = ${u64SqlKey(matchId)}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Match ${matchId} was not found`);
    return {
      match_id: toNum(row.match_id),
      player_a: String(row.player_a),
      player_b: String(row.player_b),
      vault_a_hp: toNum(row.vault_a_hp),
      vault_b_hp: toNum(row.vault_b_hp),
      current_round: toNum(row.current_round),
      status: toStatus(row.status),
    };
  }

  async roundMoves(matchId: number, round: number): Promise<RoundMovesData> {
    assertSafeInteger(matchId, "match_id");
    assertSafeInteger(round, "round");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT * FROM "siege_dojo-RoundMoves1v1" WHERE match_id = ${u64SqlKey(matchId)} AND round = ${round}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Round ${round} not found for match ${matchId}`);
    return {
      match_id: toNum(row.match_id),
      round: toNum(row.round),
      commit_count: toNum(row.commit_count),
      reveal_count: toNum(row.reveal_count),
      commit_deadline: toNum(row.commit_deadline),
      reveal_deadline: toNum(row.reveal_deadline),
      a_p0: toNum(row.a_p0), a_p1: toNum(row.a_p1), a_p2: toNum(row.a_p2),
      a_g0: toNum(row.a_g0), a_g1: toNum(row.a_g1), a_g2: toNum(row.a_g2),
      a_repair: toNum(row.a_repair),
      a_nc0: toNum(row.a_nc0), a_nc1: toNum(row.a_nc1), a_nc2: toNum(row.a_nc2),
      b_p0: toNum(row.b_p0), b_p1: toNum(row.b_p1), b_p2: toNum(row.b_p2),
      b_g0: toNum(row.b_g0), b_g1: toNum(row.b_g1), b_g2: toNum(row.b_g2),
      b_repair: toNum(row.b_repair),
      b_nc0: toNum(row.b_nc0), b_nc1: toNum(row.b_nc1), b_nc2: toNum(row.b_nc2),
      a_ability_id: toNum(row.a_ability_id),
      a_ability_target: toNum(row.a_ability_target),
      b_ability_id: toNum(row.b_ability_id),
      b_ability_target: toNum(row.b_ability_target),
    };
  }

  async nodeStates(matchId: number): Promise<NodeStateData[]> {
    assertSafeInteger(matchId, "match_id");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, node_index, owner FROM "siege_dojo-NodeState" WHERE match_id = ${u64SqlKey(matchId)}`,
    );
    const out: NodeStateData[] = [];
    for (let i = 0; i < 3; i++) {
      const row = rows.find((r) => toNum(r.node_index) === i);
      out.push({
        match_id: matchId,
        node_index: i,
        owner: row ? toOwner(row.owner) : "None",
      });
    }
    return out;
  }

  async commitment(matchId: number, round: number, role: number): Promise<CommitmentData> {
    assertSafeInteger(matchId, "match_id");
    assertSafeInteger(round, "round");
    assertSafeInteger(role, "role");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, round, role, hash, committed, revealed FROM "siege_dojo-Commitment" WHERE match_id = ${u64SqlKey(matchId)} AND round = ${round} AND role = ${role}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Commitment not found for match ${matchId}, round ${round}, role ${role}`);
    return {
      match_id: toNum(row.match_id),
      round: toNum(row.round),
      role: toNum(row.role),
      hash: String(row.hash),
      committed: toBool(row.committed),
      revealed: toBool(row.revealed),
    };
  }

  async roundModifiers(matchId: number, round: number): Promise<RoundModifiersData> {
    assertSafeInteger(matchId, "match_id");
    assertSafeInteger(round, "round");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, round, gate_0, gate_1, gate_2 FROM "siege_dojo-RoundModifiers1v1" WHERE match_id = ${u64SqlKey(matchId)} AND round = ${round}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Round modifiers not found for match ${matchId}, round ${round}`);
    return {
      match_id: toNum(row.match_id),
      round: toNum(row.round),
      gates: [toNum(row.gate_0), toNum(row.gate_1), toNum(row.gate_2)],
    };
  }

  async roundTraps(matchId: number, round: number): Promise<RoundTrapsData> {
    assertSafeInteger(matchId, "match_id");
    assertSafeInteger(round, "round");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, round, a_trap0, a_trap1, a_trap2, b_trap0, b_trap1, b_trap2 FROM "siege_dojo-RoundTraps1v1" WHERE match_id = ${u64SqlKey(matchId)} AND round = ${round}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Round traps not found for match ${matchId}, round ${round}`);
    return {
      match_id: toNum(row.match_id),
      round: toNum(row.round),
      player_a: [toNum(row.a_trap0), toNum(row.a_trap1), toNum(row.a_trap2)],
      player_b: [toNum(row.b_trap0), toNum(row.b_trap1), toNum(row.b_trap2)],
    };
  }

  async matchAbilities(matchId: number): Promise<MatchAbilitiesData> {
    assertSafeInteger(matchId, "match_id");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, a_ability_1, a_ability_2, a_ability_3, b_ability_1, b_ability_2, b_ability_3, a_used_1, a_used_2, a_used_3, b_used_1, b_used_2, b_used_3 FROM "siege_dojo-MatchAbilities1v1" WHERE match_id = ${u64SqlKey(matchId)}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Match abilities not found for match ${matchId}`);
    return {
      match_id: toNum(row.match_id),
      player_a: {
        abilities: [toNum(row.a_ability_1), toNum(row.a_ability_2), toNum(row.a_ability_3)],
        used: [toBool(row.a_used_1), toBool(row.a_used_2), toBool(row.a_used_3)],
      },
      player_b: {
        abilities: [toNum(row.b_ability_1), toNum(row.b_ability_2), toNum(row.b_ability_3)],
        used: [toBool(row.b_used_1), toBool(row.b_used_2), toBool(row.b_used_3)],
      },
    };
  }

  async matchStakes(matchId: number): Promise<MatchStakesData> {
    assertSafeInteger(matchId, "match_id");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT match_id, a_stake_1, a_stake_2, a_stake_3, b_stake_1, b_stake_2, b_stake_3, stake_count, settled FROM "siege_dojo-MatchStakes1v1" WHERE match_id = ${u64SqlKey(matchId)}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Match stakes not found for match ${matchId}`);
    return {
      match_id: toNum(row.match_id),
      player_a: [toNum(row.a_stake_1), toNum(row.a_stake_2), toNum(row.a_stake_3)],
      player_b: [toNum(row.b_stake_1), toNum(row.b_stake_2), toNum(row.b_stake_3)],
      stake_count: toNum(row.stake_count),
      settled: toBool(row.settled),
    };
  }
}
