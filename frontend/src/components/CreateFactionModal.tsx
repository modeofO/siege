"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";
import { createFaction } from "@/lib/factions";

interface CreateFactionModalProps {
  account: AccountInterface;
  onClose: () => void;
  onCreated: () => void;
}

const RESOURCE_COSTS = [
  { name: "IRON", amount: 30, color: "#b87333" },
  { name: "STONE", amount: 30, color: "#8a8a9a" },
  { name: "WOOD", amount: 20, color: "#4a7c59" },
];

export function CreateFactionModal({ account, onClose, onCreated }: CreateFactionModalProps) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const validate = (): string | null => {
    const n = name.trim();
    const t = tag.trim();
    if (!n) return "Faction name required.";
    if (n.length > 31) return "Faction name must be 31 characters or fewer.";
    if (!t) return "Banner tag required.";
    if (t.length > 6) return "Banner tag must be 6 characters or fewer.";
    return null;
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createFaction(account, name.trim(), tag.trim());
      onCreated();
    } catch (e) {
      console.error("Create faction failed:", e);
      setError(e instanceof Error ? e.message : "Create faction failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !submitting) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50"
      onClick={handleBackdrop}
    >
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-5 relative">
        <button
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          className="absolute top-3 right-3 text-[#7a7060] hover:text-[#d4cfc6] text-lg leading-none disabled:opacity-30"
        >
          ✕
        </button>

        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#daa520] tracking-wider">
            ⚔ FOUND A FACTION ⚔
          </h2>
          <p className="text-xs text-[#7a7060] mt-2">
            Rally allies under your banner.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
              Faction Name
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={31}
              placeholder="House Atreides"
              disabled={submitting}
              className="w-full px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#d4cfc6] text-sm font-serif placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <div className="text-[9px] text-[#7a7060] text-right">{name.length} / 31</div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
              Banner Tag
            </div>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={6}
              placeholder="ATR"
              disabled={submitting}
              className="w-full px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#daa520] text-sm font-serif font-bold tracking-wider placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <div className="text-[9px] text-[#7a7060] text-right">{tag.length} / 6</div>
          </div>
        </div>

        <div className="border border-[#3d3428] rounded p-3 space-y-2 bg-[#0d0b0a]/40">
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
            Formation Cost
          </div>
          <div className="grid grid-cols-3 gap-2">
            {RESOURCE_COSTS.map((r) => (
              <div
                key={r.name}
                className="text-center px-2 py-1 rounded border border-[#3d3428] bg-[#1a1510]"
              >
                <div className="text-sm font-bold" style={{ color: r.color }}>
                  {r.amount}
                </div>
                <div className="text-[9px] text-[#7a7060] tracking-wider">
                  {r.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "ESTABLISHING..." : "⚔ ESTABLISH FACTION ⚔"}
        </button>

        {error && (
          <div className="text-[#ff3344] text-xs text-center break-words">{error}</div>
        )}
      </div>
    </div>
  );
}
