// One-shot bootstrap for the self-hosted Railway katana (SIEGE chain).
//
// Run AFTER `sozo -P katana migrate` + writer grants. Declares and deploys the
// non-Dojo contracts (AbilityToken, 6 ResourceTokens, DevVrfProvider), lays out
// the hex grid, and wires every config the sepolia init scripts handled:
//   initialize_world, set_authorized_operator x3 per token,
//   AbilityToken set_minter/set_minter2/set_burner,
//   actions_1v1 set_ability_token / set_resource_config / set_vrf_provider.
//
// Usage:
//   bun x tsx scripts/init-katana-world.ts
//
// Deployer defaults to katana dev account 0 (public dev key, test chain only).
// Prints a JSON address block at the end — paste into torii_katana.toml and
// frontend/src/lib/useResourceBalances.ts (katana branch).

import { Account, CallData, RpcProvider, byteArray, hash, json, legacyDeployer } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.KATANA_RPC_URL ?? "https://siege-katana-production.up.railway.app";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/katana";

const ACCOUNT_ADDRESS =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const PRIVATE_KEY =
  process.env.DOJO_PRIVATE_KEY ??
  "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912";

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
  const result = await account.deploy({
    classHash,
    constructorCalldata,
    salt: hash.computePoseidonHash(
      classHash,
      `0x${Buffer.from(`siege-katana:${saltLabel}`).toString("hex")}`,
    ),
  });
  await provider.waitForTransaction(result.transaction_hash);
  const address = Array.isArray(result.contract_address)
    ? result.contract_address[0]
    : result.contract_address;
  if (!address) throw new Error(`No address for ${saltLabel}`);
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
  // Katana predeploys only the legacy UDC; starknet.js v8 defaults to the new
  // deployer address, which does not exist on this chain.
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
    deployer: legacyDeployer,
  });
  console.log("RPC:", RPC);
  console.log("Deployer:", ACCOUNT_ADDRESS);

  console.log("\nDeclaring classes...");
  const resourceClass = await declareIfNeeded(provider, account, "siege_dojo_ResourceToken");
  const abilityClass = await declareIfNeeded(provider, account, "siege_dojo_AbilityToken");
  const vrfClass = await declareIfNeeded(provider, account, "siege_dojo_DevVrfProvider");

  console.log("\nDeploying AbilityToken...");
  const abilityToken = await deploy(provider, account, abilityClass, [ACCOUNT_ADDRESS], "ability");
  console.log("  AbilityToken:", abilityToken);

  console.log("\nDeploying DevVrfProvider...");
  const vrfProvider = await deploy(provider, account, vrfClass, [], "vrf");
  console.log("  DevVrfProvider:", vrfProvider);

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
      { contractAddress: actions1v1, entrypoint: "set_vrf_provider", calldata: CallData.compile([vrfProvider]) },
    ],
    "wire ResourceConfig (ability token, resources, vrf)",
  );

  console.log("\n✓ Katana world initialized. Addresses:");
  console.log(
    JSON.stringify(
      {
        abilityToken,
        vrfProvider,
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
