"use client";

// Shared 6-field budget allocator for conquest — attack presets (Assault) and
// defense presets (Garrison) share one pool. War-room styled, used at budget 10
// (an attack) and budget 12 (a saved defense preset).

const GATE_NAMES = ["East", "Underground", "West"] as const;

interface ConquestAllocatorProps {
  // [p0, p1, p2, g0, g1, g2] — assault gates then garrison gates.
  values: number[];
  budget: number;
  onChange: (next: number[]) => void;
  disabled?: boolean;
}

export function ConquestAllocator({ values, budget, onChange, disabled }: ConquestAllocatorProps) {
  const total = values.reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, budget - total);

  const setAt = (index: number, delta: number) => {
    const nextVal = values[index] + delta;
    if (nextVal < 0) return;
    if (delta > 0 && remaining <= 0) return;
    const next = values.slice();
    next[index] = nextVal;
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <AllocatorGroup
        label="Assault"
        hint="Batter their gates"
        offset={0}
        values={values}
        remaining={remaining}
        disabled={disabled}
        onStep={setAt}
      />
      <AllocatorGroup
        label="Garrison"
        hint="Hold your own gates"
        offset={3}
        values={values}
        remaining={remaining}
        disabled={disabled}
        onStep={setAt}
      />

      <div className="flex items-center justify-between border-t border-[#3d3428] pt-3">
        <span className="text-[10px] tracking-wider uppercase text-[#7a7060] font-serif">Remaining</span>
        <span
          className={`text-sm font-bold font-serif tabular-nums ${
            remaining === 0 ? "text-[#daa520]" : "text-[#d4cfc6]"
          }`}
        >
          {remaining} / {budget}
        </span>
      </div>
    </div>
  );
}

interface AllocatorGroupProps {
  label: string;
  hint: string;
  offset: number;
  values: number[];
  remaining: number;
  disabled?: boolean;
  onStep: (index: number, delta: number) => void;
}

function AllocatorGroup({ label, hint, offset, values, remaining, disabled, onStep }: AllocatorGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] tracking-[0.2em] uppercase text-[#daa520] font-serif font-bold">{label}</span>
        <span className="text-[9px] text-[#7a7060] tracking-wide">{hint}</span>
      </div>
      <div className="space-y-1">
        {GATE_NAMES.map((name, gi) => {
          const index = offset + gi;
          const value = values[index];
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="w-24 text-[11px] text-[#d4cfc6] font-serif">{name}</span>
              <StepButton label="−" disabled={disabled || value <= 0} onClick={() => onStep(index, -1)} />
              <span className="w-6 text-center text-sm font-bold text-[#d4cfc6] tabular-nums">{value}</span>
              <StepButton label="+" disabled={disabled || remaining <= 0} onClick={() => onStep(index, 1)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Increase" : "Decrease"}
      className="w-7 h-7 rounded border border-[#3d3428] bg-[#252019] text-[#daa520] text-sm font-bold leading-none flex items-center justify-center transition-colors hover:border-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:border-[#3d3428] disabled:hover:bg-[#252019]"
    >
      {label}
    </button>
  );
}
