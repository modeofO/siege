// Deploy six ERC-20 resource tokens to Sepolia, authorize game systems, and
// wire ResourceConfig to the new token addresses.
//
// Usage:
//   DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-tokens.ts
//
// Prerequisites:
//   sozo build -P sepolia
//   starkli declare target/sepolia/siege_dojo_ResourceToken.contract_class.json ...

import { Account, CallData, RpcProvider, byteArray, hash, json } from "starknet";
import { readFileSync } from "node:fs";

const DEFAULT_RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.STARKNET_RPC_URL ?? DEFAULT_RPC;
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_sepolia.json";
const ARTIFACT_PATH =
  process.env.RESOURCE_TOKEN_ARTIFACT ??
  "target/sepolia/siege_dojo_ResourceToken.contract_class.json";

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

type ManifestContract = {
  address: string;
  tag: string;
};

type Manifest = {
  contracts: ManifestContract[];
};

const TOKENS = [
  { name: "Iron", symbol: "IRON" },
  { name: "Linen", symbol: "LINEN" },
  { name: "Stone", symbol: "STONE" },
  { name: "Wood", symbol: "WOOD" },
  { name: "Ember", symbol: "EMBER" },
  { name: "Seeds", symbol: "SEEDS" },
];

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

function contractAddress(manifest: Manifest, tag: string): string {
  const contract = manifest.contracts.find((entry) => entry.tag === tag);
  if (!contract) {
    throw new Error(`Missing ${tag} in ${MANIFEST_PATH}`);
  }
  return contract.address;
}

function envOrManifest(name: string, manifest: Manifest, tag: string): string {
  return process.env[name] ?? contractAddress(manifest, tag);
}

async function wait(provider: RpcProvider, transactionHash: string) {
  console.log("  tx:", transactionHash);
  await provider.waitForTransaction(transactionHash);
}

async function main() {
  const manifest = readManifest();
  const actions1v1 = envOrManifest("ACTIONS_1V1_ADDRESS", manifest, "siege_dojo-actions_1v1");
  const operators = [
    envOrManifest("RESOLUTION_1V1_ADDRESS", manifest, "siege_dojo-resolution_1v1"),
    envOrManifest("WORLD_SYSTEM_ADDRESS", manifest, "siege_dojo-world_system"),
    envOrManifest("CRAFTING_1V1_ADDRESS", manifest, "siege_dojo-crafting_1v1"),
  ];

  console.log("Connecting to RPC...");
  console.log("  RPC:", RPC);
  console.log("  Account:", ACCOUNT_ADDRESS);
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  console.log("\nReading ResourceToken artifact...");
  const contractArtifact = json.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  const classHash = hash.computeSierraContractClassHash(contractArtifact);
  console.log("  Class hash:", classHash);

  console.log("\nChecking class declaration...");
  try {
    await provider.getClassByHash(classHash);
    console.log("  Class is declared.");
  } catch {
    console.error("  Class is not declared on-chain.");
    console.error(`  Declare it first: starkli declare ${ARTIFACT_PATH} --rpc <rpc> ...`);
    process.exit(1);
  }

  console.log("\nOperators to authorize:");
  console.log("  resolution_1v1:", operators[0]);
  console.log("  world_system:   ", operators[1]);
  console.log("  crafting_1v1:   ", operators[2]);

  const saltPrefix =
    process.env.RESOURCE_TOKEN_SALT_PREFIX ?? `resource-token-${Date.now().toString()}`;
  console.log("\nSalt prefix:", saltPrefix);

  const addresses: string[] = [];

  for (const token of TOKENS) {
    console.log(`\nDeploying ${token.name} (${token.symbol})...`);
    const constructorCalldata = [
      ...CallData.compile(byteArray.byteArrayFromString(token.name)),
      ...CallData.compile(byteArray.byteArrayFromString(token.symbol)),
      ACCOUNT_ADDRESS,
    ];

    const deployResult = await account.deploy({
      classHash,
      constructorCalldata,
      salt: hash.computePoseidonHash(
        classHash,
        `0x${Buffer.from(`${saltPrefix}:${token.symbol}`).toString("hex")}`,
      ),
    });
    await wait(provider, deployResult.transaction_hash);

    const address = Array.isArray(deployResult.contract_address)
      ? deployResult.contract_address[0]
      : deployResult.contract_address;
    if (!address) {
      throw new Error(`No deployed address returned for ${token.symbol}`);
    }
    console.log(`  address: ${address}`);
    addresses.push(address);
  }

  for (const address of addresses) {
    console.log(`\nAuthorizing operators on ${address}...`);
    const tx = await account.execute(
      operators.map((operator) => ({
        contractAddress: address,
        entrypoint: "set_authorized_operator",
        calldata: CallData.compile([operator, 1]),
      })),
    );
    await wait(provider, tx.transaction_hash);
  }

  console.log("\nSetting ResourceConfig...");
  const tx = await account.execute({
    contractAddress: actions1v1,
    entrypoint: "set_resource_config",
    calldata: CallData.compile(addresses),
  });
  await wait(provider, tx.transaction_hash);

  console.log("\nResource tokens deployed and wired:");
  TOKENS.forEach((token, index) => console.log(`  ${token.symbol}: ${addresses[index]}`));
}

main().catch((error) => {
  console.error("\nDeployment failed:", error);
  process.exit(1);
});
