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

export interface ParcelData {
  parcel_id: number;
  col: number;
  row: number;
  parcel_type: number;
  owner: string;
  is_home: boolean;
}

export interface PlayerKingdomData {
  player: string;
  home_0: number;
  home_1: number;
  home_2: number;
  parcel_count: number;
  registered: boolean;
  free_craft_used: boolean;
  last_drip_time: number;
  tier: number;
  total_wins: number;
  faction_reinforcement_enabled: boolean;
}

export interface WorldConfigData {
  total_parcels: number;
  next_parcel_id: number;
  initialized: boolean;
}

export interface ResourceConfigData {
  iron: string;
  linen: string;
  stone: string;
  wood: string;
  ember: string;
  seeds: string;
  ability_token: string;
  vrf_provider: string;
}

export interface PresetSlotData {
  p0: number;
  p1: number;
  p2: number;
  g0: number;
  g1: number;
  g2: number;
}

export interface PresetDefenseData {
  player: string;
  slots: [PresetSlotData, PresetSlotData, PresetSlotData, PresetSlotData];
  preset_count: number;
}

export interface PillageData {
  home_parcel_id: number;
  pillager: string;
  target: string;
  start_time: number;
  expires_at: number;
  last_claim_time: number;
  active: boolean;
}

export interface PillageEligibilityData {
  winner: string;
  match_id: number;
  loser: string;
  granted_at: number;
  expires_at: number;
  used: boolean;
}

export interface PlayerReputationData {
  player: string;
  total_losses: number;
  current_streak: number;
  best_streak: number;
  bracket: number;
}

export interface MatchRecordData {
  player: string;
  opponent: string;
  wins: number;
  losses: number;
  last_match_id: number;
}

export interface FactionData {
  faction_id: number;
  leader: string;
  name: string;
  tag: string;
  member_count: number;
  created_at: number;
  dissolved: boolean;
}

export interface FactionMemberData {
  player: string;
  faction_id: number;
  joined_at: number;
  last_leave_time: number;
}

export interface FactionInviteData {
  target: string;
  faction_id: number;
  invited_by: string;
  invited_at: number;
  used: boolean;
}

export interface PlayerCosmeticsData {
  player: string;
  banner: string | null;
  parcel_skin: string | null;
  hold_decoration: string | null;
}

