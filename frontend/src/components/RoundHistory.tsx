"use client";

import type { RoundResult } from "@/lib/gameState";

interface RoundHistoryProps {
  history: RoundResult[];
  yourTeam: 1 | 2;
}

export function RoundHistory({ history, yourTeam }: RoundHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-2">Round History</div>
        <div className="text-sm text-[#6a6a7a]">No rounds played yet</div>
      </div>
    );
  }

  return (
    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
      <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Round History</div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {history.map((r) => {
          const yourDmgDealt = yourTeam === 1 ? r.damageToTeam2 : r.damageToTeam1;
          const yourDmgTaken = yourTeam === 1 ? r.damageToTeam1 : r.damageToTeam2;
          const yourAtk = yourTeam === 1 ? r.team1Attack : r.team2Attack;

          return (
            <div key={r.round} className="flex justify-between text-xs py-1 border-b border-[#1a1a26]">
              <span className="text-[#6a6a7a]">R{r.round}</span>
              <span>
                {yourAtk ? (
                  <span className="text-[#00d4ff]">
                    You attacked {yourAtk.join("/")} → dealt <span className="text-green-400">{yourDmgDealt}</span> dmg
                  </span>
                ) : (
                  <span className="text-[#ff3344]">
                    Enemy attacked → dealt <span className="text-red-400">{yourDmgTaken}</span> dmg to you
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
