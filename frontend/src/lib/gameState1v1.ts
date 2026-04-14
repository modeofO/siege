// frontend/src/lib/gameState1v1.ts
import { useEffect, useState, useCallback } from "react";

export type NodeOwner = "neutral" | "teamA" | "teamB";

export interface MatchState1v1 {
  matchId: string;
  playerA: string;
  playerB: string;
  round: number;
  phase: "committing" | "revealing" | "resolving" | "finished";
  vaultAHp: number;
  vaultBHp: number;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  budgetA: number;
  budgetB: number;
  winner: number | null;
}

export interface GateDamage {
  gate: number;
  modifier: number;
  attackA: number;
  defenseA: number;
  attackB: number;
  defenseB: number;
  dmgToA: number;
  dmgToB: number;
}

export interface RoundResult1v1 {
  round: number;
  aAttack: number[];
  aDefense: number[];
  bAttack: number[];
  bDefense: number[];
  damageToA: number;
  damageToB: number;
  modifiers: [number, number, number];
  gateBreakdown: GateDamage[];
  aTraps: [number, number, number];
  bTraps: [number, number, number];
  trapDmgToA: number;
  trapDmgToB: number;
}

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function ownerToNode(owner: string): NodeOwner {
  if (owner === "TeamA") return "teamA";
  if (owner === "TeamB") return "teamB";
  return "neutral";
}

function computeBudget(nodes: NodeOwner[], team: "teamA" | "teamB"): number {
  return 10 + nodes.filter((n) => n === team).length;
}

function computeDamage(atk: number[], def: number[]): number {
  return atk.reduce((sum, a, i) => sum + Math.max(0, a - def[i]), 0);
}

