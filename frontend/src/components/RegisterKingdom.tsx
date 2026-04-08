// frontend/src/components/RegisterKingdom.tsx
"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";

interface RegisterKingdomProps {
  account: AccountInterface;
  worldSystemAddress: string;
  onRegistered: () => void;
}

const PARCEL_TYPES = [
  { id: 0, name: "Forge", resources: "Iron + Linen", color: "#b87333" },
  { id: 1, name: "Quarry", resources: "Stone + Wood", color: "#8a8a9a" },
  { id: 2, name: "Grove", resources: "Ember + Seeds", color: "#4a7c59" },
];

export function RegisterKingdom({ account, worldSystemAddress, onRegistered }: RegisterKingdomProps) {
  const [selections, setSelections] = useState<number[]>([0, 1, 2]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = (slotIndex: number, typeId: number) => {
    const next = [...selections];
    next[slotIndex] = typeId;
    setSelections(next);
  };

  const handleRegister = async () => {
    setSubmitting(true);
    setError("");
    try {
      await account.execute({
        contractAddress: worldSystemAddress,
        entrypoint: "register_player",
        calldata: [
          selections.length.toString(),
          ...selections.map((s) => s.toString()),
        ],
      });
      onRegistered();
    } catch (e) {
      console.error("Registration failed:", e);
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50">
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#daa520] tracking-wider">
            CLAIM YOUR KINGDOM
          </h2>
          <p className="text-xs text-[#7a7060] mt-2">
            Choose 3 home parcels. These are permanent and cannot be conquered.
          </p>
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((slotIndex) => (
            <div key={slotIndex} className="space-y-1">
              <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
                Home Parcel {slotIndex + 1}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PARCEL_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleSelect(slotIndex, type.id)}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      selections[slotIndex] === type.id
                        ? "border-[#daa520] bg-[#daa520]/10"
                        : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full mx-auto mb-1"
                      style={{ backgroundColor: type.color }}
                    />
                    <div className="text-xs font-bold text-[#d4cfc6] font-serif">{type.name}</div>
                    <div className="text-[9px] text-[#7a7060]">{type.resources}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleRegister}
          disabled={submitting}
          className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "CLAIMING..." : "⛊ ESTABLISH KINGDOM ⛊"}
        </button>

        {error && (
          <div className="text-[#ff3344] text-xs text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
