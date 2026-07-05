import { describe, expect, it } from "vitest";
import {
  PALETTE,
  citadelPosition,
  formationSlots,
  gatePosition,
  nodePosition,
} from "../layout";

describe("PALETTE", () => {
  it("exposes the shared visual-language hex values", () => {
    expect(PALETTE.parchment).toBe("#d8c9a3");
    expect(PALETTE.wood).toBe("#3a2b1c");
    expect(PALETTE.pewter).toBe("#8a8a92");
    expect(PALETTE.playerGold).toBe("#c8a44e");
    expect(PALETTE.enemyCrimson).toBe("#8e2f38");
    expect(PALETTE.attack).toBe("#ff8800");
    expect(PALETTE.defense).toBe("#6b8cae");
    expect(PALETTE.repair).toBe("#66cc66");
    expect(PALETTE.trap).toBe("#ff3344");
    expect(PALETTE.holo).toBe("#59d8e6");
    expect(PALETTE.candle).toBe("#ffb35c");
  });
});

describe("gatePosition", () => {
  it("maps the 2D East/Under/West order (0/2/1) to left/center/right", () => {
    expect(gatePosition(0)).toEqual([-2.5, 0, 0]);
    expect(gatePosition(2)).toEqual([0, 0, 0]);
    expect(gatePosition(1)).toEqual([2.5, 0, 0]);
  });
});

describe("nodePosition", () => {
  it("sits directly behind its gate at z = -0.8", () => {
    expect(nodePosition(0)).toEqual([-2.5, 0, -0.8]);
    expect(nodePosition(2)).toEqual([0, 0, -0.8]);
    expect(nodePosition(1)).toEqual([2.5, 0, -0.8]);
  });
});

describe("citadelPosition", () => {
  it("places player at +Z and enemy at -Z", () => {
    expect(citadelPosition("player")).toEqual([0, 0, 2.4]);
    expect(citadelPosition("enemy")).toEqual([0, 0, -2.4]);
  });
});

describe("formationSlots", () => {
  it("returns an empty array for n = 0", () => {
    expect(formationSlots([0, 0, 0], 0, -1)).toEqual([]);
  });

  it("lays out n = 5 as a full rank of 4 plus a centered second rank", () => {
    const slots = formationSlots([0, 0, 0], 5, -1);
    expect(slots).toHaveLength(5);

    // Rank 0: 4 pieces, spacing 0.18, centered on anchor x, at anchor z.
    const rank0 = slots.slice(0, 4);
    for (const [, , z] of rank0) expect(z).toBeCloseTo(0, 9);
    expect(rank0.map(([x]) => x)).toEqual([-0.27, -0.09, 0.09, 0.27].map((v) => expect.closeTo(v, 9)));

    // Rank 1: 1 piece, centered on anchor x, stepped 0.18 AWAY along facing (-Z).
    const [x4, , z4] = slots[4];
    expect(x4).toBeCloseTo(0, 9);
    expect(z4).toBeCloseTo(-0.18, 9);
  });

  it("steps ranks toward +Z when facing = 1 (enemy side)", () => {
    const slots = formationSlots([0, 0, 0], 5, 1);
    expect(slots[4][2]).toBeCloseTo(0.18, 9);
  });

  it("centers every rank's x mean on the anchor x", () => {
    const anchor: [number, number, number] = [1.3, 0, 0];
    const slots = formationSlots(anchor, 7, -1);
    const meanX = slots.reduce((s, [x]) => s + x, 0) / slots.length;
    expect(meanX).toBeCloseTo(anchor[0], 9);
  });

  it("preserves the anchor y for every slot", () => {
    const slots = formationSlots([0, 0.5, 0], 6, -1);
    for (const [, y] of slots) expect(y).toBeCloseTo(0.5, 9);
  });

  it("uses a custom spacing when provided (shield-wall 0.14)", () => {
    const slots = formationSlots([0, 0, 0], 4, -1, 0.14);
    expect(slots.map(([x]) => x)).toEqual([-0.21, -0.07, 0.07, 0.21].map((v) => expect.closeTo(v, 9)));

    // Second rank steps by the custom spacing along facing, not the 0.18 default.
    const slots5 = formationSlots([0, 0, 0], 5, -1, 0.14);
    expect(slots5[4][2]).toBeCloseTo(-0.14, 9);
  });

  it("defaults spacing to 0.18 when the argument is omitted", () => {
    expect(formationSlots([0, 0, 0], 2, -1)).toEqual(formationSlots([0, 0, 0], 2, -1, 0.18));
  });

  it("produces unique slot positions", () => {
    for (const facing of [1, -1] as const) {
      for (let n = 1; n <= 12; n++) {
        const slots = formationSlots([0.4, 0, -0.3], n, facing);
        const keys = new Set(slots.map(([x, y, z]) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`));
        expect(keys.size).toBe(n);
      }
    }
  });
});
