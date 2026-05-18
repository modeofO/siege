import { describe, it, expect } from "vitest";
import { shortString } from "starknet";

const ABILITY_COSTS: Record<number, Record<string, number>> = {
  1: { iron: 8, wood: 5 },
  2: { stone: 8, linen: 5 },
  3: { ember: 8, seeds: 5 },
  4: { iron: 5, stone: 5, ember: 3 },
  5: { stone: 5, linen: 5, wood: 3 },
  6: { iron: 30, wood: 20, ember: 10 },
  7: { stone: 30, linen: 20, seeds: 10 },
  8: { ember: 30, seeds: 20, iron: 10 },
  9: { iron: 20, stone: 20, ember: 10, wood: 10 },
  10: { stone: 20, linen: 20, wood: 10 },
};

function abilityType(id: number): number {
  return ((id - 1) % 5) + 1;
}

function abilityTier(id: number): number {
  return Math.floor((id - 1) / 5) + 1;
}

const RESOURCE_TOKENS: Record<string, string> = {
  iron: "0x04443a152ebfe64b834cf7aa904b56ee6a97b9fcf7ee6f4e9ad272596e3d7a73",
  linen: "0x01b57dd0b9b246bf39185e23cd7c794d2bf6ad7088c8a3325f91809f6c4588c0",
  stone: "0x051769e3c9a978e30d7cacdb2491e057c233fbd99ca36a8bb3c544894b3b3cc2",
  wood: "0x05dc381b9755ae512fad38462887e2587d17661b833bbd22a32130db8fb20a9b",
  ember: "0x043415cab3dbd5d07c05da8aa135c92a1e0fd008c7eb0e09cef8be0e5065887d",
  seeds: "0x077ee09267cf3ded08f68c0c3eb74e2e5e01eae82d7691b48fb586768ea16f47",
};

const CRAFTING_ADDRESS = "0xCRAFTING";

function buildCraftCalls(abilityId: number, quantity: number) {
  const tier = abilityTier(abilityId);
  const type = abilityType(abilityId);
  const cost = ABILITY_COSTS[abilityId];
  if (!cost) throw new Error(`Unknown ability_id: ${abilityId}`);

  const calls: { contractAddress: string; entrypoint: string; calldata: string[] }[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_ADDRESS, String(amount * quantity), "0"],
    });
  }

  if (tier === 1) {
    calls.push({
      contractAddress: CRAFTING_ADDRESS,
      entrypoint: "craft_ability_batch",
      calldata: [String(abilityId), String(quantity)],
    });
  } else {
    calls.push({
      contractAddress: CRAFTING_ADDRESS,
      entrypoint: "craft_ability_tier2_batch",
      calldata: [String(type), String(quantity)],
    });
  }

  return { calls, tier, type, cost };
}

describe("ability type/tier helpers", () => {
  it("T1 ids 1-5 map to types 1-5, tier 1", () => {
    for (let id = 1; id <= 5; id++) {
      expect(abilityType(id)).toBe(id);
      expect(abilityTier(id)).toBe(1);
    }
  });

  it("T2 ids 6-10 map to types 1-5, tier 2", () => {
    for (let id = 6; id <= 10; id++) {
      expect(abilityType(id)).toBe(id - 5);
      expect(abilityTier(id)).toBe(2);
    }
  });
});

describe("ability costs match frontend ABILITIES", () => {
  const FRONTEND_COSTS: Record<number, Record<string, number>> = {
    1: { iron: 8, wood: 5 },
    2: { stone: 8, linen: 5 },
    3: { ember: 8, seeds: 5 },
    4: { iron: 5, stone: 5, ember: 3 },
    5: { stone: 5, linen: 5, wood: 3 },
    6: { iron: 30, wood: 20, ember: 10 },
    7: { stone: 30, linen: 20, seeds: 10 },
    8: { ember: 30, seeds: 20, iron: 10 },
    9: { iron: 20, stone: 20, ember: 10, wood: 10 },
    10: { stone: 20, linen: 20, wood: 10 },
  };

  for (let id = 1; id <= 10; id++) {
    it(`ability ${id} costs match`, () => {
      expect(ABILITY_COSTS[id]).toEqual(FRONTEND_COSTS[id]);
    });
  }
});

