"use client";

import Link from "next/link";
import type { RoundResult } from "@/lib/gameState";

interface EndScreenProps {
  winner: 1 | 2;
  yourTeam: 1 | 2;
  history: RoundResult[];
  team1Vault: number;
  team2Vault: number;
}

export function EndScreen({ winner, yourTeam, history, team1Vault, team2Vault }: EndScreenProps) {
  const didWin = winner === yourTeam;
  const totalRounds = history.length;
  const yourDmgDealt = history.reduce((sum, r) => sum + (yourTeam === 1 ? r.damageToTeam2 : r.damageToTeam1), 0);
  const yourDmgTaken = history.reduce((sum, r) => sum + (yourTeam === 1 ? r.damageToTeam1 : r.damageToTeam2), 0);

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]/95 z-50 flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md">
        {/* Winner announcement */}
        <div className="space-y-2">
          <div className={`text-6xl font-bold tracking-widest ${didWin ? "text-[#00d4ff]" : "text-[#ff3344]"}`}>
            {didWin ? "VICTORY" : "DEFEAT"}
          </div>
          <div className="text-[#6a6a7a] text-sm">
            {didWin ? "Your fortress stands. The enemy crumbles." : "Your walls have fallen."}
          </div>
        </div>

        {/* Final stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
            <div className="text-[#6a6a7a] text-xs mb-1">Your Vault</div>
            <div className="text-xl font-bold">{yourTeam === 1 ? team1Vault : team2Vault} HP</div>
          </div>
          <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
            <div className="text-[#6a6a7a] text-xs mb-1">Enemy Vault</div>
            <div className="text-xl font-bold">{yourTeam === 1 ? team2Vault : team1Vault} HP</div>
          </div>
          <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
            <div className="text-[#6a6a7a] text-xs mb-1">Damage Dealt</div>
            <div className="text-xl font-bold text-green-400">{yourDmgDealt}</div>
          </div>
          <div className="border border-[#2a2a3a] rounded p-3 bg-[#12121a]">
            <div className="text-[#6a6a7a] text-xs mb-1">Damage Taken</div>
            <div className="text-xl font-bold text-red-400">{yourDmgTaken}</div>
          </div>
        </div>

        <div className="text-[#6a6a7a] text-xs">{totalRounds} rounds played</div>

        <Link
          href="/"
          className="inline-block px-8 py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm"
        >
          RETURN TO LOBBY
        </Link>
      </div>
    </div>
  );
}
