"use client";

interface VaultDisplayProps {
  label: string;
  hp: number;
  maxHp?: number;
  isEnemy?: boolean;
}

export function VaultDisplay({ label, hp, maxHp = 100, isEnemy = false }: VaultDisplayProps) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  const barColor = pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500";

  const pulseClass = pct < 10 ? "animate-pulse-red" : "";
  const borderColor = isEnemy ? "border-[#ff3344]/30" : "border-[#00d4ff]/30";

  return (
    <div className={`border ${borderColor} rounded-lg p-4 bg-[#12121a]`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs tracking-wider text-[#6a6a7a] uppercase">{label}</span>
        <span className={`text-sm font-bold ${pulseClass}`}>{hp} HP</span>
      </div>
      <div className="w-full h-3 bg-[#1a1a26] rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out ${pulseClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-xs text-[#6a6a7a] mt-1">{Math.round(pct)}%</div>
    </div>
  );
}
