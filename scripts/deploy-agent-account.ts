// Deploy a DevAgentAccount (SRC5-registered Stark-key account) on the
// self-hosted katana for the MCP agent. Katana's predeployed dev accounts fail
// ERC-1155 acceptance checks (no SRC5), which breaks register_player's starter
// ability mint — see src/tokens/dev_agent_account.cairo.
//
// Usage: bun x tsx scripts/deploy-agent-account.ts
// Then set AGENT_ACCOUNT_ADDRESS in mcp-server-2/.env to the printed address.
// The signing key stays AGENT_PRIVATE_KEY (defaults to katana dev key 1; the
// account is deployed with that key's public key).

import { Account, CallData, RpcProvider, hash, json, legacyDeployer } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.KATANA_RPC_URL ?? "https://siege-katana-production.up.railway.app";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/katana";

// Deployer = katana dev account 0 (public dev key, test chain only).
const DEPLOYER_ADDRESS =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const DEPLOYER_KEY =
  process.env.DOJO_PRIVATE_KEY ??
  "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912";

// Public key the agent account trusts — katana dev account 1's keypair.
const AGENT_PUBLIC_KEY =
  process.env.AGENT_PUBLIC_KEY ??
  "0x4c339f18b9d1b95b64a6d378abd1480b2e0d5d5bd33cd0828cbce4d65c27284";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const deployer = new Account({
    provider,
    address: DEPLOYER_ADDRESS,
    signer: DEPLOYER_KEY,
    deployer: legacyDeployer,
  });

  const sierra = json.parse(
    readFileSync(`${TARGET_DIR}/siege_dojo_DevAgentAccount.contract_class.json`, "utf-8"),
  );
  const casm = json.parse(
    readFileSync(`${TARGET_DIR}/siege_dojo_DevAgentAccount.compiled_contract_class.json`, "utf-8"),
  );
  const classHash = hash.computeSierraContractClassHash(sierra);

  try {
    await provider.getClassByHash(classHash);
    console.log("Class already declared:", classHash);
  } catch {
    console.log("Declaring DevAgentAccount...");
    const declared = await deployer.declare({ contract: sierra, casm });
    await provider.waitForTransaction(declared.transaction_hash);
    console.log("Declared:", declared.class_hash);
  }

  const result = await deployer.deploy({
    classHash,
    constructorCalldata: CallData.compile([AGENT_PUBLIC_KEY]),
    salt: AGENT_PUBLIC_KEY,
  });
  await provider.waitForTransaction(result.transaction_hash);
  const address = Array.isArray(result.contract_address)
    ? result.contract_address[0]
    : result.contract_address;

  console.log("\n✓ DevAgentAccount deployed");
  console.log("  AGENT_ACCOUNT_ADDRESS=" + address);
}

main().catch((error) => {
  console.error("Deploy failed:", error);
  process.exit(1);
});
