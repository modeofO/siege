import { createDojoConfig } from "@dojoengine/core";
import manifestDev from "../manifests/manifest_dev.json";
import manifestSepolia from "../manifests/manifest_sepolia.json";
import manifestKatana from "../manifests/manifest_katana.json";
import manifestMainnet from "../manifests/manifest_mainnet.json";

import { envPin, IS_DEVNET, IS_KATANA, IS_MAINNET } from "./network";

const manifest = IS_DEVNET
  ? manifestDev
  : IS_KATANA
    ? manifestKatana
    : IS_MAINNET
      ? manifestMainnet
      : manifestSepolia;

// Hosted services run on Railway (Cartridge slot torii discontinued).
// envPin() drops the per-deployment URL once the player has switched networks —
// that env var describes the build's own network, not the one now selected.
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

export const CHAIN_ID = IS_DEVNET ? "KATANA" : IS_KATANA ? "SIEGE" : IS_MAINNET ? "SN_MAIN" : "SN_SEPOLIA";

export const dojoConfig = createDojoConfig({ manifest });

export const WORLD_ADDRESS = dojoConfig.manifest.world.address as string;
