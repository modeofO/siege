// One-shot wire script: set_minter and/or set_base_uri on AbilityToken
//
// Usage:
//   DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... \
//   ABILITY_TOKEN=0x... \
//   CRAFTING_1V1=0x... \          # optional — set_minter only runs if provided
//   BASE_URI=https://... \        # optional — set_base_uri only runs if provided
//   npx tsx scripts/wire-ability-token.ts
//
// At least one of CRAFTING_1V1 or BASE_URI must be set. Running both is fine.

import { Account, RpcProvider, CallData, byteArray } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;
const ABILITY_TOKEN = process.env.ABILITY_TOKEN;
const CRAFTING_1V1 = process.env.CRAFTING_1V1;
const BASE_URI = process.env.BASE_URI;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY || !ABILITY_TOKEN) {
  console.error("Missing required env vars: DOJO_ACCOUNT_ADDRESS, DOJO_PRIVATE_KEY, ABILITY_TOKEN");
  process.exit(1);
}

if (!CRAFTING_1V1 && !BASE_URI) {
  console.error("At least one of CRAFTING_1V1 or BASE_URI must be set.");
  process.exit(1);
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS!, signer: PRIVATE_KEY! });

  if (CRAFTING_1V1) {
    console.log("Setting minter on AbilityToken...");
    const setMinterTx = await account.execute({
      contractAddress: ABILITY_TOKEN!,
      entrypoint: "set_minter",
      calldata: [CRAFTING_1V1],
    });
    console.log("  tx:", setMinterTx.transaction_hash);
    await provider.waitForTransaction(setMinterTx.transaction_hash);
    console.log("  Done. Minter =", CRAFTING_1V1);
  }

  if (BASE_URI) {
    console.log("Setting base URI on AbilityToken...");
    const setUriTx = await account.execute({
      contractAddress: ABILITY_TOKEN!,
      entrypoint: "set_base_uri",
      calldata: CallData.compile(byteArray.byteArrayFromString(BASE_URI)),
    });
    console.log("  tx:", setUriTx.transaction_hash);
    await provider.waitForTransaction(setUriTx.transaction_hash);
    console.log("  Done. Base URI =", BASE_URI);
  }

  console.log("\nWired successfully.");
}

main().catch((e) => {
  console.error("Wiring failed:", e.message || e);
  process.exit(1);
});
