"use client";

import React from "react";
import { ABILITIES } from "@/lib/craftingContracts";

interface AbilitySelectorProps {
  abilities: [number, number, number];
  used: [boolean, boolean, boolean];
  selectedAbility: number;
  selectedTarget: number;
  onSelect: (abilityId: number, abilityTarget: number) => void;
}

const GATE_NAMES = ["East", "Under.", "West"];

export function AbilitySelector({
  abilities,
  used,
  selectedAbility,
  selectedTarget,
  onSelect,
}: AbilitySelectorProps) {
  const hasAny = abilities.some((a) => a > 0);
  if (!hasAny) return null;

  const handleClick = (abilityId: number) => {
    if (selectedAbility === abilityId) {
      onSelect(0, 0);
    } else {
      onSelect(abilityId, abilityId === 1 ? selectedTarget : 0);
    }
  };

  const handleTargetChange = (target: number) => {
    onSelect(selectedAbility, target);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-[#b8860b] uppercase font-bold border-b border-[#b8860b]/20 pb-0.5 mb-1 font-serif">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        ABILITY
      </div>

      <div className="grid grid-cols-3 gap-2">
        {abilities.map((abilityId, slotIdx) => {
          if (abilityId === 0) return null;

          const ability = ABILITIES.find((a) => a.id === abilityId);
          if (!ability) return null;

          const isUsed = used[slotIdx];
          const isSelected = selectedAbility === abilityId;

          return (
            <button
              key={slotIdx}
              onClick={() => !isUsed && handleClick(abilityId)}
              disabled={isUsed}
              className={`relative rounded-lg p-2 text-left transition-all border ${
                isUsed
                  ? "opacity-30 cursor-not-allowed border-[#3d3428] bg-[#252019]"
                  : isSelected
                    ? "border-[#daa520] bg-[#daa520]/10 shadow-[0_0_8px_rgba(218,165,32,0.3)]"
                    : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
              }`}
            >
              <div className="text-xs font-bold text-[#d4cfc6] font-serif">{ability.name}</div>
              <div className="text-[9px] text-[#7a7060] mt-0.5 leading-tight">{ability.effect}</div>
              {isUsed && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0d0b0a]/60 rounded-lg">
                  <span className="text-[10px] font-bold text-[#7a7060] tracking-wider">USED</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedAbility === 1 && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[10px] text-[#7a7060] tracking-wider">TARGET GATE:</span>
          {GATE_NAMES.map((name, gi) => (
            <button
              key={gi}
              onClick={() => handleTargetChange(gi)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedTarget === gi
                  ? "border-[#ff8800] bg-[#ff8800]/20 text-[#ff8800]"
                  : "border-[#3d3428] text-[#7a7060] hover:border-[#ff8800] hover:text-[#ff8800]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
