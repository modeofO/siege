"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";
import { executeControllerPaymaster } from "@/lib/controllerSession";

interface RegisterKingdomProps {
  account: AccountInterface;
  worldSystemAddress: string;
  onRegistered: () => void;
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const PARCEL_TYPES = [
  { id: 0, name: "Forge", resources: "Iron + Linen", color: "#b87333" },
  { id: 1, name: "Quarry", resources: "Stone + Wood", color: "#8a8a9a" },
  { id: 2, name: "Grove", resources: "Ember + Seeds", color: "#4a7c59" },
];

export function RegisterKingdom({ account, worldSystemAddress, onRegistered }: RegisterKingdomProps) {
  const [selections, setSelections] = useState<number[]>([0, 1, 2]);
  const [submitting, setSubmitting] = useState(false);
  // After the register tx resolves we stay in `confirming` indefinitely —
  // the parent `/world` page auto-unmounts this modal once Torii reports
  // kingdom.registered === true. This keeps the button locked in a
  // visibly pending state during the ~5-10s indexing lag (issue #11).
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const busy = submitting || confirming;

  const handleSelect = (slotIndex: number, typeId: number) => {
    const next = [...selections];
    next[slotIndex] = typeId;
    setSelections(next);
  };

  const handleRegister = async () => {
    setSubmitting(true);
    setError("");
    try {
      await executeControllerPaymaster(account, {
        contractAddress: worldSystemAddress,
        entrypoint: "register_player",
        calldata: [selections.length.toString(), ...selections.map((s) => s.toString())],
      });
      // Tx submitted — transition to confirming. Parent unmounts us when
      // kingdom.registered flips true on Torii, so `confirming` stays
      // true until that happens.
      setSubmitting(false);
      setConfirming(true);
      onRegistered();
    } catch (e) {
      console.error("Registration failed:", e);
      setError(e instanceof Error ? e.message : "Registration failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50">
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#daa520] tracking-wider">CLAIM YOUR HOLD</h2>
          <p className="text-xs text-[#7a7060] mt-2">
            Choose 3 home parcels. These are permanent and cannot be conquered.
          </p>
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((slotIndex) => (
            <div key={slotIndex} className="space-y-1">
              <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">Home Parcel {slotIndex + 1}</div>
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
                    <div className="w-4 h-4 rounded-full mx-auto mb-1" style={{ backgroundColor: type.color }} />
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
          disabled={busy}
          className={`w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all disabled:cursor-not-allowed ${
            busy
              ? "bg-[#c8a44e]/10 border-2 border-[#c8a44e] text-[#c8a44e] animate-pulse"
              : "bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20"
          }`}
        >
          {submitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner />
              CLAIMING...
            </span>
          ) : confirming ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner />
              CONFIRMING ON-CHAIN...
            </span>
          ) : (
            "\u26ca ESTABLISH HOLD \u26ca"
          )}
        </button>
        {confirming && (
          <div className="text-[10px] text-[#7a7060] text-center animate-pulse">
            Your hold is being carved into the marches. This can take up to 10 seconds.
          </div>
        )}

        {error && <div className="text-[#ff3344] text-xs text-center">{error}</div>}
      </div>
    </div>
  );
}