export interface QueueStatusData {
  state: number; // 0 idle, 1 queued, 2 matched
  queued_at: number;
  matched_match_id: number;
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

function u32SqlKey(value: number, label: string): string {
  assertSafeInteger(value, label);
  return String(value);
}

function addressSqlKey(value: string): string {
  return `'0x${BigInt(value).toString(16).padStart(64, "0")}'`;
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

function feltToString(felt: unknown): string {
  const raw = String(felt ?? "");
  if (!raw || raw === "0x0" || raw === "0") return "";
  const hex = raw.startsWith("0x") ? raw.slice(2) : BigInt(raw).toString(16);
  const padded = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    const byte = parseInt(padded.slice(i, i + 2), 16);
    if (byte > 0) bytes.push(byte);
  }
  return String.fromCharCode(...bytes);
}

function slot(row: Record<string, unknown>, prefix: "p0" | "p1" | "p2" | "p3"): PresetSlotData {
  return {
    p0: toNum(row[`${prefix}_p0`]),
    p1: toNum(row[`${prefix}_p1`]),
    p2: toNum(row[`${prefix}_p2`]),
    g0: toNum(row[`${prefix}_g0`]),
    g1: toNum(row[`${prefix}_g1`]),
    g2: toNum(row[`${prefix}_g2`]),
  };
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

  async queueStatus(player: string): Promise<QueueStatusData | null> {
    if (!/^(0x)?[0-9a-fA-F]{1,64}$/.test(player)) throw new Error("invalid player address");
    const norm = "0x" + player.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT state, queued_at, matched_match_id FROM "siege_dojo-QueueStatus" WHERE player = '${norm}' LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      state: toNum(row.state),
      queued_at: toNum(row.queued_at),
      matched_match_id: toNum(row.matched_match_id),
    };
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

  async worldConfig(): Promise<WorldConfigData> {
    const rows = await this.sql<Record<string, unknown>>(
      'SELECT total_parcels, next_parcel_id, initialized FROM "siege_dojo-WorldConfig" WHERE id = 0',
    );
    const row = rows[0];
    if (!row) throw new Error("WorldConfig was not found");
    return {
      total_parcels: toNum(row.total_parcels),
      next_parcel_id: toNum(row.next_parcel_id),
      initialized: toBool(row.initialized),
    };
  }

  async resourceConfig(): Promise<ResourceConfigData> {
    const rows = await this.sql<Record<string, unknown>>(
      'SELECT iron, linen, stone, wood, ember, seeds, ability_token, vrf_provider FROM "siege_dojo-ResourceConfig" WHERE id = 0',
    );
    const row = rows[0];
    if (!row) throw new Error("ResourceConfig was not found");
    return {
      iron: String(row.iron),
      linen: String(row.linen),
      stone: String(row.stone),
      wood: String(row.wood),
      ember: String(row.ember),
      seeds: String(row.seeds),
      ability_token: String(row.ability_token),
      vrf_provider: String(row.vrf_provider),
    };
  }

  async parcels(limit = 200): Promise<ParcelData[]> {
    assertSafeInteger(limit, "limit");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT parcel_id, col, row, parcel_type, owner, is_home FROM "siege_dojo-Parcel" ORDER BY parcel_id ASC LIMIT ${limit}`,
    );
    return rows.map((row) => ({
      parcel_id: toNum(row.parcel_id),
      col: toNum(row.col),
      row: toNum(row.row),
      parcel_type: toNum(row.parcel_type),
      owner: String(row.owner),
      is_home: toBool(row.is_home),
    }));
  }

  async parcel(parcelId: number): Promise<ParcelData> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT parcel_id, col, row, parcel_type, owner, is_home FROM "siege_dojo-Parcel" WHERE parcel_id = ${u32SqlKey(parcelId, "parcel_id")}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`Parcel ${parcelId} was not found`);
    return {
      parcel_id: toNum(row.parcel_id),
      col: toNum(row.col),
      row: toNum(row.row),
      parcel_type: toNum(row.parcel_type),
      owner: String(row.owner),
      is_home: toBool(row.is_home),
    };
  }

  async playerKingdom(player: string): Promise<PlayerKingdomData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, home_0, home_1, home_2, parcel_count, registered, free_craft_used, last_drip_time, tier, total_wins, faction_reinforcement_enabled FROM "siege_dojo-PlayerKingdom" WHERE player = ${addressSqlKey(player)}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      player: String(row.player),
      home_0: toNum(row.home_0),
      home_1: toNum(row.home_1),
      home_2: toNum(row.home_2),
      parcel_count: toNum(row.parcel_count),
      registered: toBool(row.registered),
      free_craft_used: toBool(row.free_craft_used),
      last_drip_time: toNum(row.last_drip_time),
      tier: toNum(row.tier),
      total_wins: toNum(row.total_wins),
      faction_reinforcement_enabled: toBool(row.faction_reinforcement_enabled),
    };
  }

  async playerReputation(player: string): Promise<PlayerReputationData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, total_losses, current_streak, best_streak, bracket FROM "siege_dojo-PlayerReputation" WHERE player = ${addressSqlKey(player)}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      player: String(row.player),
      total_losses: toNum(row.total_losses),
      current_streak: toNum(row.current_streak),
      best_streak: toNum(row.best_streak),
      bracket: toNum(row.bracket),
    };
  }

  async playerCosmetics(player: string): Promise<PlayerCosmeticsData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics" WHERE player = ${addressSqlKey(player)}`,
    );
    const row = rows[0];
    if (!row) return null;
    const feltToStr = (v: unknown): string | null => {
      if (!v || v === "0x0" || v === "0") return null;
      const hex = String(v).replace(/^0x/, "");
      let s = "";
      for (let i = 0; i < hex.length; i += 2) {
        const code = parseInt(hex.slice(i, i + 2), 16);
        if (code === 0) break;
        s += String.fromCharCode(code);
      }
      return s || null;
    };
    return {
      player: String(row.player),
      banner: feltToStr(row.banner),
      parcel_skin: feltToStr(row.parcel_skin),
      hold_decoration: feltToStr(row.hold_decoration),
    };
  }