function computeGateBreakdown(
  aAtk: number[], aDef: number[], bAtk: number[], bDef: number[],
  mods: [number, number, number],
): { gateBreakdown: GateDamage[]; damageToA: number; damageToB: number } {
  const dmgToB = [0, 0, 0];
  const dmgToA = [0, 0, 0];
  const ovfToB = [0, 0, 0];
  const ovfToA = [0, 0, 0];
  const unusedDefB = [0, 0, 0]; // B's defense not consumed by direct attack
  const unusedDefA = [0, 0, 0]; // A's defense not consumed by direct attack

  for (let g = 0; g < 3; g++) {
    let aa = aAtk[g], ad = aDef[g], ba = bAtk[g], bd = bDef[g];
    const mod = mods[g];

    if (mod === 1) { // Narrow Pass
      aa = Math.min(aa, 3); ad = Math.min(ad, 3);
      ba = Math.min(ba, 3); bd = Math.min(bd, 3);
    }
    if (mod === 2) { // Mirror
      [aa, ad] = [ad, aa];
      [ba, bd] = [bd, ba];
    }
    if (mod === 3) { // Deadlock
      // no damage — but defense is still "unused" for reflection blocking
      unusedDefB[g] = bd;
      unusedDefA[g] = ad;
    } else if (mod === 4) { // Reflection
      if (aa > bd) ovfToB[g] = aa - bd;
      if (ba > ad) ovfToA[g] = ba - ad;
    } else {
      if (aa > bd) { dmgToB[g] = aa - bd; } else { unusedDefB[g] = bd - aa; }
      if (ba > ad) { dmgToA[g] = ba - ad; } else { unusedDefA[g] = ad - ba; }
    }
  }

  // Distribute reflection — reduced by unused defense at receiving gate
  // Deadlock gates block reflected damage entirely
  for (let g = 0; g < 3; g++) {
    if (ovfToB[g] > 0) {
      const per = Math.floor(ovfToB[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && mods[t] !== 3) { // 3 = Deadlock
          const blocked = Math.min(per, unusedDefB[t]);
          dmgToB[t] += per - blocked;
        }
      }
    }
    if (ovfToA[g] > 0) {
      const per = Math.floor(ovfToA[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && mods[t] !== 3) { // 3 = Deadlock
          const blocked = Math.min(per, unusedDefA[t]);
          dmgToA[t] += per - blocked;
        }
      }
    }
  }

  const gateBreakdown: GateDamage[] = [0, 1, 2].map(g => ({
    gate: g,
    modifier: mods[g],
    attackA: aAtk[g], defenseA: aDef[g],
    attackB: bAtk[g], defenseB: bDef[g],
    dmgToA: dmgToA[g], dmgToB: dmgToB[g],
  }));

  return {
    gateBreakdown,
    damageToA: dmgToA[0] + dmgToA[1] + dmgToA[2],
    damageToB: dmgToB[0] + dmgToB[1] + dmgToB[2],
  };
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

async function fetchMatchState1v1(matchId: string): Promise<MatchState1v1 | null> {
  const id = Number(matchId);
  if (!Number.isInteger(id) || id < 0) return null;

  const data = await toriiQuery<{
    siegeDojoMatchState1V1Models: GraphEdges<{
      match_id: string; player_a: string; player_b: string;
      vault_a_hp: string; vault_b_hp: string;
      current_round: string; status: string;
    }>;
    siegeDojoNodeStateModels: GraphEdges<{
      node_index: string; owner: string;
    }>;
  }>(`
    query {
      siegeDojoMatchState1V1Models(where: { match_id: "${id}" }) {
        edges { node { match_id player_a player_b vault_a_hp vault_b_hp current_round status } }
      }
      siegeDojoNodeStateModels(where: { match_id: "${id}" }) {
        edges { node { node_index owner } }
      }
    }
  `);

  const m = data?.siegeDojoMatchState1V1Models?.edges?.[0]?.node;
  if (!m) return null;

  const round = toNum(m.current_round);
  const vaultAHp = toNum(m.vault_a_hp);
  const vaultBHp = toNum(m.vault_b_hp);

  const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  for (const edge of data?.siegeDojoNodeStateModels?.edges || []) {
    const idx = toNum(edge.node.node_index);
    if (idx >= 0 && idx < 3) nodes[idx] = ownerToNode(edge.node.owner);
  }

  let phase: MatchState1v1["phase"] = "committing";
  if (m.status === "Finished") {
    phase = "finished";
  } else {
    const roundData = await toriiQuery<{
      siegeDojoRoundMoves1V1Models: GraphEdges<{
        commit_count: string; reveal_count: string;
      }>;
    }>(`
      query {
        siegeDojoRoundMoves1V1Models(where: { match_id: "${id}", round: ${round} }) {
          edges { node { commit_count reveal_count } }
        }
      }
    `);
    const rn = roundData?.siegeDojoRoundMoves1V1Models?.edges?.[0]?.node;
    if (rn) {
      const cc = toNum(rn.commit_count);
      const rc = toNum(rn.reveal_count);
      if (cc >= 2) {
        phase = rc >= 2 ? "resolving" : "revealing";
      }
    }
  }

  let winner: number | null = null;
  if (m.status === "Finished") {
    if (vaultAHp === 0 && vaultBHp > 0) winner = 2;
    else if (vaultBHp === 0 && vaultAHp > 0) winner = 1;
    else if (vaultAHp > vaultBHp) winner = 1;
    else if (vaultBHp > vaultAHp) winner = 2;
    else winner = 0; // draw
  }

  return {
    matchId: String(m.match_id),
    playerA: m.player_a,
    playerB: m.player_b,
    round,
    phase,
    vaultAHp,
    vaultBHp,
    nodes,
    budgetA: computeBudget(nodes, "teamA"),
    budgetB: computeBudget(nodes, "teamB"),
    winner,
  };
}

export function useMatchState1v1(matchId: string | null) {
  const [state, setState] = useState<MatchState1v1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    const s = await fetchMatchState1v1(matchId);
    setState(s);
    setLoading(false);
    setRefreshKey(k => k + 1);
  }, [matchId]);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, 0);
    const i = setInterval(() => { void refresh(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refresh]);

  return { state, loading, refresh, refreshKey };
}

