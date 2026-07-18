// One-shot bootstrap for the Starknet MAINNET deployment (SN_MAIN).
//
// Mainnet variant of scripts/init-katana-world.ts — REAL fees paid in STRK,
// REAL Cartridge VRF (no DevVrfProvider on mainnet). Run AFTER
// `sozo -P mainnet migrate` + writer grants. Declares and deploys the non-Dojo
// contracts (AbilityToken, 6 ResourceTokens), lays out the hex grid, and wires
// every config the sepolia init scripts handled:
//   initialize_world, set_authorized_operator x3 per token,
//   AbilityToken set_minter/set_minter2/set_burner,
//   actions_1v1 set_ability_token / set_resource_config / set_vrf_provider.
//
// Idempotent + resumable: declares are skipped when the class already exists,
// and deploys use unique:false salts so a re-run derives the same address and
// skips any contract already on-chain. Safe to re-run after a partial failure.
//
// Usage:
//   source deploy.mainnet.env && bun x tsx scripts/init-mainnet-world.ts
//
// Prints a JSON address block at the end — paste into the frontend/MCP mainnet
// config (Tasks 6/7/8).

import {
  Account,
  CallData,
  RpcProvider,
  byteArray,
  hash,
  json,
  legacyDeployer,
} from "starknet";
import { readFileSync } from "node:fs";

// Cartridge's mainnet RPC (https://api.cartridge.gg/x/starknet/mainnet) serves
// JSON-RPC spec 0.10.2, which starknet.js 8.9.x cannot consume — it speaks
// exactly spec 0.9.0. This Alchemy public endpoint serves 0.9.0 on chain
// SN_MAIN (verified) and is used ONLY for these deploy-time declares/deploys.
// The runtime RPC for the frontend / Cartridge Controller stays the Cartridge
// mainnet URL (configured there, not here). Mirrors dojo_mainnet.toml's note.
// Lava (https://rpc.starknet.lava.build/rpc/v0_9) also serves 0.9.0 but
// rate-limits under load; override with MAINNET_RPC_URL if Alchemy is down.
const RPC =
  process.env.MAINNET_RPC_URL ??
  "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_mainnet.json";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/mainnet";

// No dev-key fallbacks on mainnet — hard-require the deployer credentials.
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) throw new Error("source deploy.mainnet.env first");

// Cartridge VRF provider — verified live on mainnet (Task 1). There is NO
// DevVrfProvider on mainnet; the game uses the real Cartridge VRF.
const VRF_PROVIDER =
  process.env.VRF_PROVIDER_ADDRESS ??
  "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

// STRK fee token on mainnet — read the deployer balance before the first tx.
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const GRID_W = 12;
const GRID_H = 8;

const TOKENS = [
  { name: "Iron", symbol: "IRON" },
  { name: "Linen", symbol: "LINEN" },
  { name: "Stone", symbol: "STONE" },
  { name: "Wood", symbol: "WOOD" },
  { name: "Ember", symbol: "EMBER" },
  { name: "Seeds", symbol: "SEEDS" },
];

type Manifest = { contracts: { address: string; tag: string }[] };

function tagAddress(manifest: Manifest, tag: string): string {
  const entry = manifest.contracts.find((c) => c.tag === tag);
  if (!entry) throw new Error(`Missing ${tag} in ${MANIFEST_PATH}`);
  return entry.address;
}

