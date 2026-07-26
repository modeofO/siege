import { describe, it, expect, vi, afterEach } from "vitest";

import { startLivePoller } from "../live.js";
import {
  setAgentAddress,
  unwatchMatch,
  watchMatch,
  watchedMatches,
} from "../notify.js";
import type { StateClient } from "../state.js";

/**
 * Guards the poll-driven live pipeline that replaced the gRPC stream: the
 * poller only probes watched matches, only notifies when the activity probe
 * advances, and the watch lifecycle rules hold (finished matches are never
 * watched, a finishing match emits its final event and is then released,
 * unwatch clears all per-match residue).
 */

const noop = () => {};

afterEach(() => {
  for (const id of [...watchedMatches]) unwatchMatch(id);
  setAgentAddress("");
  vi.useRealTimers();
});

/** StateClient stand-in with a scriptable activity probe and match status. */
function fakeState(opts: { status?: () => string; activity?: () => string | null } = {}) {
  let probeCalls = 0;
  let snapshotCalls = 0;
  const status = opts.status ?? (() => "Active");
  const activity = opts.activity ?? (() => "t0");
  const state = {
    latestMatchActivity: async () => {
      probeCalls++;
      return activity();
    },
    matchState: async (matchId: number) => {
      snapshotCalls++;
      return {
        match_id: matchId,
        player_a: "0xa11ce",
        player_b: "0xb0b",
        vault_a_hp: 50,
        vault_b_hp: 40,
        current_round: 2,
        status: status(),
      };
    },
    nodeStates: async () => [],
    roundMoves: async () => {
      throw new Error("no round");
    },
    roundModifiers: async () => {
      throw new Error("no modifiers");
    },
    matchAbilities: async () => {
      throw new Error("no abilities");
    },
    matchStakes: async () => {
      throw new Error("no stakes");
    },
  } as unknown as StateClient;
  return { state, probeCalls: () => probeCalls, snapshotCalls: () => snapshotCalls };
}

function fakeServer() {
  const pushed: Array<{ method: string; params: { meta?: Record<string, string> } }> = [];
  const server = {
    server: {
      sendResourceUpdated: async () => {},
      notification: async (n: unknown) => {
        pushed.push(n as (typeof pushed)[number]);
      },
    },
  };
  return { server: server as never, pushed };
}

/** Debounce spy standing in for notifyMatchChanged, to isolate the poller. */
function notifySpy() {
  const calls: number[] = [];
  return { calls, fn: (_s: unknown, _st: unknown, matchId: number) => calls.push(matchId) };
}

