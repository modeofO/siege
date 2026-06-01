import { afterEach, describe, expect, it, vi } from "vitest";

describe("contract addresses", () => {
  const originalNetwork = process.env.NEXT_PUBLIC_NETWORK;
  const originalActions = process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS;

  afterEach(() => {
    vi.resetModules();
    if (originalNetwork === undefined) delete process.env.NEXT_PUBLIC_NETWORK;
    else process.env.NEXT_PUBLIC_NETWORK = originalNetwork;
    if (originalActions === undefined) delete process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS;
    else process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS = originalActions;
  });

  it("uses the Sepolia manifest over stale env contract addresses", async () => {
    process.env.NEXT_PUBLIC_NETWORK = "sepolia";
    process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS = "0x123";
    vi.resetModules();

    const addresses = await import("../contractAddresses");
    const manifest = await import("../../manifests/manifest_sepolia.json");
    const actions = manifest.default.contracts.find((contract) => contract.tag === "siege_dojo-actions_1v1");

    expect(addresses.ACTIONS_1V1_ADDRESS).toBe(actions?.address);
    expect(addresses.ACTIONS_1V1_ADDRESS).not.toBe("0x123");
  });
});