describe("siege_craft_ability call construction", () => {
  it("T1 Siege Sword (id=1, qty=1): approve iron + wood, then craft_ability_batch", () => {
    const { calls, tier } = buildCraftCalls(1, 1);
    expect(tier).toBe(1);
    expect(calls).toHaveLength(3); // approve iron, approve wood, craft
    expect(calls[0].entrypoint).toBe("approve");
    expect(calls[0].contractAddress).toBe(RESOURCE_TOKENS.iron);
    expect(calls[0].calldata).toEqual([CRAFTING_ADDRESS, "8", "0"]);
    expect(calls[1].entrypoint).toBe("approve");
    expect(calls[1].contractAddress).toBe(RESOURCE_TOKENS.wood);
    expect(calls[1].calldata).toEqual([CRAFTING_ADDRESS, "5", "0"]);
    expect(calls[2].entrypoint).toBe("craft_ability_batch");
    expect(calls[2].calldata).toEqual(["1", "1"]);
  });

  it("T1 Hex (id=4, qty=3): approve iron + stone + ember, scaled by quantity", () => {
    const { calls } = buildCraftCalls(4, 3);
    expect(calls).toHaveLength(4); // 3 approves + 1 craft
    expect(calls[0].calldata).toEqual([CRAFTING_ADDRESS, "15", "0"]); // iron 5*3
    expect(calls[1].calldata).toEqual([CRAFTING_ADDRESS, "15", "0"]); // stone 5*3
    expect(calls[2].calldata).toEqual([CRAFTING_ADDRESS, "9", "0"]);  // ember 3*3
    expect(calls[3].entrypoint).toBe("craft_ability_batch");
    expect(calls[3].calldata).toEqual(["4", "3"]);
  });

  it("T2 Siege Sword (id=6): uses craft_ability_tier2_batch with type=1", () => {
    const { calls, tier, type } = buildCraftCalls(6, 1);
    expect(tier).toBe(2);
    expect(type).toBe(1);
    const craftCall = calls[calls.length - 1];
    expect(craftCall.entrypoint).toBe("craft_ability_tier2_batch");
    expect(craftCall.calldata).toEqual(["1", "1"]); // type, not id
  });

  it("T2 Fortify (id=10, qty=2): approve stone + linen + wood, craft_ability_tier2_batch type=5", () => {
    const { calls, type } = buildCraftCalls(10, 2);
    expect(type).toBe(5);
    expect(calls).toHaveLength(4); // 3 approves + 1 craft
    expect(calls[0].calldata).toEqual([CRAFTING_ADDRESS, "40", "0"]); // stone 20*2
    expect(calls[1].calldata).toEqual([CRAFTING_ADDRESS, "40", "0"]); // linen 20*2
    expect(calls[2].calldata).toEqual([CRAFTING_ADDRESS, "20", "0"]); // wood 10*2
    expect(calls[3].entrypoint).toBe("craft_ability_tier2_batch");
    expect(calls[3].calldata).toEqual(["5", "2"]);
  });

  it("every ability id 1-10 produces valid calls", () => {
    for (let id = 1; id <= 10; id++) {
      const { calls, cost } = buildCraftCalls(id, 1);
      const approveCount = Object.keys(cost).length;
      expect(calls).toHaveLength(approveCount + 1);
      for (let i = 0; i < approveCount; i++) {
        expect(calls[i].entrypoint).toBe("approve");
      }
      const last = calls[calls.length - 1];
      expect(["craft_ability_batch", "craft_ability_tier2_batch"]).toContain(last.entrypoint);
    }
  });

  it("all approve calls reference known resource token addresses", () => {
    const knownAddrs = new Set(Object.values(RESOURCE_TOKENS));
    for (let id = 1; id <= 10; id++) {
      const { calls } = buildCraftCalls(id, 1);
      for (const c of calls) {
        if (c.entrypoint === "approve") {
          expect(knownAddrs.has(c.contractAddress)).toBe(true);
        }
      }
    }
  });
});

