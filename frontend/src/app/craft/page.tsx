"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RpcProvider } from "starknet";
import type { Call } from "starknet";
import { useAccount } from "@/app/providers";
import { useResourceBalances, RESOURCE_TOKENS, type ResourceBalances } from "@/lib/useResourceBalances";
import { ABILITIES, canAfford, maxAffordable, craftAbility, type AbilityCost } from "@/lib/craftingContracts";
import { fetchAbilityBalances, EMPTY_ABILITY_INVENTORY, type AbilityInventory } from "@/lib/abilityToken";
import { LAST_MATCH_KEY } from "@/components/Navbar";
import { useForgeState } from "@/lib/forge/forgeState";
import type { ComponentKind } from "@/lib/forge/circuits";
import {
  COMPONENT_COSTS,
  CRAFTABLE_COMPONENTS,
  COMPONENT_NAMES,
  canAffordComponent,
  maxAffordableComponent,
} from "@/lib/forge/componentCosts";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const BURN_ADDRESS = "0x1";

const ABILITY_FIELDS: (keyof AbilityInventory)[] = ["siege_sword", "stone_cloak", "ember_blast", "hex", "fortify"];

type CraftTab = "abilities" | "parts";

function QtySelector({
  qty,
  max,
  onChange,
  disabled,
}: {
  qty: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, qty - 1))}
        disabled={disabled || qty <= 1}
        className="w-6 h-6 rounded-sm text-xs font-bold font-serif disabled:opacity-30"
        style={{
          background: "rgba(74, 48, 22, 0.25)",
          border: "1px solid rgba(74, 48, 22, 0.4)",
          color: "#3b2410",
        }}
      >
        -
      </button>
      <span
        className="w-8 text-center text-xs font-bold font-serif"
        style={{ color: "#3b2410" }}
      >
        {qty}
      </span>
      <button
        onClick={() => onChange(Math.min(max, qty + 1))}
        disabled={disabled || qty >= max}
        className="w-6 h-6 rounded-sm text-xs font-bold font-serif disabled:opacity-30"
        style={{
          background: "rgba(74, 48, 22, 0.25)",
          border: "1px solid rgba(74, 48, 22, 0.4)",
          color: "#3b2410",
        }}
      >
        +
      </button>
    </div>
  );
}

