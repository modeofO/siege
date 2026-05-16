"use client";

interface AllocatorProps {
  role: "attacker" | "defender";
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
}

const ATTACKER_LABELS = ["East Gate", "Underground", "West Gate", "Node 1", "Node 2", "Node 3"];
const DEFENDER_LABELS = ["East Gate", "Underground", "West Gate", "Repair", "Node 1", "Node 2", "Node 3"];

export function PressurePointAllocator({ role, budget, allocations, onChange }: AllocatorProps) {
  const labels = role === "attacker" ? ATTACKER_LABELS : DEFENDER_LABELS;
  const total = allocations.reduce((a, b) => a + b, 0);
  const remaining = budget - total;

  const handleChange = (index: number, value: number) => {
    const newAlloc = [...allocations];
    newAlloc[index] = value;
    // Don't allow exceeding budget
    const newTotal = newAlloc.reduce((a, b) => a + b, 0);
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  return (
    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a] space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs tracking-wider text-[#6a6a7a] uppercase">Allocation — {role}</span>
        <span
          className={`text-sm font-bold ${remaining === 0 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-[#ffd700]"}`}
        >
          Remaining: {remaining}
        </span>
      </div>

      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-[#6a6a7a] w-24 truncate">{label}</span>
          <input
            type="range"
            min={0}
            max={budget}
            value={allocations[i] || 0}
            onChange={(e) => handleChange(i, parseInt(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={0}
            max={budget}
            value={allocations[i] || 0}
            onChange={(e) => handleChange(i, Math.max(0, parseInt(e.target.value) || 0))}
            className="w-12 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-1"
          />
        </div>
      ))}

      <div className="flex justify-between text-xs text-[#6a6a7a] pt-2 border-t border-[#2a2a3a]">
        <span>
          Total: {total} / {budget}
        </span>
        {remaining !== 0 && <span className="text-[#ffd700]">Must allocate exactly {budget}</span>}
      </div>
    </div>
  );
}