export function useRoundStatus1v1(matchId: string | null, round: number, refreshKey?: number) {
  const [status, setStatus] = useState({ commitCount: 0, revealCount: 0 });

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundMoves1V1Models: GraphEdges<{
          commit_count: string; reveal_count: string;
        }>;
      }>(`
        query {
          siegeDojoRoundMoves1V1Models(where: { match_id: "${id}", round: ${round} }) {
            edges { node { commit_count reveal_count } }
          }
        }
      `);
      const node = data?.siegeDojoRoundMoves1V1Models?.edges?.[0]?.node;
      if (node) {
        setStatus({
          commitCount: toNum(node.commit_count),
          revealCount: toNum(node.reveal_count),
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round, refreshKey]);

  return status;
}

export function useCommitmentStatus1v1(
  matchId: string | null,
  round: number,
  role: 0 | 1,
  refreshKey?: number,
) {
  const [status, setStatus] = useState({ committed: false, revealed: false });

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoCommitmentModels: GraphEdges<{ committed: boolean; revealed: boolean }>;
      }>(`
        query {
          siegeDojoCommitmentModels(where: { match_id: "${id}", round: ${round}, role: ${role} }) {
            edges { node { committed revealed } }
          }
        }
      `);
      const node = data?.siegeDojoCommitmentModels?.edges?.[0]?.node;
      if (node) {
        setStatus({ committed: node.committed, revealed: node.revealed });
      } else {
        setStatus({ committed: false, revealed: false });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round, role, refreshKey]);

  return status;
}

export function useRoundHistory1v1(matchId: string | null) {
  const [history, setHistory] = useState<RoundResult1v1[]>([]);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundMoves1V1Models: GraphEdges<{
          round: string; reveal_count: string;
          a_p0: string; a_p1: string; a_p2: string;
          a_g0: string; a_g1: string; a_g2: string;
          b_p0: string; b_p1: string; b_p2: string;
          b_g0: string; b_g1: string; b_g2: string;
        }>;
        siegeDojoRoundModifiers1V1Models: GraphEdges<{
          round: string; gate_0: string; gate_1: string; gate_2: string;
        }>;
        siegeDojoRoundTraps1V1Models: GraphEdges<{
          round: string;
          a_trap0: string; a_trap1: string; a_trap2: string;
          b_trap0: string; b_trap1: string; b_trap2: string;
        }>;
      }>(`
        query {
          siegeDojoRoundMoves1V1Models(where: { match_id: "${id}" }) {
            edges { node { round reveal_count a_p0 a_p1 a_p2 a_g0 a_g1 a_g2 b_p0 b_p1 b_p2 b_g0 b_g1 b_g2 } }
          }
          siegeDojoRoundModifiers1V1Models(where: { match_id: "${id}" }) {
            edges { node { round gate_0 gate_1 gate_2 } }
          }
          siegeDojoRoundTraps1V1Models(where: { match_id: "${id}" }) {
            edges { node { round a_trap0 a_trap1 a_trap2 b_trap0 b_trap1 b_trap2 } }
          }
        }
      `);

      // Build modifier lookup by round
      const modsByRound: Record<number, [number, number, number]> = {};
      for (const edge of data?.siegeDojoRoundModifiers1V1Models?.edges || []) {
        const r = toNum(edge.node.round);
        modsByRound[r] = [toNum(edge.node.gate_0), toNum(edge.node.gate_1), toNum(edge.node.gate_2)];
      }

      // Build trap lookup by round
      const trapsByRound: Record<number, { a: [number, number, number]; b: [number, number, number] }> = {};
      for (const edge of data?.siegeDojoRoundTraps1V1Models?.edges || []) {
        const r = toNum(edge.node.round);
        trapsByRound[r] = {
          a: [toNum(edge.node.a_trap0), toNum(edge.node.a_trap1), toNum(edge.node.a_trap2)],
          b: [toNum(edge.node.b_trap0), toNum(edge.node.b_trap1), toNum(edge.node.b_trap2)],
        };
      }

      const results = (data?.siegeDojoRoundMoves1V1Models?.edges || [])
        .map((e) => e.node)
        .filter((n) => toNum(n.reveal_count) >= 2)
        .sort((a, b) => toNum(b.round) - toNum(a.round))
        .slice(0, 10)
        .map((n): RoundResult1v1 => {
          const rnd = toNum(n.round);
          const aAtk = [toNum(n.a_p0), toNum(n.a_p1), toNum(n.a_p2)];
          const aDef = [toNum(n.a_g0), toNum(n.a_g1), toNum(n.a_g2)];
          const bAtk = [toNum(n.b_p0), toNum(n.b_p1), toNum(n.b_p2)];
          const bDef = [toNum(n.b_g0), toNum(n.b_g1), toNum(n.b_g2)];
          const mods: [number, number, number] = modsByRound[rnd] || [0, 0, 0];
          const { gateBreakdown, damageToA, damageToB } = computeGateBreakdown(aAtk, aDef, bAtk, bDef, mods);
          const traps = trapsByRound[rnd] || { a: [0, 0, 0] as [number, number, number], b: [0, 0, 0] as [number, number, number] };
          return {
            round: rnd,
            aAttack: aAtk,
            aDefense: aDef,
            bAttack: bAtk,
            bDefense: bDef,
            damageToA,
            damageToB,
            modifiers: mods,
            gateBreakdown,
            aTraps: traps.a,
            bTraps: traps.b,
            trapDmgToA: 0,
            trapDmgToB: 0,
          };
        });

      setHistory(results);
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId]);

  return history;
}

