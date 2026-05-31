// useResourceBalances.ts — read ERC-20 resource token balances for a player
// via Torii's token index (pushed updates), not direct Starknet RPC calls.
import { useMemo } from "react";
import { useTokens } from "@dojoengine/sdk/react";

// ERC-20 token addresses (deployed on Sepolia).
export const RESOURCE_TOKENS = {
  iron: "0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838",
  linen: "0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91",
  stone: "0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29",
  wood: "0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30",
  ember: "0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1",
  seeds: "0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35",
} as const;

export interface ResourceBalances {
  iron: number;
  linen: number;
  stone: number;
  wood: number;
  ember: number;
  seeds: number;
}

const EMPTY_BALANCES: ResourceBalances = {
  iron: 0,
  linen: 0,
  stone: 0,
  wood: 0,
  ember: 0,
  seeds: 0,
};

// Normalize addresses for comparison (drop leading zeros, lowercase).
function normalizeAddr(a: string): string {
  try {
    return "0x" + BigInt(a).toString(16);
  } catch {
    return a.toLowerCase();
  }
}

const TOKEN_LOOKUP: Record<string, keyof ResourceBalances> = Object.fromEntries(
  Object.entries(RESOURCE_TOKENS).map(([k, v]) => [normalizeAddr(v), k as keyof ResourceBalances]),
);

const RESOURCE_ADDRS = Object.values(RESOURCE_TOKENS);

export function useResourceBalances(playerAddress: string | undefined): ResourceBalances {
  // Stable request object — a new array/object reference every render would
  // cause useTokens to tear down and re-open the subscription on every render.
  const request = useMemo(
    () => ({
      contractAddresses: RESOURCE_ADDRS,
      accountAddresses: playerAddress ? [playerAddress] : [],
    }),
    [playerAddress],
  );

  const { balances } = useTokens(request);

  return useMemo<ResourceBalances>(() => {
    if (!playerAddress) return EMPTY_BALANCES;
    const result: ResourceBalances = { ...EMPTY_BALANCES };
    for (const bal of balances) {
      const key = TOKEN_LOOKUP[normalizeAddr(bal.contract_address)];
      if (!key) continue;
      try {
        // balance is u256 as hex; our values are small (< 2^32), so number is safe
        result[key] = Number(BigInt(bal.balance));
      } catch {
        result[key] = 0;
      }
    }
    return result;
  }, [playerAddress, balances]);
}