  async presetDefense(player: string): Promise<PresetDefenseData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, p0_p0, p0_p1, p0_p2, p0_g0, p0_g1, p0_g2, p1_p0, p1_p1, p1_p2, p1_g0, p1_g1, p1_g2, p2_p0, p2_p1, p2_p2, p2_g0, p2_g1, p2_g2, p3_p0, p3_p1, p3_p2, p3_g0, p3_g1, p3_g2, preset_count FROM "siege_dojo-PresetDefense" WHERE player = ${addressSqlKey(player)}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      player: String(row.player),
      slots: [slot(row, "p0"), slot(row, "p1"), slot(row, "p2"), slot(row, "p3")],
      preset_count: toNum(row.preset_count),
    };
  }

  async pillage(homeParcelId: number): Promise<PillageData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT home_parcel_id, pillager, target, start_time, expires_at, last_claim_time, active FROM "siege_dojo-Pillage" WHERE home_parcel_id = ${u32SqlKey(homeParcelId, "home_parcel_id")}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      home_parcel_id: toNum(row.home_parcel_id),
      pillager: String(row.pillager),
      target: String(row.target),
      start_time: toNum(row.start_time),
      expires_at: toNum(row.expires_at),
      last_claim_time: toNum(row.last_claim_time),
      active: toBool(row.active),
    };
  }

  async activePillagesFor(player: string): Promise<PillageData[]> {
    const address = addressSqlKey(player);
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT home_parcel_id, pillager, target, start_time, expires_at, last_claim_time, active FROM "siege_dojo-Pillage" WHERE pillager = ${address} OR target = ${address}`,
    );
    return rows.map((row) => ({
      home_parcel_id: toNum(row.home_parcel_id),
      pillager: String(row.pillager),
      target: String(row.target),
      start_time: toNum(row.start_time),
      expires_at: toNum(row.expires_at),
      last_claim_time: toNum(row.last_claim_time),
      active: toBool(row.active),
    }));
  }

  async pillageEligibilitiesFor(winner: string): Promise<PillageEligibilityData[]> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT winner, match_id, loser, granted_at, expires_at, used FROM "siege_dojo-PillageEligibility" WHERE winner = ${addressSqlKey(winner)}`,
    );
    return rows.map((row) => ({
      winner: String(row.winner),
      match_id: toNum(row.match_id),
      loser: String(row.loser),
      granted_at: toNum(row.granted_at),
      expires_at: toNum(row.expires_at),
      used: toBool(row.used),
    }));
  }

  async matchRecord(player: string, opponent: string): Promise<MatchRecordData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, opponent, wins, losses, last_match_id FROM "siege_dojo-MatchRecord" WHERE player = ${addressSqlKey(player)} AND opponent = ${addressSqlKey(opponent)}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      player: String(row.player),
      opponent: String(row.opponent),
      wins: toNum(row.wins),
      losses: toNum(row.losses),
      last_match_id: toNum(row.last_match_id),
    };
  }

  async faction(factionId: number): Promise<FactionData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction" WHERE faction_id = ${u32SqlKey(factionId, "faction_id")}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      faction_id: toNum(row.faction_id),
      leader: String(row.leader),
      name: feltToString(row.name),
      tag: feltToString(row.tag),
      member_count: toNum(row.member_count),
      created_at: toNum(row.created_at),
      dissolved: toBool(row.dissolved),
    };
  }

  async factions(limit = 50): Promise<FactionData[]> {
    assertSafeInteger(limit, "limit");
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT faction_id, leader, name, tag, member_count, created_at, dissolved FROM "siege_dojo-Faction" ORDER BY faction_id ASC LIMIT ${limit}`,
    );
    return rows.map((row) => ({
      faction_id: toNum(row.faction_id),
      leader: String(row.leader),
      name: feltToString(row.name),
      tag: feltToString(row.tag),
      member_count: toNum(row.member_count),
      created_at: toNum(row.created_at),
      dissolved: toBool(row.dissolved),
    }));
  }

  async factionMember(player: string): Promise<FactionMemberData | null> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, faction_id, joined_at, last_leave_time FROM "siege_dojo-FactionMember" WHERE player = ${addressSqlKey(player)}`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      player: String(row.player),
      faction_id: toNum(row.faction_id),
      joined_at: toNum(row.joined_at),
      last_leave_time: toNum(row.last_leave_time),
    };
  }

  async factionMembers(factionId: number): Promise<FactionMemberData[]> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT player, faction_id, joined_at, last_leave_time FROM "siege_dojo-FactionMember" WHERE faction_id = ${u32SqlKey(factionId, "faction_id")}`,
    );
    return rows.map((row) => ({
      player: String(row.player),
      faction_id: toNum(row.faction_id),
      joined_at: toNum(row.joined_at),
      last_leave_time: toNum(row.last_leave_time),
    }));
  }

  async factionInvitesFor(target: string): Promise<FactionInviteData[]> {
    const rows = await this.sql<Record<string, unknown>>(
      `SELECT target, faction_id, invited_by, invited_at, used FROM "siege_dojo-FactionInvite" WHERE target = ${addressSqlKey(target)}`,
    );
    return rows.map((row) => ({
      target: String(row.target),
      faction_id: toNum(row.faction_id),
      invited_by: String(row.invited_by),
      invited_at: toNum(row.invited_at),
      used: toBool(row.used),
    }));
  }
}
