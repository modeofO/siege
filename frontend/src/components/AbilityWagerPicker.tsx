"use client";

import { ABILITIES } from "@/lib/craftingContracts";
import { AbilityIcon } from "./AbilityIcon";

interface AbilityWagerPickerProps {
  balances: Record<number, number>;
  selected: number[];
  maxSlots: number;
  onChange: (next: number[]) => void;
  balancesLoading?: boolean;
}

export function AbilityWagerPicker({
  balances,
  selected,
  maxSlots,
  onChange,
  balancesLoading,
}: AbilityWagerPickerProps) {
  if (balancesLoading) {
    return <div className="text-[11px] text-[#6a6a7a]">Loading ability balances...</div>;
  }

  const toggle = (id: number) => {
    const idx = selected.lastIndexOf(id);
    if (idx !== -1) {
      onChange([...selected.slice(0, idx), ...selected.slice(idx + 1)]);
      return;
    }
    if (selected.length >= maxSlots) return;
    const owned = balances[id] ?? 0;
    const timesSelected = selected.filter((x) => x === id).length;
    if (timesSelected >= owned) return;
    onChange([...selected, id]);
  };

  return (
    <div className="grid grid-cols-5 gap-2">
      {ABILITIES.map((ab) => {
        const owned = balances[ab.id] ?? 0;
        const timesSelected = selected.filter((x) => x === ab.id).length;
        const remaining = owned - timesSelected;
        const capHit = selected.length >= maxSlots && timesSelected === 0;
        const disabled = remaining <= 0 || capHit;
        return (
          <button
            key={ab.id}
            onClick={() => !disabled && toggle(ab.id)}
            disabled={disabled && timesSelected === 0}
            title={`${ab.name} (T${ab.tier}) — you own ${owned}`}
            className={`relative flex flex-col items-center gap-1 p-2 border rounded transition-all ${
              timesSelected > 0
                ? "border-[#c8a44e] bg-[#c8a44e]/10"
                : disabled
                  ? "border-[#2a2a3a] bg-[#0f0d0a] opacity-40 cursor-not-allowed"
                  : "border-[#3d3428] bg-[#1a1714] hover:border-[#c8a44e]"
            }`}
          >
            <AbilityIcon tokenId={ab.id} count={1} size={28} />
            <div className="text-[8px] text-[#7a7060] leading-none">×{owned}</div>
            {timesSelected > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#c8a44e] text-[10px] font-bold text-[#0d0b0a] flex items-center justify-center">
                {timesSelected}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
