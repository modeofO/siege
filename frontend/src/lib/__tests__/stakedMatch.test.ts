import { describe, expect, it } from "vitest";
import type { AccountInterface } from "starknet";

import { CONTRACTS_WORLD, VRF_PROVIDER_ADDRESS } from "../contracts1v1";
import { createStakedMatch } from "../stakedMatch";

describe("createStakedMatch", () => {
  it("approves separately, then sends the VRF request keyed to world_system", async () => {
    const executes: unknown[] = [];
    const account = {
      execute: async (calls: unknown) => {
        executes.push(calls);
        return { transaction_hash: "0x1" };
      },
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED" }),
    } as unknown as AccountInterface;

    await createStakedMatch(account, "0xabc", [1, 2]);

    // First execute: standalone operator approval — the Cartridge paymaster
    // VRF wrapping requires request_random as call[0] of the game multicall,
    // so the approval cannot ride along.
    expect(executes).toHaveLength(2);
    const approval = executes[0] as { entrypoint: string; calldata: string[] };
    expect(approval.entrypoint).toBe("set_approval_for_all");
    expect(approval.calldata[0]).toBe(CONTRACTS_WORLD.WORLD_SYSTEM);

    // Second execute: [request_random keyed to world_system, create]. The VRF
    // server keys the seed to the contract called right after request_random,
    // and world_system is what consumes the randomness.
    const calls = executes[1] as Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;
    expect(Array.isArray(calls)).toBe(true);
    expect(CONTRACTS_WORLD.WORLD_SYSTEM).not.toBe("");
    expect(calls[0]).toEqual({
      contractAddress: VRF_PROVIDER_ADDRESS,
      entrypoint: "request_random",
      calldata: [CONTRACTS_WORLD.WORLD_SYSTEM, "0", CONTRACTS_WORLD.WORLD_SYSTEM],
    });
    expect(calls[1]).toEqual({
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "create_staked_match",
      calldata: ["0xabc", "2", "1", "2"],
    });
  });
});
