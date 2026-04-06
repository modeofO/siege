// Upload ability SVGs to AbilityToken v2 from frontend/public/sprites/abilities/
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... ABILITY_TOKEN=0x... \
//   npx tsx scripts/set-ability-svgs.ts

import { Account, RpcProvider } from "starknet";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
const ABILITY_TOKEN = process.env.ABILITY_TOKEN!;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY || !ABILITY_TOKEN) {
  console.error("Set DOJO_ACCOUNT_ADDRESS, DOJO_PRIVATE_KEY, ABILITY_TOKEN");
  process.exit(1);
}

// Map ability IDs to SVG filenames
const ABILITIES: { id: number; file: string }[] = [
  { id: 1, file: "siege-sword.svg" },
  { id: 2, file: "stone-cloak.svg" },
  { id: 3, file: "ember-blast.svg" },
  { id: 4, file: "hex.svg" },
  { id: 5, file: "fortify.svg" },
];

const SPRITES_DIR = resolve(__dirname, "../frontend/public/sprites/abilities");

/**
 * Encode a string as Cairo ByteArray calldata (array of felt252 values).
 * ByteArray layout: [num_full_words, word0, word1, ..., pending_word, pending_word_len]
 * Each full word is 31 bytes packed into a felt252.
 */
function encodeByteArrayCalldata(str: string): string[] {
  const bytes = Buffer.from(str, "utf-8");
  const BYTES_PER_WORD = 31;
  const numFullWords = Math.floor(bytes.length / BYTES_PER_WORD);
  const pendingLen = bytes.length % BYTES_PER_WORD;

  const calldata: string[] = [];
  // Number of full 31-byte words
  calldata.push(numFullWords.toString());

  // Full words
  for (let i = 0; i < numFullWords; i++) {
    const chunk = bytes.subarray(i * BYTES_PER_WORD, (i + 1) * BYTES_PER_WORD);
    calldata.push("0x" + chunk.toString("hex"));
  }

  // Pending word (remaining bytes)
  if (pendingLen > 0) {
    const pending = bytes.subarray(numFullWords * BYTES_PER_WORD);
    calldata.push("0x" + pending.toString("hex"));
  } else {
    calldata.push("0x0");
  }

  // Pending word length
  calldata.push(pendingLen.toString());

  return calldata;
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  for (const ability of ABILITIES) {
    const svgPath = resolve(SPRITES_DIR, ability.file);
    const svg = readFileSync(svgPath, "utf-8").trim();
    console.log(`Setting SVG for ability ${ability.id} (${ability.file}, ${svg.length} bytes)...`);

    const svgCalldata = encodeByteArrayCalldata(svg);

    const tx = await account.execute({
      contractAddress: ABILITY_TOKEN,
      entrypoint: "set_ability_svg",
      calldata: [ability.id.toString(), ...svgCalldata],
    });
    console.log(`  tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    console.log(`  Done.`);
  }

  console.log("\nAll 5 SVGs uploaded from", SPRITES_DIR);
}

main().catch((e) => {
  console.error("Failed:", e.message || e);
  process.exit(1);
});
