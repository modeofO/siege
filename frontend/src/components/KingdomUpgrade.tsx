"use client";

import { useState } from "react";
import { TIER_INFO, UPGRADE_COSTS, tierName } from "@/lib/tiers";
import { upgradeKingdom } from "@/lib/contracts1v1";
import { useAccount } from "@/app/providers";

interface KingdomUpgradeProps {
  tier: number;
  totalWins: number;
}

export function KingdomUpgrade({ tier, totalWins }: KingdomUpgradeProps) {
  const { account } = useAccount();
  const [upgrading, setUpgrading] = useState(false);

  if (tier >= 3) {
    return (
      <div className="text-center text-[#daa520] font-serif text-sm font-bold tracking-wider">
        BASILEIA — Maximum Tier
      </div>
    );
  }

  const nextTier = tier + 1;
  const cost = UPGRADE_COSTS[nextTier];
  const info = TIER_INFO[nextTier];
  const hasEnoughWins = cost && totalWins >= cost.wins;

  const handleUpgrade = async () => {
    if (!account || !hasEnoughWins) return;
    setUpgrading(true);
    try {
      await upgradeKingdom(account);
    } catch (e) {
      console.error("Upgrade failed:", e);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="border border-[#3d3428] rounded-lg p-4 bg-[#1a1510]">
      <div className="text-xs text-[#7a7060] tracking-wider uppercase mb-2">
        Next: {tierName(nextTier)}
      </div>
      <div className="text-[10px] text-[#7a7060] space-y-1 mb-3">
        <div>Ability Slots: {info.abilitySlots}</div>
        <div>Parcel Cap: {info.parcelCap}</div>
        <div>Defense Presets: {info.defensePresets}</div>
      </div>
      <div className="text-[10px] text-[#7a7060] mb-2">
        <span className={hasEnoughWins ? "text-green-500" : "text-red-400"}>
          Wins: {totalWins}/{cost?.wins}
        </span>
      </div>
      {cost && (
        <div className="text-[10px] text-[#7a7060] mb-3 space-y-0.5">
          {"iron" in cost && <div>Iron: {cost.iron}</div>}
          {"stone" in cost && <div>Stone: {cost.stone}</div>}
          {"wood" in cost && <div>Wood: {cost.wood}</div>}
          {"ember" in cost && <div>Ember: {(cost as any).ember}</div>}
          {"seeds" in cost && <div>Seeds: {(cost as any).seeds}</div>}
        </div>
      )}
      <button
        onClick={handleUpgrade}
        disabled={!hasEnoughWins || upgrading || !account}
        className={`w-full py-2 rounded text-xs font-bold tracking-wider transition-colors ${
          hasEnoughWins && !upgrading
            ? "bg-[#daa520] text-[#0d0b0a] hover:bg-[#f0c040]"
            : "bg-[#252019] text-[#7a7060] cursor-not-allowed"
        }`}
      >
        {upgrading ? "Upgrading..." : `Upgrade to ${tierName(nextTier)}`}
      </button>
    </div>
  );
}
