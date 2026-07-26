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

  // Regression: ENTRY_TOKEN_CAPS was mainnet-only, so the katana session carried
  // queue_for_match but no ERC-20 approve policy. Queueing then could never be
  // covered by the session — the keychain looped on USER_INTERACTION_REQUIRED
  // and the client threw "not approved for the ranked match call set".
  //
  // The invariant: a network whose manifest has matchmaking can queue, and
  // queueing needs an approve policy, so the caps list must not be empty.
  for (const network of ["mainnet", "katana"] as const) {
    it(`has entry-token approve caps wherever matchmaking is deployed (${network})`, async () => {
      process.env.NEXT_PUBLIC_NETWORK = network;
      vi.resetModules();

      const addresses = await import("../contractAddresses");
      if (!addresses.MATCHMAKING_ADDRESS) return; // no queue on this network yet

      expect(addresses.ENTRY_TOKEN_CAPS.length).toBeGreaterThan(0);
      for (const { address, cap } of addresses.ENTRY_TOKEN_CAPS) {
        expect(address).toMatch(/^0x[0-9a-f]+$/i);
        expect(BigInt(cap)).toBeGreaterThan(BigInt(0));
      }
    });
  }
});
