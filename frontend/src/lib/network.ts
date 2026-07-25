// network.ts — the single source of truth for which network the app talks to.
//
// Resolution order: a player's saved override (localStorage), else the build's
// `NEXT_PUBLIC_NETWORK`. Each network still gets its own Vercel project, so the
// hostname sets the default; the override lets a player move between them from
// either host. This mirrors Realms/Blitz, where blitz.realms.world defaults to
// mainnet and dev.blitz.realms.world to slot, and both ship the same switcher.
//
// Switching ALWAYS goes through setNetwork(), which persists and then hard
// reloads. Nothing here supports swapping networks in place: contract
// addresses, the Torii client, and the Cartridge ControllerConnector are all
// built once at module scope, and a Cartridge session is scoped to one chain
// id. A reload rebuilds all of it correctly for free.
//
// Two things make cross-network play safe, and both must stay true:
//   1. crypto.ts namespaces commit salts by network. Match ids are sequential
//      per world and every network shares the same world address (same
//      `siege_dojo_v9` seed), so ids collide 1:1 — an un-namespaced salt from
//      a test match could overwrite the one for a real match and make it
//      impossible to reveal.
//   2. Nothing merges state across networks. Do not build a leaderboard, win
//      count, or achievement view that reads more than one Torii: progression
//      earned on the test chain must never count anywhere else.
//
// This module must stay dependency-free — sessionPolicies/contractAddresses
// import it, and anything it imported would land in that cycle.

export type Network = "devnet" | "katana" | "sepolia" | "mainnet";

const STORAGE_KEY = "siege:network";

/** The network this bundle was built for. Never changes at runtime. */
export const BUILD_NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "devnet") as Network;

// Only the two hosted networks are switchable. Devnet points at localhost and
// sepolia is parked (Cartridge's sepolia sponsorship is down), so offering
// either as a destination would strand the player on a dead chain.
export const SWITCHABLE_NETWORKS: Network[] = ["mainnet", "katana"];

/**
 * Whether this build offers the switcher at all. A local devnet build keeps
 * whatever `NEXT_PUBLIC_NETWORK` says — overriding it would point the app at
 * contracts the local chain has never heard of.
 */
export const SWITCHING_ENABLED = SWITCHABLE_NETWORKS.includes(BUILD_NETWORK);

function readStoredNetwork(): Network | null {
  if (typeof window === "undefined") return null;
  if (!SWITCHING_ENABLED) return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return SWITCHABLE_NETWORKS.includes(stored as Network) ? (stored as Network) : null;
  } catch {
    return null; // storage can be unavailable (privacy mode)
  }
}

/**
 * The active network. Resolved once, at module load — before React mounts and
 * before providers.tsx constructs the ControllerConnector, which is the only
 * point early enough to keep the connector, the manifest, and the Torii client
 * all pointing at the same chain.
 *
 * On the server this is always BUILD_NETWORK. Anything that *renders* the
 * network must therefore read it through useNetwork() rather than this
 * constant, or the markup will not match on hydration.
 */
export const NETWORK: Network = readStoredNetwork() ?? BUILD_NETWORK;

/**
 * True when a saved override moved us off the build's own network.
 *
 * Per-deployment env pins (NEXT_PUBLIC_TORII_URL, NEXT_PUBLIC_RPC_URL,
 * NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS) describe BUILD_NETWORK specifically, so
 * they must be ignored once we've switched — otherwise the app loads one
 * network's manifest while still talking to another's Torii and RPC.
 */
export const NETWORK_OVERRIDDEN = NETWORK !== BUILD_NETWORK;

/** A per-deployment env pin, or undefined once an override is active. */
export function envPin(value: string | undefined): string | undefined {
  return NETWORK_OVERRIDDEN ? undefined : value;
}

export const IS_DEVNET = NETWORK === "devnet";
export const IS_KATANA = NETWORK === "katana";
export const IS_MAINNET = NETWORK === "mainnet";
export const IS_SEPOLIA = NETWORK === "sepolia";

/** Networks where nothing is at stake and the chain itself is not trustworthy. */
export const IS_TEST_NETWORK = !IS_MAINNET;

export function networkLabel(network: Network): string {
  switch (network) {
    case "mainnet":
      return "Mainnet";
    case "katana":
      return "Practice";
    case "devnet":
      return "Local Devnet";
    case "sepolia":
      return "Sepolia";
  }
}

/** Player-facing name for the active network. */
export const NETWORK_LABEL = networkLabel(NETWORK);

// ---------- Endpoints ----------
//
// These live here rather than in dojoConfig so that every consumer resolves the
// same way. toriiSql.ts and AskToriiChat previously read NEXT_PUBLIC_TORII_URL
// directly, which meant the Torii SQL polling path — the default read path for
// world/parcel/match data — kept hitting the build's own indexer after a
// network switch, while the RPC correctly moved. The world looked identical on
// both networks because it was literally the same indexer.
//
// Deriving them needs only the network flags, so this module stays free of the
// manifest imports that would drag @dojoengine/core into every leaf importer.

// Hosted services run on Railway (Cartridge slot torii discontinued).
export const TORII_URL =
  envPin(process.env.NEXT_PUBLIC_TORII_URL) ||
  (IS_DEVNET
    ? "http://localhost:8080"
    : IS_KATANA
      ? "https://siege-torii-katana-production.up.railway.app"
      : IS_MAINNET
        ? "https://siege-torii-mainnet-production.up.railway.app"
        : "https://siege-torii-production-d1a1.up.railway.app");

export const RPC_URL =
  envPin(process.env.NEXT_PUBLIC_RPC_URL) ||
  (IS_DEVNET
    ? "http://localhost:5050"
    : IS_KATANA
      ? "https://siege-katana-production.up.railway.app"
      : IS_MAINNET
        ? "https://api.cartridge.gg/x/starknet/mainnet"
        : "https://api.cartridge.gg/x/starknet/sepolia");

export const CHAIN_ID = IS_DEVNET
  ? "KATANA"
  : IS_KATANA
    ? "SIEGE"
    : IS_MAINNET
      ? "SN_MAIN"
      : "SN_SEPOLIA";

// ---------- Switching ----------

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore needs a stable snapshot, so cache it and only replace the
// reference when the stored value actually changes. Returning a fresh value each
// call would loop React forever.
let snapshot: Network = NETWORK;

function getSnapshot(): Network {
  return snapshot;
}

// The server has no localStorage, so it always sees the build's network. React
// uses this for the SSR pass and reconciles on hydration without a mismatch.
function getServerSnapshot(): Network {
  return BUILD_NETWORK;
}

/**
 * Persist a network choice and reload onto it.
 *
 * The reload is the mechanism, not a shortcut: it is what rebuilds the
 * ControllerConnector, manifest selection, and Torii client against the new
 * chain. Returns without doing anything if the network is already active.
 */
export function setNetwork(network: Network) {
  if (!SWITCHING_ENABLED || !SWITCHABLE_NETWORKS.includes(network)) return;
  if (network === NETWORK) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, network);
  } catch {
    return; // no storage means the choice cannot survive the reload — don't do it
  }
  snapshot = network;
  listeners.forEach((listener) => listener());
  window.location.reload();
}

/** Subscribe/snapshot pair for useSyncExternalStore — see useNetwork(). */
export const networkStore = { subscribe, getSnapshot, getServerSnapshot };