describe("startLivePoller", () => {
  it("does not probe when the watch set is empty", async () => {
    vi.useFakeTimers();
    const { state, probeCalls } = fakeState();
    const { server } = fakeServer();
    const spy = notifySpy();

    const poller = startLivePoller({
      server,
      state,
      getWatched: () => [],
      notifyMatchChanged: spy.fn as never,
      log: noop,
      intervalMs: 100,
    });
    await vi.advanceTimersByTimeAsync(500);
    poller.stop();

    expect(probeCalls()).toBe(0);
    expect(spy.calls).toEqual([]);
  });

  it("notifies on first observation and again only when activity advances", async () => {
    vi.useFakeTimers();
    let activity = "t0";
    const { state, probeCalls } = fakeState({ activity: () => activity });
    const { server } = fakeServer();
    const spy = notifySpy();

    const poller = startLivePoller({
      server,
      state,
      getWatched: () => [7],
      notifyMatchChanged: spy.fn as never,
      log: noop,
      intervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(250); // ticks at 100, 200
    expect(spy.calls).toEqual([7]); // first observation notifies once

    await vi.advanceTimersByTimeAsync(300); // quiet ticks
    expect(spy.calls).toEqual([7]); // no change, no notify

    activity = "t1";
    await vi.advanceTimersByTimeAsync(100);
    expect(spy.calls).toEqual([7, 7]); // change → notify

    poller.stop();
    expect(probeCalls()).toBeGreaterThanOrEqual(6);
  });

  it("keeps ticking past a probe failure", async () => {
    vi.useFakeTimers();
    let fail = true;
    let activity = "t0";
    const base = fakeState({ activity: () => activity });
    const state = {
      ...base.state,
      latestMatchActivity: async () => {
        if (fail) throw new Error("torii down");
        return activity;
      },
    } as unknown as StateClient;
    const { server } = fakeServer();
    const spy = notifySpy();

    const poller = startLivePoller({
      server,
      state,
      getWatched: () => [3],
      notifyMatchChanged: spy.fn as never,
      log: noop,
      intervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(spy.calls).toEqual([]); // failures never notify

    fail = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(spy.calls).toEqual([3]); // loop survived and recovered

    poller.stop();
  });
});

describe("watch lifecycle", () => {
  it("refuses to watch a finished match", async () => {
    const { state } = fakeState({ status: () => "Finished" });
    watchMatch(state, 9);
    expect(watchedMatches.has(9)).toBe(true); // optimistic add
    await vi.waitFor(() => expect(watchedMatches.has(9)).toBe(false)); // seed sees Finished, backs out
  });

  it("emits the final event, then unwatches, when a watched match finishes", async () => {
    vi.useFakeTimers();
    let status = "Active";
    const { state } = fakeState({ status: () => status });
    const { server, pushed } = fakeServer();

    watchMatch(state, 5);
    await vi.advanceTimersByTimeAsync(50); // let the seed settle
    expect(watchedMatches.has(5)).toBe(true);

    status = "Finished";
    const { notifyMatchChanged } = await import("../notify.js");
    notifyMatchChanged(server, state, 5);
    await vi.advanceTimersByTimeAsync(200);

    const channelEvents = pushed.filter((p) => p.method === "notifications/claude/channel");
    expect(channelEvents.length).toBe(1); // the final event went out
    expect(watchedMatches.has(5)).toBe(false); // then the match was released
  });

  it("unwatch clears the snapshot so notifications stop firing", async () => {
    vi.useFakeTimers();
    const { state } = fakeState();
    const { server, pushed } = fakeServer();

    watchMatch(state, 4);
    await vi.advanceTimersByTimeAsync(50);
    expect(unwatchMatch(4)).toBe(true);
    expect(unwatchMatch(4)).toBe(false); // idempotent

    const { notifyMatchChanged } = await import("../notify.js");
    notifyMatchChanged(server, state, 4);
    await vi.advanceTimersByTimeAsync(200);
    // Snapshot was cleared: rebuild has no prior to diff against → no emit.
    expect(pushed.filter((p) => p.method === "notifications/claude/channel")).toEqual([]);
  });
});

describe("channel event `you` attribute", () => {
  async function eventAfterChange(agentAddr: string) {
    vi.useFakeTimers();
    let hp = 50;
    const state = fakeState().state as unknown as {
      matchState: (id: number) => Promise<Record<string, unknown>>;
    };
    const scripted = {
      ...state,
      matchState: async (matchId: number) => ({
        match_id: matchId,
        player_a: "0xa11ce",
        player_b: "0xb0b",
        vault_a_hp: hp,
        vault_b_hp: 40,
        current_round: 2,
        status: "Active",
      }),
      nodeStates: async () => [],
      roundMoves: async () => {
        throw new Error("no round");
      },
      roundModifiers: async () => {
        throw new Error("no modifiers");
      },
      matchAbilities: async () => {
        throw new Error("no abilities");
      },
      matchStakes: async () => {
        throw new Error("no stakes");
      },
    } as unknown as StateClient;
    const { server, pushed } = fakeServer();

    setAgentAddress(agentAddr);
    watchMatch(scripted, 6);
    await vi.advanceTimersByTimeAsync(50);

    hp = 44; // real delta so the diff emits
    const { notifyMatchChanged } = await import("../notify.js");
    notifyMatchChanged(server, scripted, 6);
    await vi.advanceTimersByTimeAsync(200);

    const event = pushed.find((p) => p.method === "notifications/claude/channel");
    return event?.params.meta?.you;
  }

  it("stamps 'a' when the agent is player_a (padding-insensitive)", async () => {
    expect(await eventAfterChange("0x0a11ce")).toBe("a");
  });

  it("stamps 'b' when the agent is player_b", async () => {
    expect(await eventAfterChange("0xb0b")).toBe("b");
  });

  it("stamps 'spectator' when the agent is neither player", async () => {
    expect(await eventAfterChange("0xdead")).toBe("spectator");
  });
});
