import { describe, expect, it } from "vitest";
import type { AccountInterface } from "starknet";

import { CONTRACTS_1V1, VRF_PROVIDER_ADDRESS } from "../contracts1v1";
import { createStakedMatch } from "../stakedMatch";

describe("createStakedMatch", () => {
  it("prefixes staked match creation with the VRF request", async () => {
    let capturedCalls: unknown;
    const account = {
      execute: async (calls: unknown) => {
        capturedCalls = calls;
        return { transaction_hash: "0x1" };
      },
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED" }),
    } as unknown as AccountInterface;

    await createStakedMatch(account, "0xabc", [1, 2]);

    expect(Array.isArray(capturedCalls)).toBe(true);
    const calls = capturedCalls as Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;

    expect(calls[0]).toEqual({
      contractAddress: VRF_PROVIDER_ADDRESS,
      entrypoint: "request_random",
      calldata: [CONTRACTS_1V1.ACTIONS, "0", CONTRACTS_1V1.ACTIONS],
    });
    expect(calls[1].entrypoint).toBe("set_approval_for_all");
    expect(calls[2]).toEqual({
      contractAddress: expect.any(String),
      entrypoint: "create_staked_match",
      calldata: ["0xabc", "2", "1", "2"],
    });
  });
});
