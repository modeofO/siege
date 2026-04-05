// useResourceBalances.ts — query ERC-20 resource token balances for a player
import { useEffect, useState } from "react";
import { RpcProvider } from "starknet";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

// ERC-20 token addresses (deployed on Sepolia)
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

const POLL_INTERVAL = 8000; // Less frequent than game state — balances don't change mid-round

export function useResourceBalances(playerAddress: string | undefined): ResourceBalances {
  const [balances, setBalances] = useState<ResourceBalances>({
    iron: 0, linen: 0, stone: 0, wood: 0, ember: 0, seeds: 0,
  });

  useEffect(() => {
    if (!playerAddress) return;

    const provider = new RpcProvider({ nodeUrl: RPC_URL });

    const fetchBalances = async () => {
      try {
        const results: Partial<ResourceBalances> = {};

        for (const [name, addr] of Object.entries(RESOURCE_TOKENS)) {
          try {
            const result = await provider.callContract({
              contractAddress: addr,
              entrypoint: "balance_of",
              calldata: [playerAddress],
            });
            // Result is [low, high] u256 — just use low since values are small
            results[name as keyof ResourceBalances] = Number(result[0] || 0);
          } catch {
            results[name as keyof ResourceBalances] = 0;
          }
        }

        setBalances(results as ResourceBalances);
      } catch {
        // Silently fail — balances will show 0
      }
    };

    const t = setTimeout(() => { void fetchBalances(); }, 0);
    const i = setInterval(() => { void fetchBalances(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return balances;
}
