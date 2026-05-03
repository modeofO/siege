/**
 * Cartridge Controller session management.
 *
 * Maintains a singleton SessionProvider and exposes {@link getAccount} which
 * returns an authenticated WalletAccount. On first call (no persisted session)
 * the SDK prints an auth URL on console.log — we intercept and surface it via
 * the {@link onAuthUrl} callback so the MCP can return it as a tool error
 * instead of corrupting the JSON-RPC stream.
 */

import SessionProvider from "@cartridge/controller/session/node";
import { shortString, type WalletAccount } from "starknet";
import type { SiegeContracts } from "./config.js";
import { buildPolicies } from "./policies.js";

interface SessionConfig {
  rpcUrl: string;
  chainId: string;
  contracts: SiegeContracts;
  vrfAddress: string;
  abilityTokenAddress: string | null;
  basePath: string;
}

interface ConnectOptions {
  onAuthUrl?: (url: string) => void;
}

let provider: SessionProvider | null = null;

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000;

function getProvider(cfg: SessionConfig): SessionProvider {
  if (provider) return provider;

  const policies = buildPolicies(cfg.contracts, cfg.vrfAddress, cfg.abilityTokenAddress);

  // The WASM session expects chainId as a felt, not "SN_SEPOLIA".
  const chainIdFelt = shortString.encodeShortString(cfg.chainId);

  provider = new SessionProvider({
    rpc: cfg.rpcUrl,
    chainId: chainIdFelt,
    policies,
    basePath: cfg.basePath,
  });

  return provider;
}

/**
 * Connect to the Cartridge session, awaiting browser approval if needed.
 *
 * Returns immediately if a persisted session is valid. Otherwise the SDK
 * prints an auth URL — captured via {@link ConnectOptions.onAuthUrl} —
 * and this function polls every 3s until either the session is approved
 * or the 5-minute deadline is hit.
 */
export async function getAccount(
  cfg: SessionConfig,
  opts: ConnectOptions = {},
): Promise<WalletAccount> {
  // Intercept the SDK's stdout chatter so the auth URL never reaches stdout
  // (which belongs to the MCP JSON-RPC stream). We restore the originals
  // when this function returns.
  const originals = {
    log: console.log,
    info: console.info,
  };
  const captureUrls = (...args: any[]) => {
    const msg = args.map(String).join(" ");
    const urlMatch = msg.match(/https?:\/\/\S+/);
    if (urlMatch && opts.onAuthUrl) opts.onAuthUrl(urlMatch[0]);
    process.stderr.write(msg + "\n");
  };
  console.log = captureUrls;
  console.info = captureUrls;

  try {
    const p = getProvider(cfg);

    const first = await p.connect();
    if (first) return first;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const retry = await p.connect();
      if (retry) return retry;
    }

    throw new Error(
      "Session authorization timed out after 5 minutes. Restart the MCP server to get a fresh auth URL.",
    );
  } finally {
    console.log = originals.log;
    console.info = originals.info;
  }
}