function strkString(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac} STRK`;
}

async function strkBalance(provider: RpcProvider, address: string): Promise<bigint> {
  const res = await provider.callContract({
    contractAddress: STRK_TOKEN,
    entrypoint: "balanceOf",
    calldata: [address],
  });
  return BigInt(res[0]) + (BigInt(res[1]) << 128n);
}

async function declareIfNeeded(
  provider: RpcProvider,
  account: Account,
  artifactBase: string,
): Promise<string> {
  const sierra = json.parse(readFileSync(`${TARGET_DIR}/${artifactBase}.contract_class.json`, "utf-8"));
  const casm = json.parse(
    readFileSync(`${TARGET_DIR}/${artifactBase}.compiled_contract_class.json`, "utf-8"),
  );
  const classHash = hash.computeSierraContractClassHash(sierra);
  try {
    await provider.getClassByHash(classHash);
    console.log(`  ${artifactBase}: already declared (${classHash})`);
  } catch {
    console.log(`  declaring ${artifactBase}...`);
    // starknet.js reads the node's starknet_version (0.14.x on mainnet) and
    // computes the compiled-class hash with blake2s automatically — no flag.
    const declared = await account.declare({ contract: sierra, casm });
    await provider.waitForTransaction(declared.transaction_hash);
    console.log(`  ${artifactBase}: declared (${declared.class_hash})`);
  }
  return classHash;
}

async function deploy(
  provider: RpcProvider,
  account: Account,
  classHash: string,
  constructorCalldata: string[],
  saltLabel: string,
): Promise<string> {
  const salt = hash.computePoseidonHash(
    classHash,
    `0x${Buffer.from(`siege-mainnet:${saltLabel}`).toString("hex")}`,
  );
  // unique:false → address is a pure function of (salt, classHash, calldata),
  // so a re-run derives the same address and we can skip an already-deployed
  // contract instead of colliding on redeploy.
  const address = hash.calculateContractAddressFromHash(salt, classHash, constructorCalldata, 0);
  try {
    await provider.getClassHashAt(address);
    console.log(`  ${saltLabel}: already deployed (${address})`);
    return address;
  } catch {
    // Not deployed yet — fall through to deploy.
  }
  const result = await account.deploy({ classHash, constructorCalldata, salt, unique: false });
  await provider.waitForTransaction(result.transaction_hash);
  return address;
}

async function exec(
  provider: RpcProvider,
  account: Account,
  calls: { contractAddress: string; entrypoint: string; calldata: ReturnType<typeof CallData.compile> }[],
  label: string,
) {
  console.log(`→ ${label}`);
  const tx = await account.execute(calls);
  await provider.waitForTransaction(tx.transaction_hash);
}

async function main() {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const actions1v1 = tagAddress(manifest, "siege_dojo-actions_1v1");
  const worldSystem = tagAddress(manifest, "siege_dojo-world_system");
  const resolution1v1 = tagAddress(manifest, "siege_dojo-resolution_1v1");
  const crafting1v1 = tagAddress(manifest, "siege_dojo-crafting_1v1");

  const provider = new RpcProvider({ nodeUrl: RPC });
  // The classic UDC (0x041a78…02bf) is live on mainnet; starknet.js v8 defaults
  // to the newer deployer address, which is not guaranteed there.
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
    deployer: legacyDeployer,
  });
  console.log("RPC:", RPC);
  console.log("Deployer:", ACCOUNT_ADDRESS);

  const balanceBefore = await strkBalance(provider, ACCOUNT_ADDRESS);
  console.log("Deployer STRK balance:", strkString(balanceBefore));
  console.log("MAINNET — real fees from here");

  console.log("\nDeclaring classes...");
  const resourceClass = await declareIfNeeded(provider, account, "siege_dojo_ResourceToken");
  const abilityClass = await declareIfNeeded(provider, account, "siege_dojo_AbilityToken");

  console.log("\nDeploying AbilityToken...");
  const abilityToken = await deploy(provider, account, abilityClass, [ACCOUNT_ADDRESS], "ability");
  console.log("  AbilityToken:", abilityToken);

  console.log("\nDeploying resource tokens...");
  const resourceAddresses: string[] = [];
  for (const token of TOKENS) {
    const address = await deploy(
      provider,
      account,
      resourceClass,
      [
        ...CallData.compile(byteArray.byteArrayFromString(token.name)),
        ...CallData.compile(byteArray.byteArrayFromString(token.symbol)),
        ACCOUNT_ADDRESS,
      ],
      `resource:${token.symbol}`,
    );
    console.log(`  ${token.symbol}: ${address}`);
    resourceAddresses.push(address);
  }

  const cols: number[] = [];
  const rows: number[] = [];
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      cols.push(c);
      rows.push(r);
    }
  }
  await exec(
    provider,
    account,
    [
      {
        contractAddress: worldSystem,
        entrypoint: "initialize_world",
        calldata: CallData.compile([cols, rows]),
      },
    ],
    `initialize_world (${GRID_W}x${GRID_H})`,
  );

  for (const address of resourceAddresses) {
    await exec(
      provider,
      account,
      [resolution1v1, worldSystem, crafting1v1].map((operator) => ({
        contractAddress: address,
        entrypoint: "set_authorized_operator",
        calldata: CallData.compile([operator, 1]),
      })),
      `authorize operators on ${address}`,
    );
  }

  await exec(
    provider,
    account,
    [
      { contractAddress: abilityToken, entrypoint: "set_minter", calldata: CallData.compile([crafting1v1]) },
      { contractAddress: abilityToken, entrypoint: "set_minter2", calldata: CallData.compile([worldSystem]) },
      { contractAddress: abilityToken, entrypoint: "set_burner", calldata: CallData.compile([crafting1v1]) },
    ],
    "wire AbilityToken minter/minter2/burner",
  );

  await exec(
    provider,
    account,
    [
      { contractAddress: actions1v1, entrypoint: "set_ability_token", calldata: CallData.compile([abilityToken]) },
      { contractAddress: actions1v1, entrypoint: "set_resource_config", calldata: CallData.compile(resourceAddresses) },
      { contractAddress: actions1v1, entrypoint: "set_vrf_provider", calldata: CallData.compile([VRF_PROVIDER]) },
    ],
    "wire ResourceConfig (ability token, resources, vrf)",
  );

  const balanceAfter = await strkBalance(provider, ACCOUNT_ADDRESS);
  console.log("\nDeployer STRK balance:", strkString(balanceAfter));
  console.log("STRK spent:", strkString(balanceBefore - balanceAfter));

  console.log("\n✓ Mainnet world initialized. Addresses:");
  console.log(
    JSON.stringify(
      {
        abilityToken,
        vrfProvider: VRF_PROVIDER,
        resources: Object.fromEntries(TOKENS.map((t, i) => [t.symbol, resourceAddresses[i]])),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("\nBootstrap failed:", error);
  process.exit(1);
});
