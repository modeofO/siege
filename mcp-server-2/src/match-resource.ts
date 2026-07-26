import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { roundBudget } from "./move.js";
import type { StateClient } from "./state.js";

const ROLE_A = 0;
const ROLE_B = 1;
const MAX_ROUNDS = 10;

export interface MatchResourceSnapshot {
  match_id: number;
  status: string;
  phase: string;
  current_round: number;
  rounds_remaining: number;
  commit_deadline: number | null;
  reveal_deadline: number | null;
  vault_a_hp: number;
  vault_b_hp: number;
  player_a: { address: string; budget: number };
  player_b: { address: string; budget: number };
  commits: number;
  reveals: number;
  modifiers: [number, number, number] | null;
  nodes: Array<{ index: number; owner: string }>;
  abilities: {
    player_a: { abilities: [number, number, number]; used: [boolean, boolean, boolean] };
    player_b: { abilities: [number, number, number]; used: [boolean, boolean, boolean] };
  } | null;
  stakes: {
    player_a: [number, number, number];
    player_b: [number, number, number];
    stake_count: number;
    settled: boolean;
  } | null;
  updated_at: string;
}

export function matchStateResourceUri(matchId: number): string {
  return `siege://match-1v1/${matchId}/state`;
}

export function matchIdFromStateResourceUri(uri: string): number | null {
  const parsed = /^siege:\/\/match-1v1\/(\d+)\/state$/.exec(uri);
  if (!parsed) return null;

  const matchId = Number(parsed[1]);
  return Number.isSafeInteger(matchId) && matchId >= 0 ? matchId : null;
}

export async function buildMatchResourceSnapshot(
  state: StateClient,
  matchId: number,
): Promise<MatchResourceSnapshot> {
  // Two round-trip generations, not six. Only `roundMoves` and `roundModifiers`
  // depend on the match (they key off current_round), so everything else fans
  // out in parallel. Each Torii SQL call is a separate HTTP request — issuing
  // them serially cost ~6x the latency of the slowest one.
  const match = await state.matchState(matchId);
  const [nodes, round, modifiers, abilities, stakes] = await Promise.all([
    state.nodeStates(matchId),
    state.roundMoves(matchId, match.current_round).catch(() => undefined),
    state
      .roundModifiers(matchId, match.current_round)
      .then((m) => m.gates)
      .catch(() => null),
    state.matchAbilities(matchId).catch(() => null),
    state.matchStakes(matchId).catch(() => null),
  ]);

  return {
    match_id: matchId,
    status: match.status,
    phase: phaseFor(match, round),
    current_round: match.current_round,
    rounds_remaining: Math.max(0, MAX_ROUNDS - match.current_round),
    commit_deadline: round?.commit_deadline ?? null,
    reveal_deadline: round?.reveal_deadline ?? null,
    vault_a_hp: match.vault_a_hp,
    vault_b_hp: match.vault_b_hp,
    player_a: { address: match.player_a, budget: budgetFor(nodes, ROLE_A, match.current_round) },
    player_b: { address: match.player_b, budget: budgetFor(nodes, ROLE_B, match.current_round) },
    commits: round?.commit_count ?? 0,
    reveals: round?.reveal_count ?? 0,
    modifiers,
    nodes: nodes.map((n) => ({ index: n.node_index, owner: n.owner })),
    abilities: abilities
      ? {
          player_a: abilities.player_a,
          player_b: abilities.player_b,
        }
      : null,
    stakes: stakes
      ? {
          player_a: stakes.player_a,
          player_b: stakes.player_b,
          stake_count: stakes.stake_count,
          settled: stakes.settled,
        }
      : null,
    updated_at: new Date().toISOString(),
  };
}

export function registerMatchResources({
  server,
  state,
  getWatchedMatches,
  isSubscribed,
  subscribe,
  unsubscribe,
  watchMatch,
}: {
  server: McpServer;
  state: StateClient;
  getWatchedMatches: () => number[];
  isSubscribed: (uri: string) => boolean;
  subscribe: (uri: string) => void;
  unsubscribe: (uri: string) => void;
  watchMatch: (matchId: number) => void;
}): void {
  server.registerResource(
    "siege-match-state",
    new ResourceTemplate("siege://match-1v1/{match_id}/state", {
      list: async () => ({
        resources: getWatchedMatches().map((matchId) => ({
          uri: matchStateResourceUri(matchId),
          name: `siege-match-${matchId}-state`,
          title: `Siege Match ${matchId} State`,
          description: "Live SQL-backed Siege 1v1 match snapshot.",
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Siege 1v1 Match State",
      description: "Parameterized SQL-backed live state snapshot for a watched Siege 1v1 match.",
      mimeType: "application/json",
    },
    async (uri) => {
      const matchId = matchIdFromStateResourceUri(uri.toString());
      if (matchId === null) throw new Error(`Invalid Siege match state URI: ${uri.toString()}`);

      watchMatch(matchId);
      const snapshot = await buildMatchResourceSnapshot(state, matchId);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      };
    },
  );

  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const uri = request.params.uri;
    const matchId = matchIdFromStateResourceUri(uri);
    if (matchId === null) throw new Error(`Invalid Siege match state subscription URI: ${uri}`);

    subscribe(uri);
    watchMatch(matchId);
    if (!isSubscribed(uri)) throw new Error(`Failed to subscribe to ${uri}`);
    return {};
  });

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    unsubscribe(request.params.uri);
    return {};
  });
}

/**
 * Delegates to the canonical formula in move.ts. This used to inline
 * `10 + owned_nodes`, silently dropping the rounds 7-10 escalation term — the
 * snapshot under-reported budget by up to 4 in the endgame, and the channel
 * event now surfaces this value directly.
 */
function budgetFor(nodes: { owner: string }[], role: number, round: number): number {
  const team = role === ROLE_A ? "TeamA" : "TeamB";
  return roundBudget(nodes.filter((n) => n.owner === team).length, round);
}

function phaseFor(
  state: { status: string },
  round?: { commit_count: number; reveal_count: number },
): string {
  if (state.status === "Finished") return "finished";
  if (!round || round.commit_count < 2) return "committing";
  if (round.reveal_count < 2) return "revealing";
  return "resolving";
}
