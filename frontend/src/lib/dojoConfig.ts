import { createDojoConfig } from "@dojoengine/core";
import manifestDev from "../manifests/manifest_dev.json";
import manifestSepolia from "../manifests/manifest_sepolia.json";
import manifestKatana from "../manifests/manifest_katana.json";

const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "devnet";
const IS_DEVNET = NETWORK === "devnet";
const IS_KATANA = NETWORK === "katana";

const manifest = IS_DEVNET ? manifestDev : IS_KATANA ? manifestKatana : manifestSepolia;

// Hosted services run on Railway (Cartridge slot torii discontinued).
export const TORII_URL =
  process.env.NEXT_PUBLIC_TORII_URL ||
  (IS_DEVNET
    ? "http://localhost:8080"
    : IS_KATANA
      ? "https://siege-torii-katana-production.up.railway.app"
      : "https://siege-torii-production-d1a1.up.railway.app");

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (IS_DEVNET
    ? "http://localhost:5050"
    : IS_KATANA
      ? "https://siege-katana-production.up.railway.app"
      : "https://api.cartridge.gg/x/starknet/sepolia");

export const CHAIN_ID = IS_DEVNET ? "KATANA" : IS_KATANA ? "SIEGE" : "SN_SEPOLIA";

export const dojoConfig = createDojoConfig({ manifest });

export const WORLD_ADDRESS = dojoConfig.manifest.world.address as string;
