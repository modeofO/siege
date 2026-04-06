// Deploy AbilityToken v2 (on-chain metadata) to Sepolia
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-ability-token-v2.ts
//
// Prerequisites: Run `/tmp/sozo build -P sepolia` first

import { Account, RpcProvider, CallData, hash, json } from "starknet";
import { readFileSync } from "fs";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

console.log("Connecting to RPC...");
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

console.log("Reading contract artifact...");
const raw = readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8");
const contractArtifact = json.parse(raw);

console.log("Computing class hash...");
const classHash = hash.computeSierraContractClassHash(contractArtifact);
console.log("  Class hash:", classHash);

async function main() {
  console.log("Checking if class is declared...");
  let declared = false;
  try {
    await provider.getClassByHash(classHash);
    declared = true;
    console.log("  Already declared.");
  } catch {
    console.log("  Not declared — declaring now...");
  }

  if (!declared) {
    const casmRaw = readFileSync(
      "target/sepolia/siege_dojo_AbilityToken.compiled_contract_class.json",
      "utf-8",
    );
    const casmArtifact = json.parse(casmRaw);
    const compiledClassHash = hash.computeCompiledClassHash(casmArtifact);
    const declareTx = await account.declare({ contract: contractArtifact, compiledClassHash });
    console.log("  Declare tx:", declareTx.transaction_hash);
    await provider.waitForTransaction(declareTx.transaction_hash);
    console.log("  Declared.");
  }

  console.log("Deploying AbilityToken v2...");
  // v2 constructor: (admin: ContractAddress) — no base_uri
  const constructorCalldata = [ACCOUNT_ADDRESS!];

  const deployResult = await account.deploy({
    classHash,
    constructorCalldata,
    salt: hash.computePoseidonHash(classHash, "0x" + Buffer.from("AbilityTokenV2").toString("hex")),
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);
  await provider.waitForTransaction(deployResult.transaction_hash);

  const addr = Array.isArray(deployResult.contract_address)
    ? deployResult.contract_address[0]
    : deployResult.contract_address;
  console.log(`\n=== AbilityToken v2 deployed ===`);
  console.log(`  Address: ${addr}`);
}

main().catch((e) => {
  console.error("Deployment failed:", e.message || e);
  process.exit(1);
});
