"use client";

import { usePlayerKingdom } from "@/lib/worldState";
import { usePlayerReputation, bracketName } from "@/lib/reputation";
import { tierName } from "@/lib/tiers";

interface HoldStatusStripProps {
  playerA: string;
  playerB: string;
  isPlayerA: boolean;
  refreshKey?: number;
}

function HoldBlock({
  address,
  label,
  highlight,
  refreshKey,
}: {
  address: string;
  label: string;
  highlight: boolean;
  refreshKey?: number;
}) {
  const kingdom = usePlayerKingdom(address, refreshKey);
  const rep = usePlayerReputation(address);
  const bracket = rep?.bracket ?? 0;

  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className={`text-[10px] uppercase tracking-wider ${highlight ? "text-[#c8a44e]" : "text-[#7a7060]"}`}>
        {label}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px] text-[#d4cfc6] w-full">
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-[#7a7060]">tier</span>
          <span className="font-bold">{tierName(kingdom.tier)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-[#7a7060]">parcels</span>
          <span className="font-bold">{kingdom.parcelCount}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-[#7a7060]">wins</span>
          <span className="font-bold">{kingdom.totalWins}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-[#7a7060]">rank</span>
          <span className="font-bold">{bracketName(bracket)}</span>
        </div>
      </div>
    </div>
  );
}

export function HoldStatusStrip({ playerA, playerB, isPlayerA, refreshKey }: HoldStatusStripProps) {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] px-3 py-2 flex items-center gap-3">
      <HoldBlock
        address={playerA}
        label={isPlayerA ? "Your Hold" : "Opponent Hold"}
        highlight={isPlayerA}
        refreshKey={refreshKey}
      />
      <div className="text-[#7a7060] text-[10px] font-bold">·</div>
      <HoldBlock
        address={playerB}
        label={isPlayerA ? "Opponent Hold" : "Your Hold"}
        highlight={!isPlayerA}
        refreshKey={refreshKey}
      />
    </div>
  );
}
