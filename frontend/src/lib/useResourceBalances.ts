// useResourceBalances.ts — read ERC-20 resource token balances for a player
// via Torii's token index (pushed updates), not direct Starknet RPC calls.
import { useMemo } from "react";
import { useTokens } from "@dojoengine/sdk/react";

// ERC-20 token addresses (deployed on Sepolia).
export const RESOURCE_TOKENS = {
  iron: "0x04443a152ebfe64b834cf7aa904b56ee6a97b9fcf7ee6f4e9ad272596e3d7a73",
  linen: "0x01b57dd0b9b246bf39185e23cd7c794d2bf6ad7088c8a3325f91809f6c4588c0",
  stone: "0x051769e3c9a978e30d7cacdb2491e057c233fbd99ca36a8bb3c544894b3b3cc2",
  wood: "0x05dc381b9755ae512fad38462887e2587d17661b833bbd22a32130db8fb20a9b",
  ember: "0x043415cab3dbd5d07c05da8aa135c92a1e0fd008c7eb0e09cef8be0e5065887d",
  seeds: "0x077ee09267cf3ded08f68c0c3eb74e2e5e01eae82d7691b48fb586768ea16f47",
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
