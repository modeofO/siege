import { describe, test, expect, afterEach, vi } from "vitest";

// network.ts resolves the active network once, at module load, so every case
// here has to re-import the module with the environment already in place.
async function loadNetwork(opts: { build?: string; stored?: string | null }) {
  vi.resetModules();
  if (opts.build === undefined) {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", opts.build);
  }

  const store = new Map<string, string>();
  if (opts.stored != null) store.set("siege:network", opts.stored);

  // node environment has no window; network.ts treats its absence as "server".
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };

  return import("../network");
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { window?: unknown }).window;
});

describe("network resolution", () => {
  test("falls back to the build network when nothing is stored", async () => {
    const net = await loadNetwork({ build: "mainnet", stored: null });
    expect(net.NETWORK).toBe("mainnet");
    expect(net.BUILD_NETWORK).toBe("mainnet");
    expect(net.NETWORK_OVERRIDDEN).toBe(false);
  });

  test("a stored override wins over the build network", async () => {
    const net = await loadNetwork({ build: "mainnet", stored: "katana" });
    expect(net.NETWORK).toBe("katana");
    expect(net.BUILD_NETWORK).toBe("mainnet");
    expect(net.NETWORK_OVERRIDDEN).toBe(true);
    expect(net.IS_KATANA).toBe(true);
    expect(net.IS_MAINNET).toBe(false);
  });

  test("override works in the other direction too", async () => {
    const net = await loadNetwork({ build: "katana", stored: "mainnet" });
    expect(net.NETWORK).toBe("mainnet");
    expect(net.IS_MAINNET).toBe(true);
    expect(net.IS_TEST_NETWORK).toBe(false);
  });

  test("an unrecognised stored value is ignored", async () => {
    const net = await loadNetwork({ build: "mainnet", stored: "not-a-network" });
    expect(net.NETWORK).toBe("mainnet");
    expect(net.NETWORK_OVERRIDDEN).toBe(false);
  });

  test("a non-switchable stored value is ignored", async () => {
    // sepolia is parked and devnet is localhost — neither is a valid destination.
    const net = await loadNetwork({ build: "mainnet", stored: "sepolia" });
    expect(net.NETWORK).toBe("mainnet");
  });

  test("devnet builds ignore overrides entirely", async () => {
    const net = await loadNetwork({ build: "devnet", stored: "mainnet" });
    expect(net.SWITCHING_ENABLED).toBe(false);
    expect(net.NETWORK).toBe("devnet");
    expect(net.NETWORK_OVERRIDDEN).toBe(false);
  });
});

describe("envPin", () => {
  test("passes per-deployment pins through when on the build network", async () => {
    const net = await loadNetwork({ build: "mainnet", stored: null });
    expect(net.envPin("https://torii.example")).toBe("https://torii.example");
  });

  test("drops per-deployment pins once switched", async () => {
    // The bug this guards: NEXT_PUBLIC_TORII_URL on the mainnet deployment
    // would otherwise keep pointing at the mainnet Torii after switching to
    // katana, loading one network's manifest against another's indexer.
    const net = await loadNetwork({ build: "mainnet", stored: "katana" });
    expect(net.envPin("https://torii-mainnet.example")).toBeUndefined();
  });
});

describe("endpoints follow the active network", () => {
  // Regression: toriiSql.ts and AskToriiChat read NEXT_PUBLIC_TORII_URL
  // directly, so the Torii SQL polling path — the default read path for world,
  // parcel and match data — kept hitting the build's own indexer after a
  // switch. The world rendered identically on both networks because it was the
  // same indexer. Endpoints must derive from NETWORK, never from the raw env.
  test("switching to katana moves Torii and RPC off the build's pins", async () => {
    vi.stubEnv("NEXT_PUBLIC_TORII_URL", "https://siege-torii-mainnet-production.up.railway.app");
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", "https://api.cartridge.gg/x/starknet/mainnet");
    const net = await loadNetwork({ build: "mainnet", stored: "katana" });
    expect(net.TORII_URL).toBe("https://siege-torii-katana-production.up.railway.app");
    expect(net.RPC_URL).toBe("https://siege-katana-production.up.railway.app");
    expect(net.CHAIN_ID).toBe("SIEGE");
  });

  test("switching to mainnet moves them off a katana build's pins", async () => {
    vi.stubEnv("NEXT_PUBLIC_TORII_URL", "https://siege-torii-katana-production.up.railway.app");
    vi.stubEnv("NEXT_PUBLIC_RPC_URL", "https://siege-katana-production.up.railway.app");
    const net = await loadNetwork({ build: "katana", stored: "mainnet" });
    expect(net.TORII_URL).toBe("https://siege-torii-mainnet-production.up.railway.app");
    expect(net.RPC_URL).toBe("https://api.cartridge.gg/x/starknet/mainnet");
    expect(net.CHAIN_ID).toBe("SN_MAIN");
  });

  test("without an override the deployment's pins still win", async () => {
    vi.stubEnv("NEXT_PUBLIC_TORII_URL", "https://custom-torii.example");
    const net = await loadNetwork({ build: "mainnet", stored: null });
    expect(net.TORII_URL).toBe("https://custom-torii.example");
  });
});

describe("test-network classification", () => {
  test("katana counts as a test network", async () => {
    const net = await loadNetwork({ build: "katana", stored: null });
    expect(net.IS_TEST_NETWORK).toBe(true);
    expect(net.NETWORK_LABEL).toBe("Practice");
  });

  test("mainnet does not", async () => {
    const net = await loadNetwork({ build: "mainnet", stored: null });
    expect(net.IS_TEST_NETWORK).toBe(false);
    expect(net.NETWORK_LABEL).toBe("Mainnet");
  });
});