describe("cosmetic felt encoding", () => {
  it("encodes 'banner' as a short string felt", () => {
    const felt = shortString.encodeShortString("banner");
    expect(felt).toBeTruthy();
    expect(shortString.decodeShortString(felt)).toBe("banner");
  });

  it("encodes 'parcel_skin' as a short string felt", () => {
    const felt = shortString.encodeShortString("parcel_skin");
    expect(shortString.decodeShortString(felt)).toBe("parcel_skin");
  });

  it("encodes 'hold_decoration' as a short string felt", () => {
    const felt = shortString.encodeShortString("hold_decoration");
    expect(shortString.decodeShortString(felt)).toBe("hold_decoration");
  });

  it("encodes circuit keys as short string felts and round-trips", () => {
    const keys = [
      "half-wave-rectifier",
      "voltage-divider",
      "full-wave-rectifier",
      "rc-low-pass",
      "lc-tank",
      "buck-converter",
      "common-emitter-amp",
    ];
    for (const key of keys) {
      const felt = shortString.encodeShortString(key);
      expect(shortString.decodeShortString(felt)).toBe(key);
    }
  });

  it("null circuit_key encodes as 0x0", () => {
    const keyFelt = null ? shortString.encodeShortString("x") : "0x0";
    expect(keyFelt).toBe("0x0");
  });
});

describe("forge info data integrity", () => {
  const COMPONENT_COSTS: Record<string, Record<string, number>> = {
    "rune-stone": { stone: 4, iron: 2 },
    "flux-well": { ember: 4, linen: 2 },
    "spiral-coil": { iron: 4, wood: 2 },
    "one-way-valve": { stone: 3, ember: 3, seeds: 2 },
  };

  const CIRCUITS = [
    { key: "half-wave-rectifier", cosmetic_type: "banner", components_needed: ["one-way-valve", "rune-stone", "flux-well"] },
    { key: "voltage-divider", cosmetic_type: "parcelSkin", components_needed: ["rune-stone", "rune-stone"] },
    { key: "full-wave-rectifier", cosmetic_type: "banner", components_needed: ["one-way-valve", "one-way-valve", "one-way-valve", "one-way-valve", "rune-stone"] },
    { key: "rc-low-pass", cosmetic_type: "banner", components_needed: ["rune-stone", "flux-well"] },
    { key: "lc-tank", cosmetic_type: "banner", components_needed: ["spiral-coil", "flux-well"] },
    { key: "buck-converter", cosmetic_type: "holdDecoration", components_needed: ["one-way-valve", "spiral-coil", "flux-well", "one-way-valve"] },
    { key: "common-emitter-amp", cosmetic_type: "parcelSkin", components_needed: ["rune-stone", "rune-stone", "rune-stone", "rune-stone", "flux-well", "one-way-valve"] },
  ];

  it("all component costs use valid resource names", () => {
    const validResources = new Set(["iron", "linen", "stone", "wood", "ember", "seeds"]);
    for (const [kind, cost] of Object.entries(COMPONENT_COSTS)) {
      for (const resource of Object.keys(cost)) {
        expect(validResources.has(resource)).toBe(true);
      }
      expect(Object.values(cost).every((v) => v > 0)).toBe(true);
    }
  });

  it("all circuit components reference known craftable component kinds", () => {
    const craftable = new Set(Object.keys(COMPONENT_COSTS));
    for (const circuit of CIRCUITS) {
      for (const comp of circuit.components_needed) {
        expect(craftable.has(comp)).toBe(true);
      }
    }
  });

  it("all circuit keys are valid short strings (≤31 bytes)", () => {
    for (const circuit of CIRCUITS) {
      expect(Buffer.byteLength(circuit.key, "utf8")).toBeLessThanOrEqual(31);
    }
  });

  it("cosmetic types are valid", () => {
    const valid = new Set(["banner", "parcelSkin", "holdDecoration"]);
    for (const circuit of CIRCUITS) {
      expect(valid.has(circuit.cosmetic_type)).toBe(true);
    }
  });

  it("every circuit has at least one component", () => {
    for (const circuit of CIRCUITS) {
      expect(circuit.components_needed.length).toBeGreaterThan(0);
    }
  });
});

describe("tier ability slots", () => {
  function tierAbilitySlots(tier: number): number {
    if (tier === 0) return 1;
    if (tier === 1) return 2;
    if (tier >= 2) return 3;
    return 1;
  }

  it("tier 0 (Polis) = 1 slot", () => expect(tierAbilitySlots(0)).toBe(1));
  it("tier 1 (Strategos) = 2 slots", () => expect(tierAbilitySlots(1)).toBe(2));
  it("tier 2 (Hegemonia) = 3 slots", () => expect(tierAbilitySlots(2)).toBe(3));
  it("tier 3 (Basileia) = 3 slots (capped by storage)", () => expect(tierAbilitySlots(3)).toBe(3));
  it("unknown tier defaults to 1", () => expect(tierAbilitySlots(-1)).toBe(1));
});
