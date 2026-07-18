import { describe, expect, it } from "vitest";
import type { AccountInterface } from "starknet";

import { CONTRACTS_1V1, VRF_PROVIDER_ADDRESS, resolveRound1v1, forceTimeout1v1 } from "../contracts1v1";

function mockAccount(executes: unknown[], failFirst = false): AccountInterface {
  let calls = 0;
  return {
    address: "0xplayer",
    execute: async (payload: unknown) => {
      executes.push(payload);
      calls += 1;
      if (failFirst && calls === 1) throw new Error("Transaction execution error");
      return { transaction_hash: "0x1" };
    },
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", isSuccess: () => true }),
    getTransactionReceipt: async () => ({ execution_status: "SUCCEEDED", isSuccess: () => true }),
  } as unknown as AccountInterface;
}

describe("resolveRound1v1", () => {
  it("sends the VRF-wrapped multicall FIRST — the contract's SafeDispatcher fallback means an unwrapped resolve silently rolls all-Normal modifiers instead of reverting", async () => {
    const executes: unknown[] = [];
    await resolveRound1v1(mockAccount(executes), "7");

    expect(executes).toHaveLength(1);
    const calls = executes[0] as Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;
    expect(Array.isArray(calls)).toBe(true);
    expect(calls[0]).toEqual({
      contractAddress: VRF_PROVIDER_ADDRESS,
      entrypoint: "request_random",
      calldata: [CONTRACTS_1V1.RESOLUTION, "0", CONTRACTS_1V1.RESOLUTION],
    });
    expect(calls[1]).toEqual({
      contractAddress: CONTRACTS_1V1.RESOLUTION,
      entrypoint: "resolve_round",
      calldata: ["7"],
    });
  });

  it("falls back to a bare resolve when the wrapped call fails (match-ending round skips consume_random, reverting the wrap)", async () => {
    const executes: unknown[] = [];
    await resolveRound1v1(mockAccount(executes, true), "7");

    expect(executes).toHaveLength(2);
    const bare = executes[1] as { contractAddress: string; entrypoint: string; calldata: string[] };
    expect(Array.isArray(bare)).toBe(false);
    expect(bare.entrypoint).toBe("resolve_round");
    expect(bare.contractAddress).toBe(CONTRACTS_1V1.RESOLUTION);
  });
});

describe("forceTimeout1v1", () => {
  it("wraps the reveal-phase timeout in the VRF sandwich — request_random, a direct resolution_1v1 view call to key the seed, then force_timeout", async () => {
    const executes: unknown[] = [];
    await forceTimeout1v1(mockAccount(executes), "7", true);

    expect(executes).toHaveLength(1);
    const calls = executes[0] as Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;
    expect(Array.isArray(calls)).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      contractAddress: VRF_PROVIDER_ADDRESS,
      entrypoint: "request_random",
      calldata: [CONTRACTS_1V1.RESOLUTION, "0", CONTRACTS_1V1.RESOLUTION],
    });
    // Harmless direct view call keys the VRF seed to the nested consumer.
    expect(calls[1]).toEqual({
      contractAddress: CONTRACTS_1V1.RESOLUTION,
      entrypoint: "dojo_name",
      calldata: [],
    });
    expect(calls[2]).toEqual({
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "force_timeout",
      calldata: ["7"],
    });
  });

  it("sends a bare force_timeout (no VRF) for commit-phase / zero-commit timeouts", async () => {
    const executes: unknown[] = [];
    await forceTimeout1v1(mockAccount(executes), "7", false);

    expect(executes).toHaveLength(1);
    const call = executes[0] as { contractAddress: string; entrypoint: string; calldata: string[] };
    expect(Array.isArray(call)).toBe(false);
    expect(call).toEqual({
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "force_timeout",
      calldata: ["7"],
    });
  });

  it("falls back to a bare force_timeout when the VRF-wrapped reveal timeout fails (match-ending resolve skips consume_random)", async () => {
    const executes: unknown[] = [];
    await forceTimeout1v1(mockAccount(executes, true), "7", true);

    expect(executes).toHaveLength(2);
    const bare = executes[1] as { contractAddress: string; entrypoint: string; calldata: string[] };
    expect(Array.isArray(bare)).toBe(false);
    expect(bare.entrypoint).toBe("force_timeout");
    expect(bare.contractAddress).toBe(CONTRACTS_1V1.COMMIT_REVEAL);
  });
});
