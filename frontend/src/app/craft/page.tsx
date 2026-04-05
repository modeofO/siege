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

  // Per-ability card renderer. `side` drives the Y-rotation so the card
  // leans toward the book's spine, matching the curve of the open pages.
  const renderAbilityCard = (ability: typeof ABILITIES[number], side: "left" | "right") => {
    const cost = ability.cost as unknown as AbilityCost;
    const affordable = canAfford(cost, resourceBalances);
    const owned = inventory[ABILITY_FIELDS[ability.id - 1]];
    const isCrafting = crafting === ability.id;

    const rotY = side === "left" ? 6 : -6;
    const baseTransform = `rotateX(14deg) rotateY(${rotY}deg)`;

    return (
      <div
        key={ability.id}
        className="relative rounded-sm p-3 space-y-2"
        style={{
          background:
            "linear-gradient(180deg, rgba(232, 214, 170, 0.92) 0%, rgba(212, 188, 138, 0.88) 100%)",
          border: "1px solid rgba(74, 48, 22, 0.55)",
          boxShadow: [
            "0 6px 14px rgba(30, 18, 8, 0.55)",
            "0 2px 4px rgba(30, 18, 8, 0.35)",
            "inset 0 1px 0 rgba(255, 240, 200, 0.6)",
            "inset 0 -1px 0 rgba(74, 48, 22, 0.35)",
          ].join(", "),
          transform: baseTransform,
          transformOrigin: "center bottom",
          transformStyle: "preserve-3d",
          transition: "transform 300ms ease-out",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `${baseTransform} translateZ(8px)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = baseTransform;
        }}
      >
        <div className="flex justify-between items-start">
          <h3
            className="text-sm font-bold font-serif"
            style={{ color: "#3b2410", textShadow: "0 1px 0 rgba(255,240,200,0.5)" }}
          >
            {ability.name}
          </h3>
          {owned > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-sm"
              style={{
                background: "rgba(74, 48, 22, 0.85)",
                color: "#e8d6aa",
                boxShadow: "inset 0 1px 0 rgba(255,240,200,0.25)",
              }}
            >
              Owned: {owned}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-snug" style={{ color: "#5a3b1e" }}>
          {ability.effect}
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ability.cost).map(([resource, amount]) => {
            const hasEnough = (resourceBalances[resource] || 0) >= amount;
            return (
              <span
                key={resource}
                className="text-[10px] px-1.5 py-0.5 rounded-sm"
                style={{
                  background: hasEnough
                    ? "rgba(74, 48, 22, 0.12)"
                    : "rgba(178, 34, 52, 0.15)",
                  border: hasEnough
                    ? "1px solid rgba(74, 48, 22, 0.4)"
                    : "1px solid rgba(178, 34, 52, 0.5)",
                  color: hasEnough ? "#3b2410" : "#8b1a2a",
                }}
              >
                {amount} <span className="capitalize">{resource}</span>
              </span>
            );
          })}
        </div>
        <button
          onClick={() => handleCraft(ability.id, cost)}
          disabled={!isConnected || !affordable || isCrafting}
          className="w-full py-1.5 rounded-sm font-bold tracking-wider text-xs font-serif transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background:
              "linear-gradient(180deg, rgba(74, 48, 22, 0.9) 0%, rgba(48, 30, 12, 0.95) 100%)",
            color: "#e8d6aa",
            border: "1px solid rgba(30, 18, 8, 0.8)",
            boxShadow: [
              "inset 0 1px 0 rgba(255, 220, 160, 0.25)",
              "inset 0 -2px 4px rgba(0, 0, 0, 0.4)",
              "0 2px 4px rgba(30, 18, 8, 0.4)",
            ].join(", "),
          }}
        >
          {isCrafting ? "CRAFTING..." : "CRAFT"}
        </button>
      </div>
    );
  };

  // Split the 5 abilities across the two pages: 2 left, 3 right
  const leftAbilities = ABILITIES.slice(0, 2);
  const rightAbilities = ABILITIES.slice(2, 5);

  return (
    <div className="relative min-h-[90vh]">
      {/* Open book background — fills the viewport behind the content */}
      <div
        aria-hidden
        className="pointer-events-none hidden lg:block fixed inset-0 z-0"
        style={{
          backgroundImage: "url('/sprites/book_open.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          backgroundSize: "min(92vw, 1500px) auto",
        }}
      />

      {/* Two-page spread — bounded to match the book's visible page area.
          The container width matches the pages-visible zone of the book sprite. */}
      <div
        className="relative z-10 mx-auto"
        style={{
          width: "min(68vw, 1040px)",
          paddingTop: "8vh",
          paddingBottom: "7vh",
          perspective: "1800px",
          perspectiveOrigin: "center 40%",
        }}
      >
        <div
          className="flex items-stretch"
          style={{
            // spine gap roughly matches the visual spine in the sprite (~6% of width)
            gap: "6%",
          }}
        >
          {/* ============ LEFT PAGE ============ */}
          <div
            className="flex-1 flex flex-col gap-3 min-w-0"
            style={{
              padding: "0 5% 0 6%",
            }}
          >
            {/* Header block — same tilt as the left-page cards so the title,
                subtitle, return button, and resource pills feel embedded in
                the curved page surface */}
            <div
              className="flex flex-col gap-2"
              style={{
                transform: "rotateX(14deg) rotateY(6deg)",
                transformOrigin: "center bottom",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Title + subtitle */}
              <div className="text-center space-y-1">
                <h1
                  className="text-lg xl:text-xl font-bold tracking-wider font-serif"
                  style={{
                    color: "#3b2410",
                    textShadow: "0 1px 0 rgba(255,240,200,0.5)",
                  }}
                >
                  FORGE YOUR ARSENAL
                </h1>
                <p className="text-[10px]" style={{ color: "#5a3b1e" }}>
                  Burn resources to craft abilities.
                </p>
              </div>

              {/* Return to match pill */}
              {lastMatch && (
                <div className="flex justify-center">
                  <Link
                    href={lastMatch}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-sm text-[10px] tracking-wider font-serif transition-colors"
                    style={{
                      background: "rgba(74, 48, 22, 0.15)",
                      border: "1px solid rgba(74, 48, 22, 0.5)",
                      color: "#3b2410",
                    }}
                  >
                    ← RETURN TO MATCH
                  </Link>
                </div>
              )}

              {/* Not-connected warning */}
              {!isConnected && (
                <div
                  className="text-[11px] text-center rounded-sm p-2"
                  style={{
                    background: "rgba(178, 34, 52, 0.12)",
                    border: "1px solid rgba(178, 34, 52, 0.5)",
                    color: "#8b1a2a",
                  }}
                >
                  Connect your wallet to craft abilities
                </div>
              )}

              {/* Resource balances */}
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {(Object.keys(resources) as (keyof ResourceBalances)[]).map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px]"
                    style={{
                      background: "rgba(74, 48, 22, 0.12)",
                      border: "1px solid rgba(74, 48, 22, 0.4)",
                    }}
                  >
                    <span className={`font-bold ${RESOURCE_COLORS[name] || ""}`} style={{ color: "#3b2410" }}>
                      {resources[name]}
                    </span>
                    <span className="capitalize" style={{ color: "#5a3b1e" }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Left-page ability cards */}
            <div className="space-y-3 mt-1">
              {leftAbilities.map((ability) => renderAbilityCard(ability, "left"))}
            </div>

            {error && (
              <div className="text-[10px] text-center" style={{ color: "#8b1a2a" }}>
                {error}
              </div>
            )}
          </div>

          {/* ============ RIGHT PAGE ============ */}
          <div
            className="flex-1 flex flex-col gap-3 min-w-0"
            style={{
              padding: "0 6% 0 5%",
            }}
          >
            {/* Right-page ability cards */}
            <div className="space-y-3">
              {rightAbilities.map((ability) => renderAbilityCard(ability, "right"))}
            </div>

            {/* Back home link at the bottom of the right page — tilted to match */}
            <div
              className="text-center mt-auto pt-2"
              style={{
                transform: "rotateX(14deg) rotateY(-6deg)",
                transformOrigin: "center top",
                transformStyle: "preserve-3d",
              }}
            >
              <Link
                href="/"
                className="text-[10px] tracking-wider transition-colors font-serif"
                style={{ color: "#5a3b1e" }}
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
