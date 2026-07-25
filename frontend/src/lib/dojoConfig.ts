import { createDojoConfig } from "@dojoengine/core";
import manifestDev from "../manifests/manifest_dev.json";
import manifestSepolia from "../manifests/manifest_sepolia.json";
import manifestKatana from "../manifests/manifest_katana.json";
import manifestMainnet from "../manifests/manifest_mainnet.json";

import { IS_DEVNET, IS_KATANA, IS_MAINNET } from "./network";

const manifest = IS_DEVNET
  ? manifestDev
  : IS_KATANA
    ? manifestKatana
    : IS_MAINNET
      ? manifestMainnet
      : manifestSepolia;

// Endpoints resolve in ./network so leaf modules (toriiSql) can read them
// without pulling in the manifests. Re-exported here for existing importers.
export { TORII_URL, RPC_URL, CHAIN_ID } from "./network";

export const dojoConfig = createDojoConfig({ manifest });

export const WORLD_ADDRESS = dojoConfig.manifest.world.address as string;
