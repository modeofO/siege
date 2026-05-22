import { RpcProvider, Account, CallData } from "starknet";
import seed from "../scripts/tiling-generator/seed.json";

const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;

const WORLD_SYSTEM = "0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea";
const ABILITY_TOKEN = "0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05";
const NEW_CRAFTING = "0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  // 1. Initialize world
  console.log(`Initializing world with ${seed.tile_count} tiles...`);
  const tx1 = await account.execute({
    contractAddress: WORLD_SYSTEM,
    entrypoint: "initialize_world",
    calldata: CallData.compile({
      tile_shapes: seed.tile_shapes,
      sector_ids: seed.sector_ids,
      zones: seed.zones,
      adj_tile_ids: seed.adj_flat,
    }),
  });
  console.log("initialize_world tx:", tx1.transaction_hash);
  await provider.waitForTransaction(tx1.transaction_hash);
  console.log("World initialized!");

  // 2. Set AbilityToken minter (crafting_1v1)
  console.log("Setting AbilityToken minter...");
  const tx2 = await account.execute({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "set_minter",
    calldata: [NEW_CRAFTING],
  });
  console.log("set_minter tx:", tx2.transaction_hash);
  await provider.waitForTransaction(tx2.transaction_hash);

  // 3. Set AbilityToken minter2 (world_system)
  console.log("Setting AbilityToken minter2...");
  const tx3 = await account.execute({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "set_minter2",
    calldata: [WORLD_SYSTEM],
  });
  console.log("set_minter2 tx:", tx3.transaction_hash);
  await provider.waitForTransaction(tx3.transaction_hash);

  console.log("All done!");
}

main().catch((e) => {
  console.error("Failed:", e.message || e);
  process.exit(1);
});
