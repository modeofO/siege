// Measure the REAL L2 gas of world_system.register_player against live chain
// state, using starknet_simulateTransactions with SKIP_VALIDATE.
//
// Why this exists: `sozo test` prints a per-test gas figure, but that is the
// cairo-test runner's pricing, not blockifier's versioned constants, and it
// also carries ~60-80M of spawn_test_world setup. It is fine for deltas and
// useless for answering "will the paymaster sponsor this", which is the
// question that actually matters — AVNU starts refusing around 100M L2 gas.
//
// Simulation is read-only: it proves the entrypoint succeeds against real
// occupancy AND prices it, without claiming any parcels.
//
// Usage:
//   bun x tsx scripts/gas-probe-register.ts
//   RPC_URL=... MANIFEST_PATH=manifest_mainnet.json bun x tsx scripts/gas-probe-register.ts
//
// A fresh (unregistered) DevAgentAccount is required as the sender — katana's
// predeployed dev accounts lack SRC5 and fail register_player's starter ability
// mint for unrelated reasons. Pass PROBE_PRIVATE_KEY to vary the account.

import {
  Account,
  CallData,
  RpcProvider,
  ec,
  hash,
  json,
  legacyDeployer,
} from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://siege-katana-production.up.railway.app";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/katana";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";

// Deployer = katana dev account 0 (public dev key, test chain only).
const DEPLOYER_ADDRESS =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const DEPLOYER_KEY =
  process.env.DOJO_PRIVATE_KEY ??
  "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912";

// Distinct from the MCP agent key so the derived account address is fresh and
// therefore still unregistered.
const PROBE_KEY = process.env.PROBE_PRIVATE_KEY ?? "0x9a5e70c17d0f2a3b4c5d6e7f8091a2b3";

const HOME_TYPES = [0, 1, 2];

function worldSystemAddress(): string {
  const manifest = json.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const entry = manifest.contracts.find((c: { tag: string }) =>
    c.tag.endsWith("world_system"),
  );
  if (!entry) throw new Error(`world_system not found in ${MANIFEST_PATH}`);
  return entry.address;
}

async function ensureProbeAccount(provider: RpcProvider): Promise<string> {
  const publicKey = ec.starkCurve.getStarkKey(PROBE_KEY);

  const sierra = json.parse(
    readFileSync(`${TARGET_DIR}/siege_dojo_DevAgentAccount.contract_class.json`, "utf-8"),
  );
  const casm = json.parse(
    readFileSync(
      `${TARGET_DIR}/siege_dojo_DevAgentAccount.compiled_contract_class.json`,
      "utf-8",
    ),
  );
  const classHash = hash.computeSierraContractClassHash(sierra);

  const deployer = new Account({
    provider,
    address: DEPLOYER_ADDRESS,
    signer: DEPLOYER_KEY,
    deployer: legacyDeployer,
  });

  try {
    await provider.getClassByHash(classHash);
  } catch {
    const declared = await deployer.declare({ contract: sierra, casm });
    await provider.waitForTransaction(declared.transaction_hash);
  }

  // Take the address the deployer actually reports — deriving it locally has
  // to match the legacy UDC's salting exactly, and getting that subtly wrong
  // yields an address with no contract at it.
  if (process.env.PROBE_ACCOUNT_ADDRESS) {
    const address = process.env.PROBE_ACCOUNT_ADDRESS;
    console.log("Using probe account from env:", address);
    return address;
  }

  console.log("Deploying probe account...");
  const result = await deployer.deploy({
    classHash,
    constructorCalldata: CallData.compile([publicKey]),
    salt: publicKey,
  });
  await provider.waitForTransaction(result.transaction_hash);
  const address = Array.isArray(result.contract_address)
    ? result.contract_address[0]
    : result.contract_address;
  console.log("Probe account deployed:", address);
  console.log("  (re-run with PROBE_ACCOUNT_ADDRESS=" + address + " to reuse)");

  return address;
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const wsAddress = worldSystemAddress();
  const probeAddress = await ensureProbeAccount(provider);

  const account = new Account({
    provider,
    address: probeAddress,
    signer: PROBE_KEY,
  });

  const call = {
    contractAddress: wsAddress,
    entrypoint: "register_player",
    calldata: CallData.compile([HOME_TYPES]),
  };

  // SKIP_VALIDATE so the probe does not depend on the account's signature or
  // nonce being right; we only want execution cost and success/failure.
  const [sim] = await account.simulateTransaction([{ type: "INVOKE", ...call }], {
    skipValidate: true,
  });

  // Field names move between starknet.js / RPC spec versions, so read the raw
  // shape rather than a typed accessor.
  const raw = sim as unknown as Record<string, unknown>;

  console.log("\n--- register_player simulation ---");
  console.log("rpc         :", RPC);
  console.log("world_system:", wsAddress);
  console.log("sender      :", probeAddress);
  const bigintSafe = (_k: string, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v;

  const bounds = raw.resourceBounds as
    | { l1_gas?: Record<string, unknown>; l2_gas?: Record<string, unknown>; l1_data_gas?: Record<string, unknown> }
    | undefined;

  console.log("\noverall_fee :", String(raw.overall_fee), String(raw.unit ?? ""));
  console.log("resourceBounds:", JSON.stringify(bounds, bigintSafe, 2));

  // resourceBounds.max_amount is PADDED by starknet.js over the raw estimate.
  // The trace's execution_resources carries the actual consumed figure, which
  // is what to compare against the ~100M AVNU sponsorship line.
  const trace = raw.transaction_trace as Record<string, unknown> | undefined;
  const consumed = trace?.execution_resources as Record<string, unknown> | undefined;
  console.log("\nexecution_resources (actual consumed):",
    JSON.stringify(consumed, bigintSafe, 2));

  const l2Actual = consumed?.l2_gas;
  if (l2Actual !== undefined) {
    const l2 = BigInt(l2Actual as string | number | bigint);
    const padded = bounds?.l2_gas?.max_amount;
    console.log(`\nL2 gas consumed : ${l2.toLocaleString("en-US")}`);
    if (padded !== undefined) {
      console.log(`L2 gas bound    : ${BigInt(padded as string).toLocaleString("en-US")} (padded)`);
    }
    console.log(
      l2 > 100_000_000n
        ? "  ⚠ ABOVE the ~100M AVNU sponsorship danger line"
        : "  ✓ below the ~100M AVNU sponsorship danger line",
    );
  }
}

main().catch((error) => {
  console.error("Probe failed:", error);
  process.exit(1);
});
