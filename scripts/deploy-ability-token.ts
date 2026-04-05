// Deploy AbilityToken ERC-1155 contract to Sepolia
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-ability-token.ts
//
// Prerequisites: Run `/tmp/sozo build -P sepolia` first

import { Account, RpcProvider, CallData, hash, json, byteArray } from "starknet";
import { readFileSync } from "fs";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

console.log("Step 1: Connecting to RPC...");
console.log("  RPC:", RPC);
console.log("  Account:", ACCOUNT_ADDRESS);
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });
console.log("  Connected.");

console.log("Step 2: Reading contract artifact...");
const raw = readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8");
console.log("  File read, size:", raw.length, "bytes");
const contractArtifact = json.parse(raw);
console.log("  Parsed.");

console.log("Step 3: Computing class hash...");
const classHash = hash.computeSierraContractClassHash(contractArtifact);
console.log("  Class hash:", classHash);

async function main() {
  console.log("\nChecking if class is declared...");
  let declared = false;
  try {
    await provider.getClassByHash(classHash);
    declared = true;
    console.log("  Class already declared on-chain.");
  } catch {
    console.log("  Class NOT declared — declaring now...");
  }

  if (!declared) {
    const casmRaw = readFileSync(
      "target/sepolia/siege_dojo_AbilityToken.compiled_contract_class.json",
      "utf-8",
    );
    const casmArtifact = json.parse(casmRaw);
    const compiledClassHash = hash.computeCompiledClassHash(casmArtifact);
    console.log("  Compiled class hash:", compiledClassHash);

    const declareTx = await account.declare({
      contract: contractArtifact,
      compiledClassHash,
    });
    console.log("  Declare tx:", declareTx.transaction_hash);
    await provider.waitForTransaction(declareTx.transaction_hash);
    console.log("  Declared.");
  }

  console.log("\nDeploying AbilityToken instance...");
  // Constructor: (admin: ContractAddress, base_uri: ByteArray)
  const constructorCalldata = [
    ACCOUNT_ADDRESS!, // admin = deployer
    ...CallData.compile(byteArray.byteArrayFromString("")), // base_uri starts empty
  ];

  const deployResult = await account.deploy({
    classHash,
    constructorCalldata,
    salt: hash.computePoseidonHash(classHash, "0x" + Buffer.from("AbilityToken").toString("hex")),
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);
  await provider.waitForTransaction(deployResult.transaction_hash);

  const addr = Array.isArray(deployResult.contract_address)
    ? deployResult.contract_address[0]
    : deployResult.contract_address;
  console.log(`\n=== AbilityToken deployed ===`);
  console.log(`  Address: ${addr}`);
  console.log("\nNext steps (Task 6):");
  console.log("  1. Run sozo migrate to pick up rewired crafting_1v1");
  console.log("  2. Call actions_1v1.set_ability_token(" + addr + ")");
  console.log("  3. Call ability_token.set_minter(<crafting_1v1_address>)");
  console.log("  4. Call ability_token.set_base_uri('https://<YOUR_HOST>/api/metadata/abilities/{id}')");
}

main().catch((e) => {
  console.error("\nDeployment failed:", e.message || e);
  process.exit(1);
});
