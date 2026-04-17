import { createDojoConfig } from "@dojoengine/core";
import manifestDev from "../manifests/manifest_dev.json";
import manifestSepolia from "../manifests/manifest_sepolia.json";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const manifest = IS_DEVNET ? manifestDev : manifestSepolia;

export const TORII_URL =
  process.env.NEXT_PUBLIC_TORII_URL ||
  (IS_DEVNET ? "http://localhost:8080" : "https://api.cartridge.gg/x/siege-dojo/torii");

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (IS_DEVNET ? "http://localhost:5050" : "https://api.cartridge.gg/x/starknet/sepolia");

export const CHAIN_ID = IS_DEVNET ? "KATANA" : "SN_SEPOLIA";

export const dojoConfig = createDojoConfig({ manifest });

export const WORLD_ADDRESS = dojoConfig.manifest.world.address as string;
