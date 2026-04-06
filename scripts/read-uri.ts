// Read uri(token_id) from AbilityToken v2 and decode the result
import { RpcProvider } from "starknet";

const V2 = "0xe1f7c5fd7bd557ff5c69db03b49a62e40f3cc01ee11524ef862a71952ddcfe";
const TOKEN_ID = process.argv[2] || "1";

async function main() {
  const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });

  console.log(`Calling uri(${TOKEN_ID}) on AbilityToken v2...`);
  const result = await provider.callContract({
    contractAddress: V2,
    entrypoint: "uri",
    calldata: [TOKEN_ID, "0"], // u256: (low, high)
  });

  // ByteArray return: [num_full_words, ...words, pending_word, pending_word_len]
  const numWords = Number(result[0]);
  let decoded = "";

  // Decode full 31-byte words
  for (let i = 1; i <= numWords; i++) {
    const hex = BigInt(result[i]).toString(16).padStart(62, "0");
    for (let j = 0; j < 62; j += 2) {
      const byte = parseInt(hex.substring(j, j + 2), 16);
      if (byte > 0) decoded += String.fromCharCode(byte);
    }
  }

  // Decode pending word
  const pendingWord = result[numWords + 1];
  const pendingLen = Number(result[numWords + 2]);
  if (pendingLen > 0) {
    const hex = BigInt(pendingWord).toString(16).padStart(pendingLen * 2, "0");
    for (let j = 0; j < pendingLen * 2; j += 2) {
      decoded += String.fromCharCode(parseInt(hex.substring(j, j + 2), 16));
    }
  }

  console.log(`\nRaw data URI (first 100 chars): ${decoded.substring(0, 100)}...`);
  console.log(`Total length: ${decoded.length} chars`);

  // If it's a base64 data URI, decode the JSON
  const prefix = "data:application/json;base64,";
  if (decoded.startsWith(prefix)) {
    const b64 = decoded.substring(prefix.length);
    const json = Buffer.from(b64, "base64").toString("utf-8");
    console.log("\nDecoded JSON:");
    console.log(JSON.stringify(JSON.parse(json), null, 2));
  } else {
    console.log("\nNot a base64 data URI. Raw content:");
    console.log(decoded);
  }
}

main().catch((e) => console.error(e.message));
