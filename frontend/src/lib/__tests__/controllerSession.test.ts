import { describe, expect, it } from "vitest";
import type { AccountInterface } from "starknet";

import {
  resilientExecute,
  isSponsorshipOutage,
  SponsorshipUnavailableError,
} from "../controllerSession";

// Fabricate a Controller-connected account whose keychain.execute always
// rejects with the given message, counting attempts.
function controllerAccount(message: string) {
  const state = { attempts: 0, manualOpened: false };
  const account = {
    walletProvider: {
      id: "controller",
      keychain: {
        execute: async () => {
          state.attempts += 1;
          return { code: "ERROR", message };
        },
      },
      openExecute: async () => {
        state.manualOpened = true;
        return { status: true, transactionHash: "0x1" };
      },
    },
  } as unknown as AccountInterface;
  return { account, state };
}

describe("isSponsorshipOutage", () => {
  it("matches the circuit breaker message", () => {
    expect(isSponsorshipOutage(new Error("AVNU service temporarily unavailable (circuit breaker open)"))).toBe(true);
  });

  it("matches the service-not-available message", () => {
    expect(
      isSponsorshipOutage({
        message: "AVNU sponsorship failed: JSON-RPC error 163: An error occurred (UNKNOWN_ERROR) (data: service not available)",
      }),
    ).toBe(true);
  });

  it("does not match ordinary reverts", () => {
    expect(isSponsorshipOutage(new Error("already committed"))).toBe(false);
  });
});

describe("resilientExecute during a sponsorship outage", () => {
  it("fails fast without a CREDITS retry or the manual Controller window", async () => {
    const { account, state } = controllerAccount(
      "AVNU service temporarily unavailable (circuit breaker open)",
    );

    await expect(
      resilientExecute(account, { contractAddress: "0x1", entrypoint: "commit", calldata: [] }),
    ).rejects.toBeInstanceOf(SponsorshipUnavailableError);

    // One PAYMASTER attempt only — retrying feeds the breaker, and the manual
    // window must never open for an infrastructure outage.
    expect(state.attempts).toBe(1);
    expect(state.manualOpened).toBe(false);
  });

  it("still opens the manual window for non-outage infra failures", async () => {
    const { account, state } = controllerAccount(
      "AVNU self-funded should be executed via paymaster RPC directly",
    );

    const result = await resilientExecute(account, {
      contractAddress: "0x1",
      entrypoint: "commit",
      calldata: [],
    });

    expect(result.transaction_hash).toBe("0x1");
    expect(state.attempts).toBe(2); // PAYMASTER then CREDITS
    expect(state.manualOpened).toBe(true);
  });
});
