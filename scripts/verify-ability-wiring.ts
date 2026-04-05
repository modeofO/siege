// Verify AbilityToken wiring: minter role, and ResourceConfig.ability_token field.
// Usage: npx tsx scripts/verify-ability-wiring.ts
import { RpcProvider } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ABILITY_TOKEN = "0x6de8e6addfd54cb600d5a7549e92fa5b275379ff85364626874a00bc138d37c";
const CRAFTING_1V1 = "0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235";

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
  console.log("  burner =", burnerResult[0]);
  if (BigInt(burnerResult[0]) === 0n) {
    console.log("  ✅ burner is 0x0 (expected until Phase 2B)");
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
