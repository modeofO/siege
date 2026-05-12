// Check ERC-20 resource balances for a wallet
// Usage: npx tsx scripts/check-balances.ts <wallet_address>

import { RpcProvider } from "starknet";

const addr = process.argv[2];
if (!addr) {
  console.error("Usage: npx tsx scripts/check-balances.ts 0x<wallet_address>");
  process.exit(1);
}

const p = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });

const tokens: Record<string, string> = {
  IRON:  "0x04443a152ebfe64b834cf7aa904b56ee6a97b9fcf7ee6f4e9ad272596e3d7a73",
  LINEN: "0x01b57dd0b9b246bf39185e23cd7c794d2bf6ad7088c8a3325f91809f6c4588c0",
  STONE: "0x051769e3c9a978e30d7cacdb2491e057c233fbd99ca36a8bb3c544894b3b3cc2",
  WOOD:  "0x05dc381b9755ae512fad38462887e2587d17661b833bbd22a32130db8fb20a9b",
  EMBER: "0x043415cab3dbd5d07c05da8aa135c92a1e0fd008c7eb0e09cef8be0e5065887d",
  SEEDS: "0x077ee09267cf3ded08f68c0c3eb74e2e5e01eae82d7691b48fb586768ea16f47",
};

async function main() {
  console.log(`Balances for ${addr}:\n`);
  for (const [name, token] of Object.entries(tokens)) {
    try {
      const r = await p.callContract({ contractAddress: token, entrypoint: "balance_of", calldata: [addr] });
      console.log(`  ${name}: ${Number(r[0])}`);
    } catch {
      console.log(`  ${name}: error`);
    }
  }
}

main();
