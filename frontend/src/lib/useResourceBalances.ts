// useResourceBalances.ts — read ERC-20 resource token balances for a player
// via Torii's token index (pushed updates), not direct Starknet RPC calls.
import { useMemo } from "react";
import { useTokens } from "@dojoengine/sdk/react";

// ERC-20 token addresses (deployed on Sepolia).
export const RESOURCE_TOKENS = {
  iron:  "0x2154b81255def0de319c2310b38eb54484794e64b54a7a9adce583e4079a77b",
  linen: "0x511a65b969eb95a9e510b7809dff5e9c53ac325002423dea0e35ce0a1880f2b",
  stone: "0x28f46611d132cab82fb0afb6614d95f13dbd20dca76d5d4601fc58acb71552d",
  wood:  "0x1014ccf9475d916d5164b44edc0480a2f0cd4e67b5bef6acd22a40c01e83c27",
  ember: "0x7e6b21bc243e02e8afac07822d58ec3f8b1c97dedead6849fd96d3026589b4e",
  seeds: "0x704234ef94400154669e56ac5a490796b7bf2a277092ea2be46e99eedd03a50",
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
  iron: 0, linen: 0, stone: 0, wood: 0, ember: 0, seeds: 0,
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
  Object.entries(RESOURCE_TOKENS).map(([k, v]) => [
    normalizeAddr(v),
    k as keyof ResourceBalances,
  ]),
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
