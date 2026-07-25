// Mint katana resource tokens to a tester address.
//
// Not part of the bootstrap: a tester normally funds themselves by registering
// a Hold and calling claim_drip, which mints resource tokens hourly and is the
// intended path. This exists purely to skip the wait when QA needs to queue
// immediately — claim_drip pays 1 whole token per hour per home parcel pair
// (ResourceToken has 0 decimals), so a fresh account is otherwise an hour away
// from affording an entry buy-in.
//
// Katana only. The deployer is each token's `minter` (set in the constructor by
// init-katana-world.ts), so it can mint without any extra grant.
//
// Usage:
//   bun x tsx scripts/fund-katana-tester.ts <address> [amount]
//
// Reads token addresses from katana-addresses.json, written by
// scripts/init-katana-world.ts.

import { Account, CallData, RpcProvider, cairo, legacyDeployer } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.KATANA_RPC_URL ?? "https://siege-katana-production.up.railway.app";
const ADDRESSES_PATH = process.env.KATANA_ADDRESSES_PATH ?? "katana-addresses.json";

const ACCOUNT_ADDRESS =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const PRIVATE_KEY =
  process.env.DOJO_PRIVATE_KEY ??
  "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912";

const [recipient, amountArg] = process.argv.slice(2);
if (!recipient) {
  console.error("Usage: bun x tsx scripts/fund-katana-tester.ts <address> [amount]");
  process.exit(1);
}

const amount = BigInt(amountArg ?? "20");

function readAddresses(): { resources: Record<string, string> } {
  try {
    return JSON.parse(readFileSync(ADDRESSES_PATH, "utf-8"));
  } catch {
    console.error(
      `Could not read ${ADDRESSES_PATH} — run scripts/init-katana-world.ts first, it writes that file.`,
    );
    process.exit(1);
  }
}

const addresses = readAddresses();

const provider = new RpcProvider({ nodeUrl: RPC });
// Katana predeploys only the legacy UDC; see init-katana-world.ts.
const account = new Account({
  provider,
  address: ACCOUNT_ADDRESS,
  signer: PRIVATE_KEY,
  deployer: legacyDeployer,
});

const entries = Object.entries(addresses.resources);
console.log(`Minting ${amount} of each of ${entries.length} resource tokens to ${recipient}`);

const tx = await account.execute(
  entries.map(([, token]) => ({
    contractAddress: token,
    entrypoint: "mint",
    calldata: CallData.compile([recipient, cairo.uint256(amount)]),
  })),
);
await provider.waitForTransaction(tx.transaction_hash);

console.log(`✓ ${tx.transaction_hash}`);
for (const [symbol] of entries) console.log(`  ${symbol}: +${amount}`);
