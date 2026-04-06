// Set actions_1v1.ability_token to the v2 address
import { Account, RpcProvider } from "starknet";

const V2 = "0xe1f7c5fd7bd557ff5c69db03b49a62e40f3cc01ee11524ef862a71952ddcfe";
const ACTIONS = "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c";

async function main() {
  const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
  const account = new Account({
    provider,
    address: process.env.DOJO_ACCOUNT_ADDRESS!,
    signer: process.env.DOJO_PRIVATE_KEY!,
  });

  console.log("Setting ability_token to v2...");
  const tx = await account.execute({
    contractAddress: ACTIONS,
    entrypoint: "set_ability_token",
    calldata: [V2],
  });
  console.log("  tx:", tx.transaction_hash);
  await provider.waitForTransaction(tx.transaction_hash);
  console.log("  Done.");
}

main().catch((e) => {
  console.error(e.message?.substring(0, 300));
  process.exit(1);
});
