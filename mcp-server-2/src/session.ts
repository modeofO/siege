/**
 * Cartridge Controller session management.
 *
 * Maintains a singleton SessionProvider and exposes {@link getAccount} which
 * returns an authenticated WalletAccount. On first call (no persisted session)
 * the SDK prints an auth URL on console.log — we intercept and surface it via
 * the {@link onAuthUrl} callback so the MCP can return it as a tool error
 * instead of corrupting the JSON-RPC stream.
 */

import { chmodSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import SessionProvider from "@cartridge/controller/session/node";
import { Account, RpcProvider, shortString, type AccountInterface } from "starknet";
import type { ResourceTokenAddresses, SiegeContracts } from "./config.js";
import { buildPolicies } from "./policies.js";

/**
 * Restrict the session directory to the current user. The persisted
 * session.json holds the session private key in cleartext; without this it is
 * created world-readable (0644) and any local user could sign as the agent.
 * Best-effort — a chmod failure must not block a working session.
 */
function hardenSessionPerms(basePath: string): void {
  try {
    if (!existsSync(basePath)) return;
    chmodSync(basePath, 0o700);
    for (const name of readdirSync(basePath)) {
      const entry = join(basePath, name);
      if (statSync(entry).isFile()) chmodSync(entry, 0o600);
    }
  } catch {
    // non-fatal: perms are defense-in-depth, not required for correctness
  }
}

interface SessionConfig {
  rpcUrl: string;
  chainId: string;
  contracts: SiegeContracts;
  vrfAddress: string;
  abilityTokenAddress: string | null;
  resourceTokens: ResourceTokenAddresses;
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

  const policies = buildPolicies(cfg.contracts, cfg.vrfAddress, cfg.abilityTokenAddress, cfg.resourceTokens);

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
): Promise<AccountInterface> {
  // Raw-key mode: signs as a plain prefunded account (katana DevAgentAccount)
  // with no browser approval. Optional even on self-hosted chains — the
  // session flow below also works for custom chain ids (verified on katana
  // 2026-07-26): the keychain resolves the appchain from the rpc_url embedded
  // in the auth URL, same as the frontend's chains: [{ rpcUrl }].
  const rawAddress = process.env.AGENT_ACCOUNT_ADDRESS;
  const rawKey = process.env.AGENT_PRIVATE_KEY;
  if (rawAddress && rawKey) {
    return new Account({
      provider: new RpcProvider({ nodeUrl: cfg.rpcUrl }),
      address: rawAddress,
      signer: rawKey,
    });
  }
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
    // Also persist the full URL to a file. The tool-error copy is often
    // truncated by the client (the policies query param is thousands of
    // chars), and a partial URL approves a zero-policy session; reading it
    // from disk guarantees the whole thing reaches `open`.
    if (urlMatch) {
      try {
        const urlFile = join(cfg.basePath, "last-auth-url.txt");
        writeFileSync(urlFile, urlMatch[0], { mode: 0o600 });
        // `mode` only applies when the file is created; force 0600 on rewrite too.
        chmodSync(urlFile, 0o600);
      } catch {
        /* best-effort */
      }
    }
    process.stderr.write(msg + "\n");
  };
  console.log = captureUrls;
  console.info = captureUrls;

  try {
    const p = getProvider(cfg);

    const first = await p.connect();
    if (first) {
      hardenSessionPerms(cfg.basePath);
      return first;
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const retry = await p.connect();
      if (retry) {
        hardenSessionPerms(cfg.basePath);
        return retry;
      }
    }

    throw new Error(
      "Session authorization timed out after 5 minutes. Restart the MCP server to get a fresh auth URL.",
    );
  } finally {
    console.log = originals.log;
    console.info = originals.info;
  }
}
