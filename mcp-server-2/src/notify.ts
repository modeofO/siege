/**
 * Watched-match tracking and live update fan-out.
 *
 * Split out of index.ts so it can be exercised without importing the server
 * entry point — importing index.ts runs `main()`, which connects stdio,
 * subscribes to Torii and opens a real Cartridge session.
 *
 * Flow: the Torii gRPC bridge calls {@link notifyMatchChanged} for every entity
 * push touching a watched match. That debounces, rebuilds the snapshot once the
 * writes settle, diffs it, and — only on a real change — emits both the standard
 * `notifications/resources/updated` and the Claude Code channel event.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  buildMatchResourceSnapshot,
  matchStateResourceUri,
  type MatchResourceSnapshot,
} from "./match-resource.js";
import type { StateClient } from "./state.js";

const log = (msg: string) => process.stderr.write(`[siege-mcp] ${msg}\n`);

export const watchedMatches = new Set<number>();
export const subscribedMatchResourceUris = new Set<string>();
const matchResourceSnapshots = new Map<number, string>();

/**
 * Coalescing window for a burst of Torii entity updates belonging to the same
 * match. One `resolve_round` writes MatchState1v1, up to three NodeState rows
 * and RoundModifiers1v1 — five separate gRPC pushes describing a single
 * logical transition. Rebuilding the snapshot per push meant five full SQL
 * fan-outs whose diffs mostly collapsed to "unchanged" anyway.
 *
 * A trailing debounce rebuilds once, after the writes settle. It costs up to
 * this much added latency on the notification, which is negligible against the
 * 300 s commit/reveal deadlines the agent is actually racing.
 */
const NOTIFY_DEBOUNCE_MS = 150;
const pendingNotifies = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Debounced entry point used by the live bridge. Safe to call at gRPC push
 * rate; the rebuild happens once per quiet period per match.
 */
export function notifyMatchChanged(server: McpServer, state: StateClient, matchId: number): void {
  const existing = pendingNotifies.get(matchId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingNotifies.delete(matchId);
    void flushMatchChanged(server, state, matchId).catch((err: unknown) => {
      log(`live notification failed for match ${matchId}: ${errorMessage(err)}`);
    });
  }, NOTIFY_DEBOUNCE_MS);

  // Don't hold the event loop open on a pending notification at shutdown.
  timer.unref?.();
  pendingNotifies.set(matchId, timer);
}

async function flushMatchChanged(server: McpServer, state: StateClient, matchId: number): Promise<void> {
  const { changed, snapshot } = await updateMatchSnapshot(state, matchId);
  if (!changed) return;

  const uri = matchStateResourceUri(matchId);
  if (subscribedMatchResourceUris.has(uri)) {
    await server.server.sendResourceUpdated({ uri });
  }

  await pushChannelEvent(server, snapshot).catch((err: unknown) => {
    log(`channel notification failed for match ${matchId}: ${errorMessage(err)}`);
  });
}

/** Exposed so tools/resources can opt a match into live notifications. */
export function watchMatch(state: StateClient, matchId: number): void {
  if (watchedMatches.has(matchId)) return;
  watchedMatches.add(matchId);
  void updateMatchSnapshot(state, matchId).catch((err: unknown) => {
    log(`failed to seed match ${matchId} snapshot: ${errorMessage(err)}`);
  });
}

async function updateMatchSnapshot(
  state: StateClient,
  matchId: number,
): Promise<{ changed: boolean; snapshot: MatchResourceSnapshot }> {
  const snapshot = await buildMatchResourceSnapshot(state, matchId);
  const next = JSON.stringify({ ...snapshot, updated_at: undefined });
  const prev = matchResourceSnapshots.get(matchId);
  matchResourceSnapshots.set(matchId, next);
  return { changed: prev !== undefined && prev !== next, snapshot };
}

/** Node owners as `a`/`b`/`-` per index, e.g. "a,-,b". */
function nodeSummary(nodes: MatchResourceSnapshot["nodes"]): string {
  return [0, 1, 2]
    .map((i) => {
      const owner = nodes.find((n) => n.index === i)?.owner;
      if (owner === "TeamA") return "a";
      if (owner === "TeamB") return "b";
      return "-";
    })
    .join(",");
}

/**
 * The deadline that is actually running: commits are still open until both
 * land, after which the reveal clock is what matters.
 */
function activeDeadline(snapshot: MatchResourceSnapshot): number | null {
  if (snapshot.commits < 2) return snapshot.commit_deadline;
  if (snapshot.reveals < 2) return snapshot.reveal_deadline;
  return null;
}

async function pushChannelEvent(server: McpServer, snapshot: MatchResourceSnapshot): Promise<void> {
  const content =
    `match ${snapshot.match_id} round ${snapshot.current_round} ${snapshot.phase}: ` +
    `${snapshot.commits}/2 committed, ${snapshot.reveals}/2 revealed — ` +
    `HP ${snapshot.vault_a_hp}/${snapshot.vault_b_hp}`;
  const deadline = activeDeadline(snapshot);
  // Cast: the SDK's notification type union doesn't statically know about the
  // `notifications/claude/channel` extension method, but the underlying
  // Protocol.notification accepts any { method, params } and the server's
  // assertNotificationCapability falls through for unknown methods.
  await (server.server.notification as (n: unknown) => Promise<void>)({
    method: "notifications/claude/channel",
    params: {
      content,
      // Attribute keys must be identifiers — letters, digits and underscores
      // only. A key containing a hyphen is silently dropped by the host.
      //
      // These carry everything a round decision needs (budgets, node control,
      // gate modifiers, the running deadline) so the common commit/reveal loop
      // does not have to spend a ~160-token siege_get_match_state call just to
      // learn what the push already knew.
      meta: {
        match_id: String(snapshot.match_id),
        phase: snapshot.phase,
        round: String(snapshot.current_round),
        commits: String(snapshot.commits),
        reveals: String(snapshot.reveals),
        hp_a: String(snapshot.vault_a_hp),
        hp_b: String(snapshot.vault_b_hp),
        status: snapshot.status,
        budget_a: String(snapshot.player_a.budget),
        budget_b: String(snapshot.player_b.budget),
        nodes: nodeSummary(snapshot.nodes),
        mods: snapshot.modifiers ? snapshot.modifiers.join(",") : "",
        deadline: deadline === null ? "" : String(deadline),
      },
    },
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
