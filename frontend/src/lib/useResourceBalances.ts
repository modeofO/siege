// useResourceBalances.ts — read ERC-20 resource token balances for a player
// via Torii's token index (pushed updates), not direct Starknet RPC calls.
import { useMemo } from "react";
import { useTokens } from "@dojoengine/sdk/react";
import { IS_KATANA, IS_MAINNET } from "./network";

// ERC-20 resource token addresses, keyed by network. Sepolia set matches
// scripts/init-sepolia-resource-config.sh; katana set is printed by
// scripts/init-katana-world.ts (keep all three in sync when redeploying).
const SEPOLIA_RESOURCE_TOKENS = {
  iron: "0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838",
  linen: "0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91",
  stone: "0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29",
  wood: "0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30",
  ember: "0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1",
  seeds: "0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35",
} as const;

const KATANA_RESOURCE_TOKENS = {
  iron: "0x3ec5e18038345d363133443d25f742d063f34319ba923ac1c9d354054209095",
  linen: "0x412a69d1b3ab113e6427ce92070c911995de6d31f7453940f82ea025b9d2bac",
  stone: "0x39af623e54128504f833728cf09fbd98835d825be4eb3a553d9186cab0c39d3",
  wood: "0x6f0245a8b9605beb8c68da8deda7382e8a794346eef1f49416e01f2d99cba34",
  ember: "0x68d51f72cad08dd349467877a22ee2ae3a31f0c343a111087211777f4074099",
  seeds: "0x6033ae1569611e683d42a3bcd73f7f5cf519ce5bce02e2e7b4235fecc559739",
} as const;

const MAINNET_RESOURCE_TOKENS = {
  iron: "0x2be5138b0e987d3f84fe7850861a17b4a608a9f583c45c8d647486c304d8947",
  linen: "0x1df4ab0d418e43322f1134470a959d59da22cd7c5b03f9ba1ae375f271589c2",
  stone: "0x4a1acd44fc316535f126ec06d7a60a0de356f6e3530c0940bd8c952c9949401",
  wood: "0x5fdb13ea34654956ca7fdda8da6d5ee3fb741d1c14ffe944d59e4288a7976c",
  ember: "0x1b784f80e5b87cbb6138954cd2016de77f7e641fe55c51baaa1c23908d35376",
  seeds: "0x4a6655dafd9505a9c96362475c6ad0f1744ba831c7503bf5b7d762f5f8613a7",
} as const;

export const RESOURCE_TOKENS = IS_KATANA
  ? KATANA_RESOURCE_TOKENS
  : IS_MAINNET
    ? MAINNET_RESOURCE_TOKENS
    : SEPOLIA_RESOURCE_TOKENS;

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
