import { describe, it, expect, vi } from "vitest";

import { notifyMatchChanged } from "../notify.js";
import type { StateClient } from "../state.js";

/**
 * Guards the debounce added to the live-update path. A single `resolve_round`
 * produces ~5 Torii entity pushes for one logical transition; rebuilding the
 * snapshot per push meant five full SQL fan-outs. These tests pin the two
 * properties that matter: a burst collapses to one rebuild, and distinct
 * matches never share a timer.
 */

const MATCH_ID = 7;

/** Minimal StateClient stand-in — every read buildMatchResourceSnapshot makes. */
function fakeState(): { state: StateClient; calls: () => number } {
  let matchStateCalls = 0;
  const state = {
    matchState: async (matchId: number) => {
      matchStateCalls++;
      return {
        match_id: matchId,
        player_a: "0x1",
        player_b: "0x2",
        vault_a_hp: 50,
        vault_b_hp: 50,
        current_round: 1,
        status: "Active" as const,
      };
    },
    nodeStates: async () => [
      { match_id: MATCH_ID, node_index: 0, owner: "None" as const },
      { match_id: MATCH_ID, node_index: 1, owner: "None" as const },
      { match_id: MATCH_ID, node_index: 2, owner: "None" as const },
    ],
    roundMoves: async () => {
      throw new Error("no round yet");
    },
    roundModifiers: async () => {
      throw new Error("no modifiers yet");
    },
    matchAbilities: async () => {
      throw new Error("no abilities");
    },
    matchStakes: async () => {
      throw new Error("no stakes");
    },
  } as unknown as StateClient;
  return { state, calls: () => matchStateCalls };
}

/** Minimal McpServer stand-in — only the notification surface is exercised. */
function fakeServer() {
  const pushed: unknown[] = [];
  const server = {
    server: {
      sendResourceUpdated: async () => {},
      notification: async (n: unknown) => {
        pushed.push(n);
      },
    },
  };
  return { server: server as never, pushed };
}

describe("notifyMatchChanged debounce", () => {
  it("collapses a burst of entity pushes into a single snapshot rebuild", async () => {
    vi.useFakeTimers();
    try {
      const { state, calls } = fakeState();
      const { server } = fakeServer();

      // Five pushes, as one resolve_round would produce.
      for (let i = 0; i < 5; i++) notifyMatchChanged(server, state, MATCH_ID);

      expect(calls()).toBe(0); // nothing runs synchronously

      await vi.advanceTimersByTimeAsync(200);
      expect(calls()).toBe(1); // one rebuild, not five
    } finally {
      vi.useRealTimers();
    }
  });

  it("still fires after the quiet period rather than dropping the update", async () => {
    vi.useFakeTimers();
    try {
      const { state, calls } = fakeState();
      const { server } = fakeServer();

      notifyMatchChanged(server, state, MATCH_ID);
      await vi.advanceTimersByTimeAsync(200);
      expect(calls()).toBe(1);

      // A later, separate burst is its own rebuild.
      notifyMatchChanged(server, state, MATCH_ID);
      await vi.advanceTimersByTimeAsync(200);
      expect(calls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate matches on independent timers", async () => {
    vi.useFakeTimers();
    try {
      const { state, calls } = fakeState();
      const { server } = fakeServer();

      notifyMatchChanged(server, state, 1);
      notifyMatchChanged(server, state, 2);
      notifyMatchChanged(server, state, 3);

      await vi.advanceTimersByTimeAsync(200);
      expect(calls()).toBe(3); // one per match, none coalesced away
    } finally {
      vi.useRealTimers();
    }
  });
});
