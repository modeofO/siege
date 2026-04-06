import { RpcProvider } from "starknet";
const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
async function main() {
  const address = "0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95";
  // ETH balance
  const ethResult = await provider.callContract({
    contractAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    entrypoint: "balanceOf",
    calldata: [address],
  });
  console.log("ETH balance (low felt):", ethResult[0], "=", Number(BigInt(ethResult[0])) / 1e18, "ETH");
  // STRK balance
  const strkResult = await provider.callContract({
    contractAddress: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    entrypoint: "balanceOf",
    calldata: [address],
  });
  console.log("STRK balance (low felt):", strkResult[0], "=", Number(BigInt(strkResult[0])) / 1e18, "STRK");
}
main().catch(e => console.error(e.message));
