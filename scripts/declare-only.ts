// Just declare the AbilityToken class — for debugging deploy failures
import { Account, RpcProvider, hash, json } from "starknet";
import { readFileSync } from "fs";

const RPC = process.env.RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({
  provider,
  address: process.env.DOJO_ACCOUNT_ADDRESS!,
  signer: process.env.DOJO_PRIVATE_KEY!,
});

const sierra = json.parse(readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8"));
const casm = json.parse(readFileSync("target/sepolia/siege_dojo_AbilityToken.compiled_contract_class.json", "utf-8"));

const classHash = hash.computeSierraContractClassHash(sierra);
const compiledClassHash = hash.computeCompiledClassHash(casm);

console.log("RPC:", RPC);
console.log("Sierra class hash:", classHash);
console.log("CASM class hash:", compiledClassHash);
console.log("Sierra JSON size:", readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8").length, "bytes");

async function main() {
  try {
    await provider.getClassByHash(classHash);
    console.log("Class already declared!");
    return;
  } catch {
    console.log("Class not declared — declaring...");
  }

  try {
    const result = await account.declare({ contract: sierra, compiledClassHash });
    console.log("Declare tx:", result.transaction_hash);
    await provider.waitForTransaction(result.transaction_hash);
    console.log("Declared successfully.");
  } catch (e: any) {
    // Print the last 1000 chars of the error to find the actual RPC error
    const msg = e.message || String(e);
    console.error("Declare FAILED. Error tail:");
    console.error(msg.slice(-1000));
    if (e.data) console.error("Error data:", JSON.stringify(e.data).slice(-500));
    process.exit(1);
  }
}

main();
