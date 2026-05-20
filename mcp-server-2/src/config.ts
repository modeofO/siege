/**
 * Environment + manifest loading.
 *
 * Resolves contract addresses from the Dojo manifest rather than hardcoded
 * env vars so policies and tx targets always agree.
 */

import { readFileSync } from "node:fs";
import { fromRoot } from "./paths.js";

const DEFAULT_VRF = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export interface ResourceTokenAddresses {
  iron: string;
  linen: string;
  stone: string;
  wood: string;
  ember: string;
  seeds: string;
}

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
  resourceTokens: ResourceTokenAddresses;
  agentPromptPath: string;
  frontendUrl: string;
}

export interface DojoManifest {
  world: { address: string };
  contracts: { tag: string; address: string }[];
}

export interface SiegeContracts {
  actions1v1: string;
  commitReveal1v1: string;
  conquest: string;
  crafting1v1: string;
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
    crafting1v1: findContract(manifest, "siege_dojo-crafting_1v1"),
    resolution1v1: findContract(manifest, "siege_dojo-resolution_1v1"),
    worldSystem: findContract(manifest, "siege_dojo-world_system"),
  };

  const resourceTokens: ResourceTokenAddresses = {
    iron: process.env.IRON_TOKEN_ADDRESS ?? "0x04443a152ebfe64b834cf7aa904b56ee6a97b9fcf7ee6f4e9ad272596e3d7a73",
    linen: process.env.LINEN_TOKEN_ADDRESS ?? "0x01b57dd0b9b246bf39185e23cd7c794d2bf6ad7088c8a3325f91809f6c4588c0",
    stone: process.env.STONE_TOKEN_ADDRESS ?? "0x051769e3c9a978e30d7cacdb2491e057c233fbd99ca36a8bb3c544894b3b3cc2",
    wood: process.env.WOOD_TOKEN_ADDRESS ?? "0x05dc381b9755ae512fad38462887e2587d17661b833bbd22a32130db8fb20a9b",
    ember: process.env.EMBER_TOKEN_ADDRESS ?? "0x043415cab3dbd5d07c05da8aa135c92a1e0fd008c7eb0e09cef8be0e5065887d",
    seeds: process.env.SEEDS_TOKEN_ADDRESS ?? "0x077ee09267cf3ded08f68c0c3eb74e2e5e01eae82d7691b48fb586768ea16f47",
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
    resourceTokens,
    agentPromptPath: fromRoot("agent-prompt.md"),
    frontendUrl: process.env.SIEGE_FRONTEND_URL ?? "https://localhost:3000",
  };
}
