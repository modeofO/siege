import { describe, test, expect, beforeEach } from "vitest";
import {
  generateSalt,
  computeCommitment1v1,
  storeSalt1v1,
  getSalt1v1,
  storeMove1v1,
  getMove1v1,
  storeAbility1v1,
  getAbility1v1,
  clearCommitData1v1,
} from "../crypto";

describe("generateSalt", () => {
  test("returns hex string starting with 0x", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]+$/);
  });

  test("is 31 bytes (62 hex chars + 0x prefix)", () => {
    const salt = generateSalt();
    expect(salt.length).toBe(64); // "0x" + 62 hex chars
  });

  test("generates unique salts", () => {
    const salts = new Set(Array.from({ length: 10 }, () => generateSalt()));
    expect(salts.size).toBe(10);
  });
});

describe("computeCommitment1v1", () => {
  const commit = (salt: string, fields: number[]) =>
    computeCommitment1v1(
      salt,
      fields[0], fields[1], fields[2],
      fields[3], fields[4], fields[5],
      fields[6],
      fields[7], fields[8], fields[9],
      fields[10], fields[11], fields[12],
      fields[13], fields[14],
    );
  const baseMove = [5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  test("returns a felt hex string", () => {
    expect(commit("0xaaa", baseMove)).toMatch(/^0x[0-9a-f]+$/);
  });

  test("is deterministic for identical inputs", () => {
    expect(commit("0xaaa", baseMove)).toBe(commit("0xaaa", baseMove));
  });

  test("differs when salt differs", () => {
    expect(commit("0xaaa", baseMove)).not.toBe(commit("0xbbb", baseMove));
  });

  test("differs when any allocation differs", () => {
    const moved = [...baseMove];
    moved[14] = 1; // ability target
    expect(commit("0xaaa", baseMove)).not.toBe(commit("0xaaa", moved));
  });
});

describe("commit-reveal storage", () => {
  // vitest runs in the node environment, so localStorage has to be shimmed.
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  });

  // NEXT_PUBLIC_NETWORK is unset under vitest, so NETWORK resolves to "devnet".
  const NET = "devnet";

  test("keys are namespaced by network", () => {
    storeSalt1v1("14", 3, "0xsalt");
    expect(store.has(`siege_1v1_salt_${NET}_14_3`)).toBe(true);
    expect(store.has("siege_1v1_salt_14_3")).toBe(false);
  });

  test("salt, move and ability round-trip", () => {
    storeSalt1v1("14", 3, "0xsalt");
    storeMove1v1("14", 3, [1, 2, 3]);
    storeAbility1v1("14", 3, { abilityId: 7, abilityTarget: 2 });

    expect(getSalt1v1("14", 3)).toBe("0xsalt");
    expect(getMove1v1("14", 3)).toEqual([1, 2, 3]);
    expect(getAbility1v1("14", 3)).toEqual({ abilityId: 7, abilityTarget: 2 });
  });

  test("absent ability defaults to none rather than throwing", () => {
    expect(getAbility1v1("14", 3)).toEqual({ abilityId: 0, abilityTarget: 0 });
  });

  test("another network's entry for the same match id is not readable", () => {
    // The collision this namespacing exists to prevent: same match id, other chain.
    store.set("siege_1v1_salt_mainnet_14_3", "0xmainnet-salt");
    expect(getSalt1v1("14", 3)).toBeNull();
  });

  test("legacy un-namespaced entries are still readable", () => {
    store.set("siege_1v1_salt_14_3", "0xlegacy");
    store.set("siege_1v1_move_14_3", "[4,5,6]");
    store.set("siege_1v1_ability_14_3", '{"abilityId":1,"abilityTarget":0}');

    expect(getSalt1v1("14", 3)).toBe("0xlegacy");
    expect(getMove1v1("14", 3)).toEqual([4, 5, 6]);
    expect(getAbility1v1("14", 3)).toEqual({ abilityId: 1, abilityTarget: 0 });
  });

  test("namespaced entry wins over a legacy one", () => {
    store.set("siege_1v1_salt_14_3", "0xlegacy");
    storeSalt1v1("14", 3, "0xcurrent");
    expect(getSalt1v1("14", 3)).toBe("0xcurrent");
  });

  test("clear removes both namespaced and legacy entries", () => {
    storeSalt1v1("14", 3, "0xcurrent");
    storeMove1v1("14", 3, [1, 2, 3]);
    storeAbility1v1("14", 3, { abilityId: 7, abilityTarget: 2 });
    store.set("siege_1v1_salt_14_3", "0xlegacy");
    store.set("siege_1v1_move_14_3", "[4,5,6]");
    store.set("siege_1v1_ability_14_3", '{"abilityId":1,"abilityTarget":0}');

    clearCommitData1v1("14", 3);

    expect(store.size).toBe(0);
    expect(getSalt1v1("14", 3)).toBeNull();
    expect(getMove1v1("14", 3)).toBeNull();
  });
});
