// Grow the live hex world in place via world_system.expand_world.
//
// Network-aware: point MANIFEST_PATH + RPC_URL at the target network.
// Mainnet needs a v0_9 RPC (starknet.js 8.9.x speaks spec 0.9.0 only —
// Cartridge's mainnet RPC serves 0.10.2; use the Alchemy v0_9 endpoint,
// same as init-mainnet-world.ts).
//
// Usage:
//   source deploy.mainnet.env && \
//   RPC_URL="https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/demo" \
//   MANIFEST_PATH=manifest_mainnet.json \
//   bun x tsx scripts/expand-world.ts 12 8
//
// Grow in steps (e.g. 96 -> 160 -> 300); one call appends
// new_cols*new_rows - cur_cols*cur_rows parcels in a single transaction.

import { Account, RpcProvider } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://siege-katana-production.up.railway.app";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  throw new Error("Set DOJO_ACCOUNT_ADDRESS / DOJO_PRIVATE_KEY (source deploy env first)");
}

const [colsArg, rowsArg] = process.argv.slice(2);
const newCols = Number(colsArg);
const newRows = Number(rowsArg);
if (!Number.isInteger(newCols) || !Number.isInteger(newRows) || newCols <= 0 || newRows <= 0) {
  throw new Error("Usage: bun x tsx scripts/expand-world.ts <new_cols> <new_rows>");
}

type Manifest = { contracts: { address: string; tag: string }[] };

async function main() {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const ws = manifest.contracts.find((c) => c.tag === "siege_dojo-world_system");
  if (!ws) throw new Error(`Missing siege_dojo-world_system in ${MANIFEST_PATH}`);

  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
  });

  console.log(`expand_world(${newCols}, ${newRows}) on ${ws.address} via ${RPC}`);
  const { transaction_hash } = await account.execute([
    {
      contractAddress: ws.address,
      entrypoint: "expand_world",
      calldata: [newCols.toString(), newRows.toString()],
    },
  ]);
  console.log(`tx: ${transaction_hash}`);
  await provider.waitForTransaction(transaction_hash);
  console.log("expand_world confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
