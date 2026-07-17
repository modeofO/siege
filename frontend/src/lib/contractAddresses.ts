import manifestDev from "../manifests/manifest_dev.json";
import manifestSepolia from "../manifests/manifest_sepolia.json";
import manifestKatana from "../manifests/manifest_katana.json";
import manifestMainnet from "../manifests/manifest_mainnet.json";

const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "devnet";
const IS_DEVNET = NETWORK === "devnet";
const IS_KATANA = NETWORK === "katana";
const IS_MAINNET = NETWORK === "mainnet";
const manifest = IS_DEVNET
  ? manifestDev
  : IS_KATANA
    ? manifestKatana
    : IS_MAINNET
      ? manifestMainnet
      : manifestSepolia;

function manifestContract(tag: string): string | undefined {
  return manifest.contracts.find((contract) => contract.tag === tag)?.address;
}

function contractAddress(tag: string, envName: string, fallback = ""): string {
  const fromManifest = manifestContract(tag);
  if (!IS_DEVNET && fromManifest) return fromManifest;
  return process.env[envName] || fromManifest || fallback;
}

// VRF provider — a fixed network address, not a Dojo contract. Lives here (an
// address-only module) rather than contracts1v1.ts so sessionPolicies can read
// it without pulling the controllerSession import cycle. Sepolia uses the
// Cartridge VRF service; the self-hosted katana uses DevVrfProvider
// (pseudo-random, deployed by scripts/init-katana-world.ts).
export const VRF_PROVIDER_ADDRESS = IS_KATANA
  ? "0x3832c912886ed54ee500d913df5d7e10703d32d868a56cca1fb9f725c2c1121"
  : "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export const ACTIONS_1V1_ADDRESS = contractAddress(
  "siege_dojo-actions_1v1",
  "NEXT_PUBLIC_ACTIONS_1V1_ADDRESS",
  "0xa503dbf655e21fe7e65c42f18662edc584aa6b3e8c8bb19e35fa57f62492ab",
);

export const COMMIT_REVEAL_1V1_ADDRESS = contractAddress(
  "siege_dojo-commit_reveal_1v1",
  "NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS",
  "0x5304e2568417d2e67d63caab54db914900afbf23035687c63b4962d2f5d8f5b",
);

export const RESOLUTION_1V1_ADDRESS = contractAddress(
  "siege_dojo-resolution_1v1",
  "NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS",
  "0x7d42eb63561f6f25315833d674002e3a53accd00bd02e243154009890122e3d",
);

export const WORLD_SYSTEM_ADDRESS = contractAddress(
  "siege_dojo-world_system",
  "NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS",
);

export const CONQUEST_ADDRESS = contractAddress(
  "siege_dojo-conquest",
  "NEXT_PUBLIC_CONQUEST_ADDRESS",
);

export const CRAFTING_1V1_ADDRESS = contractAddress(
  "siege_dojo-crafting_1v1",
  "NEXT_PUBLIC_CRAFTING_1V1_ADDRESS",
  "0x18700cba1d48b91aa99f2a7542a8739576fec35e4938d8c5dd11879688fe7b2",
);
