/**
 * Live match updates: a watch-scoped poller, not a gRPC stream.
 *
 * The previous implementation held one torii SubscribeEntities stream open.
 * Measured 2026-07-26: Railway's edge (hikari) kills an idle streaming
 * response after exactly 300 s (h2 gets RST_STREAM(CANCEL), h1 sockets are
 * terminated), torii's h2 PING keepalives do not traverse the edge's client
 * leg, and @dojoengine/torii-client 1.8.2 has no reconnect — so the first
 * quiet five minutes silently killed notifications for the life of the
 * process, while agent-prompt.md tells the agent to BLOCK waiting for them.
 *
 * The agent cannot perceive push latency anyway: channel events are delivered
 * at turn boundaries and the game's clocks are 300 s, so a poll tick is
 * invisible. What the agent absolutely can perceive is an event that never
 * arrives. Polling reads current SQL truth, so delivery is guaranteed — an
 * event can be one tick late but never lost.
 *
 * Cost model: strictly scoped to the watch set (usually one match — the one
 * the agent is playing). Each tick runs one cheap activity probe per watched
 * match ({@link StateClient.latestMatchActivity}); the full snapshot rebuild
 * and diff (notify.ts) run only when the probe advances. Empty watch set →
 * zero traffic; notify.ts guarantees every watch terminates when its match
 * finishes.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { StateClient } from "./state.js";

export const POLL_INTERVAL_MS = 5_000;

export interface LivePoller {
  stop: () => void;
}

export interface LivePollerStatus {
  watched: number[];
  last_tick_at: string | null;
  last_change_at: string | null;
}

interface StartLivePollerArgs {
  server: McpServer;
  state: StateClient;
  getWatched: () => number[];
  /** Debounced — safe to call every tick; errors are handled internally. */
  notifyMatchChanged: (server: McpServer, state: StateClient, matchId: number) => void;
  log: (message: string) => void;
  intervalMs?: number;
}

let lastTickAt: string | null = null;
let lastChangeAt: string | null = null;
const lastActivity = new Map<number, string | null>();

/** Liveness surface for siege_whoami — proves the pipeline is alive. */
export function livePollerStatus(getWatched: () => number[]): LivePollerStatus {
  return { watched: getWatched(), last_tick_at: lastTickAt, last_change_at: lastChangeAt };
}

export function startLivePoller({
  server,
  state,
  getWatched,
  notifyMatchChanged,
  log,
  intervalMs = POLL_INTERVAL_MS,
}: StartLivePollerArgs): LivePoller {
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    const watched = getWatched();

    // Prune probe memory for matches that were unwatched between ticks so a
    // later re-watch starts fresh.
    for (const id of lastActivity.keys()) {
      if (!watched.includes(id)) lastActivity.delete(id);
    }
    if (watched.length === 0) return;

    inFlight = true;
    lastTickAt = new Date().toISOString();
    try {
      for (const matchId of watched) {
        // Network read — one failed probe skips a tick, never kills the loop.
        try {
          const activity = await state.latestMatchActivity(matchId);
          const prev = lastActivity.get(matchId);
          lastActivity.set(matchId, activity);
          // First observation also notifies: it covers anything that happened
          // between the watch seed and the first tick. notify.ts diffs, so a
          // genuinely unchanged match emits nothing.
          if (prev === undefined || prev !== activity) {
            lastChangeAt = new Date().toISOString();
            notifyMatchChanged(server, state, matchId);
          }
        } catch (err) {
          log(`live poll probe failed for match ${matchId}: ${errorMessage(err)}`);
        }
      }
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  // Don't hold the event loop open at shutdown.
  timer.unref?.();
  log(`live match poller started (${intervalMs} ms tick, watch-scoped)`);

  return {
    stop: () => clearInterval(timer),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
