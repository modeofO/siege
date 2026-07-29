/**
 * Watched-match tracking and live update fan-out.
 *
 * Split out of index.ts so it can be exercised without importing the server
 * entry point — importing index.ts runs `main()`, which connects stdio and
 * opens a real Cartridge session.
 *
 * Flow: the live poller (live.ts) calls {@link notifyMatchChanged} whenever a
 * watched match's activity probe advances. That debounces, rebuilds the
 * snapshot once the writes settle, diffs it, and — only on a real change —
 * emits both the standard `notifications/resources/updated` and the Claude
 * Code channel event.
 *
 * Watch lifecycle invariant: the set only ever contains matches that are
 * currently alive and that the agent has touched. Reads of finished matches
 * never watch ({@link watchMatch} self-guards); a watched match that finishes
 * emits its final event and is then removed ({@link flushMatchChanged});
 * {@link unwatchMatch} is the explicit release for e.g. abandoned spectating.
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

// The agent's own account address, set by index.ts once the session resolves.
// Used to stamp channel events with `you`: participant side or spectator —
// so an event is self-describing instead of relying on conversation memory.
let agentAddress = "";

export function setAgentAddress(address: string): void {
  agentAddress = address;
}

/**
 * Coalescing window for a burst of activity-probe wakeups belonging to the
 * same match. One `resolve_round` writes MatchState1v1 plus, conditionally,
 * changed NodeState rows and RoundModifiers1v1 — several entity updates
 * describing a single logical transition. Rebuilding the snapshot per update
 * meant several full SQL fan-outs whose diffs mostly collapsed to
 * "unchanged" anyway.
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

  // Final event delivered — a finished match has nothing further to say, so
  // release it. This is what guarantees every watch (and its poll) terminates.
  if (snapshot.status === "Finished") {
    unwatchMatch(matchId);
    log(`match ${matchId} finished — unwatched after final event`);
  }
}

/**
 * Exposed so tools/resources can opt a match into live notifications.
 * Self-guards against dead matches: reading a finished match for history is a
 * read, not a commitment to poll it — the seed fetch checks status and backs
 * out again, without emitting (a first observation never diffs as changed).
 */
export function watchMatch(state: StateClient, matchId: number): void {
  if (watchedMatches.has(matchId)) return;
  watchedMatches.add(matchId);
  void updateMatchSnapshot(state, matchId)
    .then(({ snapshot }) => {
      if (snapshot.status === "Finished") {
        unwatchMatch(matchId);
        log(`match ${matchId} is finished — not watching`);
      }
    })
    .catch((err: unknown) => {
      log(`failed to seed match ${matchId} snapshot: ${errorMessage(err)}`);
    });
}

/**
 * Explicit release — the off switch for a match the agent no longer cares
 * about (abandoned spectating, wrong id). Also the internal path for the two
 * automatic releases above. Clears every per-match residue so a later
 * re-watch starts from a clean seed.
 */
export function unwatchMatch(matchId: number): boolean {
  const wasWatched = watchedMatches.delete(matchId);
  matchResourceSnapshots.delete(matchId);
  const pending = pendingNotifies.get(matchId);
  if (pending) {
    clearTimeout(pending);
    pendingNotifies.delete(matchId);
  }
  return wasWatched;
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

/** `a`/`b` when the agent is that participant, else `spectator`. */
function youFor(snapshot: MatchResourceSnapshot): string {
  const same = (x: string): boolean => {
    try {
      return agentAddress !== "" && BigInt(x) === BigInt(agentAddress);
    } catch {
      return false;
    }
  };
  if (same(snapshot.player_a.address)) return "a";
  if (same(snapshot.player_b.address)) return "b";
  return "spectator";
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
        // Who the agent is to this event: act on "a"/"b", observe on
        // "spectator" — commits/reveals from a non-participant revert.
        you: youFor(snapshot),
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
