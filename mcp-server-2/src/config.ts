/**
 * Environment + manifest loading.
 *
 * Resolves contract addresses from the Dojo manifest rather than hardcoded
 * env vars so policies and tx targets always agree.
 */

import { readFileSync } from "node:fs";
import { fromRoot } from "./paths.js";

const DEFAULT_VRF = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export interface Config {
  toriiUrl: string;
  rpcUrl: string;
  chainId: string;
  manifestPath: string;
  manifest: DojoManifest;
  contracts: SiegeContracts;
  sessionDir: string;
  vrfAddress: string;
  abilityTokenAddress: string | null;
  agentPromptPath: string;
}

export interface DojoManifest {
  world: { address: string };
  contracts: { tag: string; address: string }[];
}

export interface SiegeContracts {
  actions1v1: string;
  commitReveal1v1: string;
  conquest: string;
  resolution1v1: string;
  worldSystem: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeToriiUrl(url: string): string {
  return url.replace(/\/graphql\/?$/, "").replace(/\/sql\/?$/, "").replace(/\/$/, "");
}

function findContract(manifest: DojoManifest, tag: string): string {
  const entry = manifest.contracts.find((c) => c.tag === tag);
  if (!entry) throw new Error(`Contract not found in manifest: ${tag}`);
  return entry.address;
}

export function loadConfig(): Config {
  const toriiUrl = normalizeToriiUrl(required("TORII_URL", process.env.TORII_URL));
  const rpcUrl = required("RPC_URL", process.env.RPC_URL);
  const chainId = process.env.CHAIN_ID ?? "SN_SEPOLIA";

  const manifestPath = fromRoot(process.env.MANIFEST_PATH ?? "../manifest_sepolia.json");
  let manifest: DojoManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DojoManifest;
  } catch (err: any) {
    throw new Error(`Failed to read manifest at ${manifestPath}: ${err.message}`);
  }

  const contracts: SiegeContracts = {
    actions1v1: findContract(manifest, "siege_dojo-actions_1v1"),
    commitReveal1v1: findContract(manifest, "siege_dojo-commit_reveal_1v1"),
    conquest: findContract(manifest, "siege_dojo-conquest"),
    resolution1v1: findContract(manifest, "siege_dojo-resolution_1v1"),
    worldSystem: findContract(manifest, "siege_dojo-world_system"),
  };

  return {
    toriiUrl,
    rpcUrl,
    chainId,
    manifestPath,
    manifest,
    contracts,
    sessionDir: fromRoot(process.env.SESSION_DIR ?? ".cartridge"),
    vrfAddress: process.env.VRF_PROVIDER_ADDRESS ?? DEFAULT_VRF,
    abilityTokenAddress: process.env.ABILITY_TOKEN_ADDRESS ?? null,
    agentPromptPath: fromRoot("agent-prompt.md"),
  };
}
