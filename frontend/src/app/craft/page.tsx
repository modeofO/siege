"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RpcProvider } from "starknet";
import { useAccount } from "@/app/providers";
import { useResourceBalances, type ResourceBalances } from "@/lib/useResourceBalances";
import {
  ABILITIES,
  canAfford,
  craftAbility,
  type AbilityCost,
} from "@/lib/craftingContracts";
import { LAST_MATCH_KEY } from "@/components/Navbar";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";
const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "https://api.cartridge.gg/x/siege-dojo/torii";

type AbilityInventory = {
  siege_sword: number;
  stone_cloak: number;
  ember_blast: number;
  hex: number;
  fortify: number;
};

const EMPTY_INVENTORY: AbilityInventory = {
  siege_sword: 0,
  stone_cloak: 0,
  ember_blast: 0,
  hex: 0,
  fortify: 0,
};

const ABILITY_FIELDS: (keyof AbilityInventory)[] = [
  "siege_sword",
  "stone_cloak",
  "ember_blast",
  "hex",
  "fortify",
];

const RESOURCE_COLORS: Record<string, string> = {
  iron: "text-[#a0a0b0]",
  linen: "text-[#d4a574]",
  stone: "text-[#8a8a9a]",
  wood: "text-[#8b6914]",
  ember: "text-[#ff6633]",
  seeds: "text-[#66cc66]",
};

async function fetchAbilities(playerAddr: string): Promise<AbilityInventory> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          siegeDojoPlayerAbilitiesModels(where: { player: "${playerAddr}" }) {
            edges { node { siege_sword stone_cloak ember_blast hex fortify } }
          }
        }`,
      }),
    });
    const data = await res.json();
    const node = data?.data?.siegeDojoPlayerAbilitiesModels?.edges?.[0]?.node;
    if (!node) return EMPTY_INVENTORY;
    return {
      siege_sword: Number(node.siege_sword) || 0,
      stone_cloak: Number(node.stone_cloak) || 0,
      ember_blast: Number(node.ember_blast) || 0,
      hex: Number(node.hex) || 0,
      fortify: Number(node.fortify) || 0,
    };
  } catch {
    return EMPTY_INVENTORY;
  }
}

export default function CraftPage() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";
  const resources = useResourceBalances(address);

  const [inventory, setInventory] = useState<AbilityInventory>(EMPTY_INVENTORY);
  const [crafting, setCrafting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastMatch, setLastMatch] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLastMatch(sessionStorage.getItem(LAST_MATCH_KEY));
    } catch {
      // sessionStorage may be unavailable — leave as null
    }
  }, []);

  useEffect(() => {
    if (!address) {
      setInventory(EMPTY_INVENTORY);
      return;
    }
    let cancelled = false;
    fetchAbilities(address).then((inv) => {
      if (!cancelled) setInventory(inv);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleCraft = async (abilityId: number, cost: AbilityCost) => {
    if (!account) return;
    setCrafting(abilityId);
    setError("");
    try {
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      const txHash = await craftAbility(account, abilityId, cost);
      await provider.waitForTransaction(txHash);
      if (address) {
        const inv = await fetchAbilities(address);
        setInventory(inv);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setCrafting(null);
    }
  };

  const resourceBalances = resources as unknown as Record<string, number>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-wider font-serif text-[#c8a44e]">
          FORGE YOUR ARSENAL
        </h1>
        <p className="text-sm text-[#7a7060]">
          Burn resources to craft abilities. Use them in battle.
        </p>
      </div>

      {lastMatch && (
        <div className="flex justify-center">
          <Link
            href={lastMatch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded border border-[#c8a44e]/40 bg-[#c8a44e]/10 text-[#c8a44e] text-xs tracking-wider font-serif hover:bg-[#c8a44e]/20 transition-colors"
          >
            ← RETURN TO MATCH
          </Link>
        </div>
      )}

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5 text-center">
          Connect your wallet to craft abilities
        </div>
      )}

      {/* Resource balances */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {(Object.keys(resources) as (keyof ResourceBalances)[]).map((name) => (
          <div
            key={name}
            className="flex items-center gap-1 px-3 py-1 bg-[#252019] rounded border border-[#3d3428] text-sm"
          >
            <span className={`font-bold ${RESOURCE_COLORS[name] || "text-[#d4cfc6]"}`}>
              {resources[name]}
            </span>
            <span className="text-[#7a7060] text-xs capitalize">{name}</span>
          </div>
        ))}
      </div>

      {/* Ability cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ABILITIES.map((ability) => {
          const cost = ability.cost as unknown as AbilityCost;
          const affordable = canAfford(cost, resourceBalances);
          const owned = inventory[ABILITY_FIELDS[ability.id - 1]];
          const isCrafting = crafting === ability.id;

          return (
            <div
              key={ability.id}
              className="border border-[#3d3428] rounded-lg p-4 bg-[#1a1714] space-y-3"
            >
              <div className="flex justify-between items-start">
                <h3 className="text-sm font-bold font-serif text-[#d4cfc6]">
                  {ability.name}
                </h3>
                {owned > 0 && (
                  <span className="text-[10px] bg-[#c8a44e]/20 text-[#c8a44e] px-2 py-0.5 rounded">
                    Owned: {owned}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7a7060]">{ability.effect}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(ability.cost).map(([resource, amount]) => {
                  const hasEnough = (resourceBalances[resource] || 0) >= amount;
                  return (
                    <span
                      key={resource}
                      className={`text-xs px-2 py-0.5 rounded border ${
                        hasEnough
                          ? "border-[#3d3428] text-[#d4cfc6]"
                          : "border-[#ff3344]/30 text-[#ff3344]"
                      }`}
                    >
                      {amount} <span className="capitalize">{resource}</span>
                    </span>
                  );
                })}
              </div>
              <button
                onClick={() => handleCraft(ability.id, cost)}
                disabled={!isConnected || !affordable || isCrafting}
                className="w-full py-2 rounded font-bold tracking-wider text-sm font-serif transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] hover:bg-[#c8a44e]/20"
              >
                {isCrafting ? "CRAFTING..." : "CRAFT"}
              </button>
            </div>
          );
        })}
      </div>

      {error && <div className="text-[#ff3344] text-sm text-center">{error}</div>}

      <div className="text-center">
        <Link
          href="/"
          className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
