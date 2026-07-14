import { describe, expect, it } from "vitest";
import type { AccountInterface } from "starknet";

import { VRF_PROVIDER_ADDRESS } from "../contracts1v1";
import { CONQUEST_ADDRESS, initiateConquest, getAttackability } from "../conquest";
import type { ParcelData } from "../worldState";

function parcel(overrides: Partial<ParcelData> = {}): ParcelData {
  return {
    parcelId: 0,
    col: 0,
    row: 0,
    parcelType: 0,
    owner: "0x0",
    isHome: false,
    ...overrides,
  };
}

const ME = "0xa";
const ENEMY = "0xb";
const ALLY = "0xc";

describe("initiateConquest", () => {
  it("sends [request_random keyed to conquest, initiate_conquest] with nothing between", async () => {
    const executes: unknown[] = [];
    const account = {
      execute: async (calls: unknown) => {
        executes.push(calls);
        return { transaction_hash: "0x1" };
      },
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED" }),
    } as unknown as AccountInterface;

    const result = await initiateConquest(account, 7, 3, 0, 2, 1, 0, 0, 1, 2);

    // Single multicall — ability operator approval is a separate call the modal
    // sends beforehand, never bundled with the VRF multicall.
    expect(executes).toHaveLength(1);
    const calls = executes[0] as Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;
    expect(Array.isArray(calls)).toBe(true);
    expect(CONQUEST_ADDRESS).not.toBe("");

    // The VRF server keys the seed to the contract called right after
    // request_random — conquest is what consumes the randomness.
    expect(calls[0]).toEqual({
      contractAddress: VRF_PROVIDER_ADDRESS,
      entrypoint: "request_random",
      calldata: [CONQUEST_ADDRESS, "0", CONQUEST_ADDRESS],
    });
    expect(calls[1]).toEqual({
      contractAddress: CONQUEST_ADDRESS,
      entrypoint: "initiate_conquest",
      calldata: ["7", "3", "0", "2", "1", "0", "0", "1", "2"],
    });

    expect(result.abilityConsumed).toBe(true);
  });

  it("flags abilityConsumed false when no ability is used", async () => {
    const account = {
      execute: async () => ({ transaction_hash: "0x1" }),
      waitForTransaction: async () => ({ execution_status: "SUCCEEDED" }),
    } as unknown as AccountInterface;

    const result = await initiateConquest(account, 7, 1, 0, 0, 0, 0, 0, 0, 0);
    expect(result.abilityConsumed).toBe(false);
  });
});

describe("getAttackability", () => {
  // My holding at (0,0); (1,0) is adjacent, (5,5) is far.
  const myParcels = [parcel({ parcelId: 1, col: 0, row: 0, owner: ME })];

  it("rejects unclaimed parcels", () => {
    const target = parcel({ parcelId: 2, col: 1, row: 0, owner: "0x0" });
    expect(getAttackability(target, myParcels, 0, {})).toEqual({
      attackable: false,
      reason: "Unclaimed territory",
    });
  });

  it("rejects the player's own parcels", () => {
    const target = myParcels[0];
    expect(getAttackability(target, myParcels, 0, {})).toEqual({
      attackable: false,
      reason: "Your own parcel",
    });
  });

  it("rejects home parcels", () => {
    const target = parcel({ parcelId: 3, col: 1, row: 0, owner: ENEMY, isHome: true });
    expect(getAttackability(target, myParcels, 0, {})).toEqual({
      attackable: false,
      reason: "Home parcels are protected",
    });
  });

  it("rejects faction allies", () => {
    const target = parcel({ parcelId: 4, col: 1, row: 0, owner: ALLY });
    expect(getAttackability(target, myParcels, 7, { "0xc": 7 })).toEqual({
      attackable: false,
      reason: "Faction ally",
    });
  });

  it("rejects non-adjacent parcels", () => {
    const target = parcel({ parcelId: 5, col: 5, row: 5, owner: ENEMY });
    expect(getAttackability(target, myParcels, 0, {})).toEqual({
      attackable: false,
      reason: "Not adjacent to your holdings",
    });
  });

  it("allows an adjacent, non-ally enemy parcel", () => {
    const target = parcel({ parcelId: 6, col: 1, row: 0, owner: ENEMY });
    expect(getAttackability(target, myParcels, 7, { "0xb": 3 })).toEqual({ attackable: true });
  });
});