export function usePlayerKingdom(playerAddress: string | null) {
  const [kingdom, setKingdom] = useState<{
    tier: number;
    totalWins: number;
    parcelCount: number;
    registered: boolean;
  } | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoPlayerKingdomModels: GraphEdges<{
          tier: string;
          total_wins: string;
          parcel_count: string;
          registered: boolean;
        }>;
      }>(`
        query {
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node { tier total_wins parcel_count registered } }
          }
        }
      `);
      const node = data?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;
      if (node) {
        setKingdom({
          tier: toNum(node.tier),
          totalWins: toNum(node.total_wins),
          parcelCount: toNum(node.parcel_count),
          registered: node.registered,
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return kingdom;
}

export const MODIFIER_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Narrow Pass",
  2: "Mirror Gate",
  3: "Deadlock",
  4: "Reflection",
};

export const MODIFIER_DESCRIPTIONS: Record<number, string> = {
  0: "",
  1: "Attack and defense capped at 3",
  2: "Attack and defense values swap",
  3: "No damage dealt at this gate",
  4: "Damage reflects to other gates",
};

export interface MatchAbilitiesData {
  abilities: [number, number, number];
  used: [boolean, boolean, boolean];
}

export function useMatchAbilities1v1(
  matchId: string | null,
  playerAddress: string | null,
  playerA: string | null,
  refreshKey?: number,
) {
  const [data, setData] = useState<MatchAbilitiesData>({
    abilities: [0, 0, 0],
    used: [false, false, false],
  });

  useEffect(() => {
    if (!matchId || !playerAddress || !playerA) return;
    const id = Number(matchId);
    const isA = playerAddress.toLowerCase() === playerA.toLowerCase();

    const fetch = async () => {
      const result = await toriiQuery<{
        siegeDojoMatchAbilities1V1Models: GraphEdges<{
          a_ability_1: string; a_ability_2: string; a_ability_3: string;
          b_ability_1: string; b_ability_2: string; b_ability_3: string;
          a_used_1: boolean; a_used_2: boolean; a_used_3: boolean;
          b_used_1: boolean; b_used_2: boolean; b_used_3: boolean;
        }>;
      }>(`
        query {
          siegeDojoMatchAbilities1V1Models(where: { match_id: "${id}" }) {
            edges { node {
              a_ability_1 a_ability_2 a_ability_3
              b_ability_1 b_ability_2 b_ability_3
              a_used_1 a_used_2 a_used_3
              b_used_1 b_used_2 b_used_3
            } }
          }
        }
      `);
      const node = result?.siegeDojoMatchAbilities1V1Models?.edges?.[0]?.node;
      if (node) {
        if (isA) {
          setData({
            abilities: [toNum(node.a_ability_1), toNum(node.a_ability_2), toNum(node.a_ability_3)],
            used: [!!node.a_used_1, !!node.a_used_2, !!node.a_used_3],
          });
        } else {
          setData({
            abilities: [toNum(node.b_ability_1), toNum(node.b_ability_2), toNum(node.b_ability_3)],
            used: [!!node.b_used_1, !!node.b_used_2, !!node.b_used_3],
          });
        }
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, playerAddress, playerA, refreshKey]);

  return data;
}

export interface MatchStakesData {
  a: [number, number, number];
  b: [number, number, number];
  aUsed: [boolean, boolean, boolean];
  bUsed: [boolean, boolean, boolean];
  isStaked: boolean;
  loaded: boolean;
}

/**
 * Returns both players' staked abilities for a match. Used by the stakes
 * header (issue #4). Non-staked 1v1 matches will return all zeros and
 * `isStaked: false`.
 */
export function useMatchStakes1v1(
  matchId: string | null,
  refreshKey?: number,
): MatchStakesData {
  const [data, setData] = useState<MatchStakesData>({
    a: [0, 0, 0],
    b: [0, 0, 0],
    aUsed: [false, false, false],
    bUsed: [false, false, false],
    isStaked: false,
    loaded: false,
  });

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const result = await toriiQuery<{
        siegeDojoMatchAbilities1V1Models: GraphEdges<{
          a_ability_1: string; a_ability_2: string; a_ability_3: string;
          b_ability_1: string; b_ability_2: string; b_ability_3: string;
          a_used_1: boolean; a_used_2: boolean; a_used_3: boolean;
          b_used_1: boolean; b_used_2: boolean; b_used_3: boolean;
        }>;
      }>(`
        query {
          siegeDojoMatchAbilities1V1Models(where: { match_id: "${id}" }) {
            edges { node {
              a_ability_1 a_ability_2 a_ability_3
              b_ability_1 b_ability_2 b_ability_3
              a_used_1 a_used_2 a_used_3
              b_used_1 b_used_2 b_used_3
            } }
          }
        }
      `);
      const node = result?.siegeDojoMatchAbilities1V1Models?.edges?.[0]?.node;
      if (!node) {
        setData((d) => ({ ...d, loaded: true }));
        return;
      }
      const a: [number, number, number] = [
        toNum(node.a_ability_1), toNum(node.a_ability_2), toNum(node.a_ability_3),
      ];
      const b: [number, number, number] = [
        toNum(node.b_ability_1), toNum(node.b_ability_2), toNum(node.b_ability_3),
      ];
      setData({
        a, b,
        aUsed: [!!node.a_used_1, !!node.a_used_2, !!node.a_used_3],
        bUsed: [!!node.b_used_1, !!node.b_used_2, !!node.b_used_3],
        isStaked: a.some((x) => x > 0) || b.some((x) => x > 0),
        loaded: true,
      });
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, refreshKey]);

  return data;
}

export function useRoundModifiers1v1(matchId: string | null, round: number) {
  const [modifiers, setModifiers] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoRoundModifiers1V1Models: GraphEdges<{
          gate_0: string; gate_1: string; gate_2: string;
        }>;
      }>(`
        query {
          siegeDojoRoundModifiers1V1Models(where: { match_id: "${id}", round: ${round} }) {
            edges { node { gate_0 gate_1 gate_2 } }
          }
        }
      `);
      const node = data?.siegeDojoRoundModifiers1V1Models?.edges?.[0]?.node;
      if (node) {
        setModifiers([toNum(node.gate_0), toNum(node.gate_1), toNum(node.gate_2)]);
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [matchId, round]);

  return modifiers;
}
