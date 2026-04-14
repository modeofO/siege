"use client";

import { AbilityIcon } from "./AbilityIcon";
import type { MatchStakesData } from "@/lib/gameState1v1";

interface MatchStakesHeaderProps {
  stakes: MatchStakesData;
  isPlayerA: boolean;
}

function SideStack({
  abilities,
  used,
  label,
  highlight,
}: {
  abilities: [number, number, number];
  used: [boolean, boolean, boolean];
  label: string;
  highlight: boolean;
}) {
  const owned = abilities.filter((id) => id > 0);
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className={`text-[10px] uppercase tracking-wider ${highlight ? "text-[#c8a44e]" : "text-[#7a7060]"}`}>
        {label}
      </div>
      <div className="flex items-center gap-1 min-h-[40px]">
        {owned.length === 0 ? (
          <div className="text-[10px] text-[#7a7060] italic">no wager</div>
        ) : (
          abilities.map((id, i) =>
            id > 0 ? (
              <div key={i} className={used[i] ? "opacity-40" : ""}>
                <AbilityIcon tokenId={id} count={1} size={36} />
              </div>
            ) : null,
          )
        )}
      </div>
    </div>
  );
}

export function MatchStakesHeader({ stakes, isPlayerA }: MatchStakesHeaderProps) {
  if (!stakes.loaded) return null;

  if (!stakes.isStaked) {
    return (
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] px-4 py-2 flex items-center justify-center">
        <span className="text-[10px] tracking-wider text-[#7a7060] uppercase">
          Practice match — no stakes
        </span>
      </div>
    );
  }

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-3 space-y-2">
      <div className="text-center text-[10px] tracking-wider text-[#c8a44e] uppercase font-serif">
        ⚔ Stakes ⚔ Winner takes all
      </div>
      <div className="flex items-center gap-4">
        <SideStack
          abilities={stakes.a}
          used={stakes.aUsed}
          label={isPlayerA ? "Your wager" : "Opponent wager"}
          highlight={isPlayerA}
        />
        <div className="text-[#7a7060] font-bold text-lg">vs</div>
        <SideStack
          abilities={stakes.b}
          used={stakes.bUsed}
          label={isPlayerA ? "Opponent wager" : "Your wager"}
          highlight={!isPlayerA}
        />
      </div>
    </div>
  );
}
