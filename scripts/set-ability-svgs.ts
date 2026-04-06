// Upload 5 placeholder ability SVGs to AbilityToken v2
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... ABILITY_TOKEN=0x... \
//   npx tsx scripts/set-ability-svgs.ts

import { Account, RpcProvider, CallData, byteArray } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
const ABILITY_TOKEN = process.env.ABILITY_TOKEN!;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY || !ABILITY_TOKEN) {
  console.error("Set DOJO_ACCOUNT_ADDRESS, DOJO_PRIVATE_KEY, ABILITY_TOKEN");
  process.exit(1);
}

// 5 placeholder SVGs — simple medieval icons, war-room palette
// Single-line to avoid encoding issues with byteArrayFromString
const SVGS: Record<number, string> = {
  1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1714"/><g transform="translate(100,100)"><rect x="-4" y="-70" width="8" height="100" fill="#c8a44e" rx="2"/><rect x="-20" y="20" width="40" height="8" fill="#c8a44e" rx="2"/><rect x="-6" y="28" width="12" height="30" fill="#7a7060" rx="3"/><circle cx="0" cy="62" r="5" fill="#c8a44e"/></g><text x="100" y="185" text-anchor="middle" fill="#c8a44e" font-family="serif" font-size="14">Siege Sword</text></svg>',
  2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1714"/><g transform="translate(100,95)"><ellipse cx="0" cy="0" rx="40" ry="55" fill="none" stroke="#6b8cae" stroke-width="4"/><ellipse cx="0" cy="-10" rx="30" ry="40" fill="#6b8cae" opacity="0.3"/><circle cx="0" cy="-35" r="6" fill="#c8a44e"/></g><text x="100" y="185" text-anchor="middle" fill="#6b8cae" font-family="serif" font-size="14">Stone Cloak</text></svg>',
  3: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1714"/><g transform="translate(100,90)"><ellipse cx="0" cy="10" rx="25" ry="35" fill="#ff6633" opacity="0.6"/><ellipse cx="-10" cy="-5" rx="15" ry="30" fill="#ff6633" opacity="0.8"/><ellipse cx="10" cy="0" rx="15" ry="25" fill="#ff6633" opacity="0.7"/><ellipse cx="0" cy="-15" rx="10" ry="20" fill="#c8a44e" opacity="0.9"/></g><text x="100" y="185" text-anchor="middle" fill="#ff6633" font-family="serif" font-size="14">Ember Blast</text></svg>',
  4: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1714"/><g transform="translate(100,85)"><circle cx="0" cy="0" r="30" fill="none" stroke="#9966cc" stroke-width="3"/><circle cx="-10" cy="-8" r="5" fill="#9966cc"/><circle cx="10" cy="-8" r="5" fill="#9966cc"/><path d="M-12,10 Q0,22 12,10" fill="none" stroke="#9966cc" stroke-width="3"/></g><text x="100" y="185" text-anchor="middle" fill="#9966cc" font-family="serif" font-size="14">Hex</text></svg>',
  5: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1a1714"/><g transform="translate(100,90)"><rect x="-30" y="-20" width="60" height="50" fill="none" stroke="#66cc66" stroke-width="4" rx="3"/><rect x="-25" y="-40" width="10" height="25" fill="#66cc66"/><rect x="-5" y="-50" width="10" height="35" fill="#66cc66"/><rect x="15" y="-40" width="10" height="25" fill="#66cc66"/></g><text x="100" y="185" text-anchor="middle" fill="#66cc66" font-family="serif" font-size="14">Fortify</text></svg>',
};

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  for (const [id, svg] of Object.entries(SVGS)) {
    console.log(`Setting SVG for ability ${id}...`);
    const tx = await account.execute({
      contractAddress: ABILITY_TOKEN,
      entrypoint: "set_ability_svg",
      calldata: [id, ...CallData.compile(byteArray.byteArrayFromString(svg))],
    });
    console.log(`  tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    console.log(`  Done.`);
  }

  console.log("\nAll 5 SVGs uploaded.");
}

main().catch((e) => {
  console.error("Failed:", e.message || e);
  process.exit(1);
});
