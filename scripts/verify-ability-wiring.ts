// Verify AbilityToken wiring for crafting/staking.
// Usage: npx tsx scripts/verify-ability-wiring.ts
import { RpcProvider } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ABILITY_TOKEN = "0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05";
const CRAFTING_1V1 = "0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130";

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });

  console.log("Reading AbilityToken.minter()...");
  const minterResult = await provider.callContract({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "minter",
    calldata: [],
  });
  const minter = minterResult[0];
  console.log("  minter =", minter);
  const expected = BigInt(CRAFTING_1V1);
  const actual = BigInt(minter);
  if (actual === expected) {
    console.log("  ✅ minter matches crafting_1v1");
  } else {
    console.log("  ❌ MISMATCH — expected", CRAFTING_1V1);
  }

  console.log("\nReading AbilityToken.burner()...");
  const burnerResult = await provider.callContract({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "burner",
    calldata: [],
  });
  const burner = burnerResult[0];
  console.log("  burner =", burner);
  if (BigInt(burner) === expected) {
    console.log("  ✅ burner matches crafting_1v1");
  } else {
    console.log("  ❌ MISMATCH — expected", CRAFTING_1V1);
  }

  console.log("\nReading AbilityToken.admin()...");
  const adminResult = await provider.callContract({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "admin",
    calldata: [],
  });
  console.log("  admin =", adminResult[0]);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
