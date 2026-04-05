// Metadata route handler for ERC-1155 ability tokens.
//
// Called by the Cartridge wallet when it fetches `uri(token_id)` from the AbilityToken
// contract and substitutes {id} with the actual token ID. Returns OpenSea-format JSON
// with name, description, image, and attributes.
//
// The route parses the ID as either decimal or hex (wallets vary). It reads the
// shared ABILITIES constant from craftingContracts.ts so this file never drifts
// from the on-chain ability list.
//
// Images live at /sprites/abilities/<id>.png. If the PNG doesn't exist yet, the
// wallet renders a broken image icon — acceptable for testnet.

import { NextResponse } from "next/server";
import { ABILITIES } from "@/lib/craftingContracts";

// Parse an ID that may come in as "1", "0x1", "0x0…01" (64-char padded), etc.
function parseTokenId(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  try {
    const asBigInt = cleaned.startsWith("0x") ? BigInt(cleaned) : BigInt(cleaned);
    // ERC-1155 IDs can technically be up to 2^256, but ours are 1..5
    if (asBigInt < BigInt(0) || asBigInt > BigInt(2147483647)) return null;
    return Number(asBigInt);
  } catch {
    return null;
  }
}

function costToString(cost: Record<string, number>): string {
  return Object.entries(cost)
    .map(([resource, amount]) => `${amount} ${resource.charAt(0).toUpperCase() + resource.slice(1)}`)
    .join(" + ");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = parseTokenId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }

  const ability = ABILITIES.find((a) => a.id === id);
  if (!ability) {
    return NextResponse.json({ error: "Unknown ability" }, { status: 404 });
  }

  // Derive host from the request URL so the route works in dev and prod
  // without hardcoded hostnames.
  const { origin } = new URL(request.url);

  const metadata = {
    name: ability.name,
    description: ability.effect,
    image: `${origin}/sprites/abilities/${id}.png`,
    attributes: [
      { trait_type: "Cost", value: costToString(ability.cost as Record<string, number>) },
      { trait_type: "Phase", value: "2B" },
    ],
  };

  return NextResponse.json(metadata, {
    headers: {
      // Short cache so art/description updates propagate reasonably fast
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