export default function CraftPage() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";
  const subscribedResources = useResourceBalances(address);
  const [optimisticDelta, setOptimisticDelta] = useState<Partial<ResourceBalances>>({});
  const [activeTab, setActiveTab] = useState<CraftTab>("abilities");
  const forgeState = useForgeState(account ?? undefined);

  const resources: ResourceBalances = {
    iron: Math.max(0, subscribedResources.iron - (optimisticDelta.iron ?? 0)),
    linen: Math.max(0, subscribedResources.linen - (optimisticDelta.linen ?? 0)),
    stone: Math.max(0, subscribedResources.stone - (optimisticDelta.stone ?? 0)),
    wood: Math.max(0, subscribedResources.wood - (optimisticDelta.wood ?? 0)),
    ember: Math.max(0, subscribedResources.ember - (optimisticDelta.ember ?? 0)),
    seeds: Math.max(0, subscribedResources.seeds - (optimisticDelta.seeds ?? 0)),
  };
  const resourceBalances = resources as unknown as Record<string, number>;

  useEffect(() => {
    setOptimisticDelta({});
  }, [subscribedResources]);

  const [inventory, setInventory] = useState<AbilityInventory>(EMPTY_ABILITY_INVENTORY);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [lastMatch, setLastMatch] = useState<string | null>(null);

  // Per-item quantity selections
  const [abilityQtys, setAbilityQtys] = useState<Record<number, number>>({});
  const [partQtys, setPartQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      setLastMatch(sessionStorage.getItem(LAST_MATCH_KEY));
    } catch {}
  }, []);

  useEffect(() => {
    if (!address) {
      setInventory(EMPTY_ABILITY_INVENTORY);
      return;
    }
    let cancelled = false;
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    fetchAbilityBalances(provider, address).then((inv) => {
      if (!cancelled) setInventory(inv);
    });
    return () => { cancelled = true; };
  }, [address]);

  const applyOptimisticCost = (cost: Record<string, number>, qty: number) => {
    setOptimisticDelta((prev) => {
      const next = { ...prev };
      for (const [resource, amount] of Object.entries(cost)) {
        const key = resource as keyof ResourceBalances;
        next[key] = (next[key] ?? 0) + amount * qty;
      }
      return next;
    });
  };

  const handleCraftAbility = async (abilityId: number, cost: AbilityCost) => {
    if (!account) return;
    const qty = abilityQtys[abilityId] || 1;
    setBusyKey(`ability-${abilityId}`);
    setError("");
    try {
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      const txHash = await craftAbility(account, abilityId, cost, qty);
      await provider.waitForTransaction(txHash);
      applyOptimisticCost(cost, qty);
      setAbilityQtys((prev) => ({ ...prev, [abilityId]: 1 }));
      if (address) {
        const inv = await fetchAbilityBalances(provider, address);
        setInventory(inv);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCraftPart = async (kind: ComponentKind) => {
    if (!account) return;
    const cost = COMPONENT_COSTS[kind];
    if (!cost) return;
    const qty = partQtys[kind] || 1;

    setBusyKey(`part-${kind}`);
    setError("");
    try {
      const calls: Call[] = [];
      for (const [resource, amount] of Object.entries(cost)) {
        if (!amount) continue;
        const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
        if (!tokenAddr) continue;
        calls.push({
          contractAddress: tokenAddr,
          entrypoint: "transfer",
          calldata: [BURN_ADDRESS, (amount * qty).toString(), "0"],
        });
      }

      const result = await account.execute(calls, IS_DEVNET ? DEVNET_TX_OPTS : undefined);
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      await provider.waitForTransaction(result.transaction_hash);
      applyOptimisticCost(cost as Record<string, number>, qty);
      forgeState.addComponents(kind, qty);
      setPartQtys((prev) => ({ ...prev, [kind]: 1 }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const cardStyle = (side: "left" | "right", variant: "ability" | "part") => {
    const rotY = side === "left" ? 6 : -6;
    const baseTransform = `rotateX(14deg) rotateY(${rotY}deg)`;
    const bg = variant === "ability"
      ? "linear-gradient(180deg, rgba(232, 214, 170, 0.92) 0%, rgba(212, 188, 138, 0.88) 100%)"
      : "linear-gradient(180deg, rgba(200, 190, 168, 0.92) 0%, rgba(180, 170, 148, 0.88) 100%)";
    return { baseTransform, bg };
  };

  const btnStyle = {
    background: "linear-gradient(180deg, rgba(74, 48, 22, 0.9) 0%, rgba(48, 30, 12, 0.95) 100%)",
    color: "#e8d6aa",
    border: "1px solid rgba(30, 18, 8, 0.8)",
    boxShadow: "inset 0 1px 0 rgba(255,220,160,0.25), inset 0 -2px 4px rgba(0,0,0,0.4), 0 2px 4px rgba(30,18,8,0.4)",
  };

  const renderAbilityCard = (ability: (typeof ABILITIES)[number], side: "left" | "right") => {
    const cost = ability.cost as unknown as AbilityCost;
    const qty = abilityQtys[ability.id] || 1;
    const max = maxAffordable(cost, resourceBalances);
    const affordable = canAfford(cost, resourceBalances, qty);
    const owned = inventory[ABILITY_FIELDS[ability.id - 1]];
    const isBusy = busyKey === `ability-${ability.id}`;
    const { baseTransform, bg } = cardStyle(side, "ability");

    return (
      <div
        key={ability.id}
        className="relative rounded-sm p-3 space-y-2"
        style={{
          background: bg,
          border: "1px solid rgba(74, 48, 22, 0.55)",
          boxShadow: "0 6px 14px rgba(30,18,8,0.55), 0 2px 4px rgba(30,18,8,0.35), inset 0 1px 0 rgba(255,240,200,0.6), inset 0 -1px 0 rgba(74,48,22,0.35)",
          transform: baseTransform,
          transformOrigin: "center bottom",
          transformStyle: "preserve-3d",
          transition: "transform 300ms ease-out",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = `${baseTransform} translateZ(8px)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = baseTransform; }}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-sm font-bold font-serif" style={{ color: "#3b2410", textShadow: "0 1px 0 rgba(255,240,200,0.5)" }}>
            {ability.name}
          </h3>
          {owned > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm" style={{ background: "rgba(74,48,22,0.85)", color: "#e8d6aa" }}>
              Owned: {owned}
            </span>
          )}
        </div>
        <p className="text-[11px] leading-snug" style={{ color: "#5a3b1e" }}>{ability.effect}</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ability.cost).map(([resource, amount]) => {
            const total = amount * qty;
            const hasEnough = (resourceBalances[resource] || 0) >= total;
            return (
              <span
                key={resource}
                className="text-[10px] px-1.5 py-0.5 rounded-sm"
                style={{
                  background: hasEnough ? "rgba(74,48,22,0.12)" : "rgba(178,34,52,0.15)",
                  border: hasEnough ? "1px solid rgba(74,48,22,0.4)" : "1px solid rgba(178,34,52,0.5)",
                  color: hasEnough ? "#3b2410" : "#8b1a2a",
                }}
              >
                {total} <span className="capitalize">{resource}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <QtySelector qty={qty} max={Math.max(1, max)} onChange={(n) => setAbilityQtys((p) => ({ ...p, [ability.id]: n }))} disabled={isBusy} />
          <button
            onClick={() => handleCraftAbility(ability.id, cost)}
            disabled={!isConnected || !affordable || isBusy}
            className="flex-1 py-1.5 rounded-sm font-bold tracking-wider text-xs font-serif transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={btnStyle}
          >
            {isBusy ? "CRAFTING..." : qty > 1 ? `CRAFT x${qty}` : "CRAFT"}
          </button>
        </div>
      </div>
    );
  };

  const renderPartCard = (kind: ComponentKind, side: "left" | "right") => {
    const cost = COMPONENT_COSTS[kind];
    if (!cost) return null;
    const qty = partQtys[kind] || 1;
    const max = maxAffordableComponent(kind, resourceBalances);
    const affordable = canAffordComponent(kind, resourceBalances, qty);
    const owned = forgeState.componentInventory[kind];
    const isBusy = busyKey === `part-${kind}`;
    const { baseTransform, bg } = cardStyle(side, "part");

    return (
      <div
        key={kind}
        className="relative rounded-sm p-3 space-y-2"
        style={{
          background: bg,
          border: "1px solid rgba(74, 48, 22, 0.55)",
          boxShadow: "0 6px 14px rgba(30,18,8,0.55), 0 2px 4px rgba(30,18,8,0.35), inset 0 1px 0 rgba(255,240,200,0.5), inset 0 -1px 0 rgba(74,48,22,0.35)",
          transform: baseTransform,
          transformOrigin: "center bottom",
          transformStyle: "preserve-3d",
          transition: "transform 300ms ease-out",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = `${baseTransform} translateZ(8px)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = baseTransform; }}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-sm font-bold font-serif" style={{ color: "#3b2410", textShadow: "0 1px 0 rgba(255,240,200,0.5)" }}>
            {COMPONENT_NAMES[kind]}
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm" style={{ background: "rgba(74,48,22,0.85)", color: "#e8d6aa" }}>
            Owned: {owned}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(cost).map(([resource, amount]) => {
            if (!amount) return null;
            const total = amount * qty;
            const hasEnough = (resourceBalances[resource] || 0) >= total;
            return (
              <span
                key={resource}
                className="text-[10px] px-1.5 py-0.5 rounded-sm"
                style={{
                  background: hasEnough ? "rgba(74,48,22,0.12)" : "rgba(178,34,52,0.15)",
                  border: hasEnough ? "1px solid rgba(74,48,22,0.4)" : "1px solid rgba(178,34,52,0.5)",
                  color: hasEnough ? "#3b2410" : "#8b1a2a",
                }}
              >
                {total} <span className="capitalize">{resource}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <QtySelector qty={qty} max={Math.max(1, max)} onChange={(n) => setPartQtys((p) => ({ ...p, [kind]: n }))} disabled={isBusy} />
          <button
            onClick={() => handleCraftPart(kind)}
            disabled={!isConnected || !affordable || isBusy}
            className="flex-1 py-1.5 rounded-sm font-bold tracking-wider text-xs font-serif transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={btnStyle}
          >
            {isBusy ? "CRAFTING..." : qty > 1 ? `CRAFT x${qty}` : "CRAFT"}
          </button>
        </div>
      </div>
    );
  };

  const leftAbilities = ABILITIES.slice(0, 2);
  const rightAbilities = ABILITIES.slice(2, 5);
  const leftParts = CRAFTABLE_COMPONENTS.slice(0, 2);
  const rightParts = CRAFTABLE_COMPONENTS.slice(2);

  return (
    <div className="relative min-h-[90vh]">
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
        <div className="flex items-stretch" style={{ gap: "6%" }}>
          {/* LEFT PAGE */}
          <div className="flex-1 flex flex-col gap-3 min-w-0" style={{ padding: "0 5% 0 6%" }}>
            <div
              className="flex flex-col gap-2"
              style={{ transform: "rotateX(14deg) rotateY(6deg)", transformOrigin: "center bottom", transformStyle: "preserve-3d" }}
            >
              <div className="text-center space-y-1">
                <h1 className="text-lg xl:text-xl font-bold tracking-wider font-serif" style={{ color: "#3b2410", textShadow: "0 1px 0 rgba(255,240,200,0.5)" }}>
                  {activeTab === "abilities" ? "FORGE YOUR ARSENAL" : "FORGE CIRCUIT PARTS"}
                </h1>
                <p className="text-[10px]" style={{ color: "#5a3b1e" }}>
                  {activeTab === "abilities" ? "Burn resources to craft abilities." : "Burn resources to craft components for the Circuit Forge."}
                </p>
              </div>

              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setActiveTab("abilities")}
                  className="px-3 py-1 rounded-sm text-[10px] tracking-wider font-serif transition-colors"
                  style={{
                    background: activeTab === "abilities" ? "rgba(74,48,22,0.85)" : "rgba(74,48,22,0.15)",
                    border: "1px solid rgba(74,48,22,0.5)",
                    color: activeTab === "abilities" ? "#e8d6aa" : "#3b2410",
                  }}
                >
                  ABILITIES
                </button>
                <button
                  onClick={() => setActiveTab("parts")}
                  className="px-3 py-1 rounded-sm text-[10px] tracking-wider font-serif transition-colors"
                  style={{
                    background: activeTab === "parts" ? "rgba(74,48,22,0.85)" : "rgba(74,48,22,0.15)",
                    border: "1px solid rgba(74,48,22,0.5)",
                    color: activeTab === "parts" ? "#e8d6aa" : "#3b2410",
                  }}
                >
                  CIRCUIT PARTS
                </button>
              </div>

              {lastMatch && (
                <div className="flex justify-center">
                  <Link
                    href={lastMatch}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-sm text-[10px] tracking-wider font-serif transition-colors"
                    style={{ background: "rgba(74,48,22,0.15)", border: "1px solid rgba(74,48,22,0.5)", color: "#3b2410" }}
                  >
                    ← RETURN TO MATCH
                  </Link>
                </div>
              )}

              {!isConnected && (
                <div className="text-[11px] text-center rounded-sm p-2" style={{ background: "rgba(178,34,52,0.12)", border: "1px solid rgba(178,34,52,0.5)", color: "#8b1a2a" }}>
                  Connect your wallet to craft
                </div>
              )}

              <div className="flex items-center justify-center gap-1 flex-wrap">
                {(Object.keys(resources) as (keyof ResourceBalances)[]).map((name) => (
                  <div key={name} className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px]" style={{ background: "rgba(74,48,22,0.12)", border: "1px solid rgba(74,48,22,0.4)" }}>
                    <span className="font-bold" style={{ color: "#3b2410" }}>{resources[name]}</span>
                    <span className="capitalize" style={{ color: "#5a3b1e" }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {activeTab === "abilities"
              ? <div className="space-y-3 mt-1">{leftAbilities.map((a) => renderAbilityCard(a, "left"))}</div>
              : <div className="space-y-3 mt-1">{leftParts.map((k) => renderPartCard(k, "left"))}</div>}

            {error && <div className="text-[10px] text-center" style={{ color: "#8b1a2a" }}>{error}</div>}
          </div>

          {/* RIGHT PAGE */}
          <div className="flex-1 flex flex-col gap-3 min-w-0" style={{ padding: "0 6% 0 5%" }}>
            {activeTab === "abilities"
              ? <div className="space-y-3">{rightAbilities.map((a) => renderAbilityCard(a, "right"))}</div>
              : <div className="space-y-3">{rightParts.map((k) => renderPartCard(k, "right"))}</div>}

            <div className="text-center mt-auto pt-2" style={{ transform: "rotateX(14deg) rotateY(-6deg)", transformOrigin: "center top", transformStyle: "preserve-3d" }}>
              <Link href="/" className="text-[10px] tracking-wider transition-colors font-serif" style={{ color: "#5a3b1e" }}>
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
