"use client";

import { MODIFIER_NAMES, MODIFIER_DESCRIPTIONS } from "@/lib/gameState1v1";
import { MODIFIER_ACCENT } from "@/components/battlefield3d/pieces";

// Display order matches the battlefield left→right: East, Underground, West
// (data indices 0, 2, 1 — same as AllocationForm1v1's GATE_ORDER).
const GATE_ORDER = [
  { di: 0, name: "East" },
  { di: 2, name: "Under." },
  { di: 1, name: "West" },
] as const;

interface ModifierCardsProps {
  modifiers: [number, number, number];
}

/**
 * Compact strip of three cards — one per gate in battlefield display order —
 * naming this round's gate modifier and its effect. Each active card's accent
 * color matches the glowing band on the corresponding 3D gate piece, so
 * players can pair card to gate at a glance. Normal gates render dimmed.
 */
export function ModifierCards({ modifiers }: ModifierCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {GATE_ORDER.map((gate) => {
        const mod = modifiers[gate.di];
        const accent = MODIFIER_ACCENT[mod];
        const active = mod !== 0 && !!accent;
        return (
          <div
            key={gate.di}
            className={`rounded-lg border px-2.5 py-1.5 bg-[#1a1714] ${
              active ? "" : "border-[#3d3428] opacity-50"
            }`}
            style={active ? { borderColor: `${accent}66` } : undefined}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[10px] tracking-wider text-[#7a7060] uppercase">{gate.name}</span>
              <span
                className="text-[11px] font-bold font-serif tracking-wide"
                style={active ? { color: accent } : { color: "#7a7060" }}
              >
                {MODIFIER_NAMES[mod] ?? "Normal"}
              </span>
            </div>
            <div className="text-[10px] text-[#7a7060] leading-snug">
              {active ? MODIFIER_DESCRIPTIONS[mod] : "No effect this round"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
