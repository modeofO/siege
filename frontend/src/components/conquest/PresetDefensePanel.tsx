"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";
import {
  usePresetDefense,
  setPresetDefense,
  DEFENDER_BUDGET,
  type PresetSlot,
} from "@/lib/conquest";
import { tierName, tierPresetCount, TIER_NAMES } from "@/lib/tiers";
import { ConquestAllocator } from "@/components/conquest/ConquestAllocator";

interface PresetDefensePanelProps {
  account: AccountInterface;
  address: string;
  tier: number;
  refresh: () => void;
}

const GATE_LABELS = ["E", "U", "W"] as const;

function slotValues(slot: PresetSlot): number[] {
  return [slot.p0, slot.p1, slot.p2, slot.g0, slot.g1, slot.g2];
}

function slotTotal(slot: PresetSlot): number {
  return slotValues(slot).reduce((a, b) => a + b, 0);
}

export function PresetDefensePanel({ account, address, tier, refresh }: PresetDefensePanelProps) {
  const data = usePresetDefense(address);
  const allowedSlots = tierPresetCount(tier);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const startEdit = (index: number, slot: PresetSlot | undefined) => {
    setDraft(slot ? slotValues(slot) : [0, 0, 0, 0, 0, 0]);
    setError("");
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setError("");
  };

  const saveEdit = async (index: number) => {
    setSubmitting(true);
    setError("");
    try {
      await setPresetDefense(account, index, draft[0], draft[1], draft[2], draft[3], draft[4], draft[5]);
      setEditingIndex(null);
      refresh();
    } catch (e) {
      console.error("Set preset defense failed:", e);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const nextTierName = tier < TIER_NAMES.length - 1 ? tierName(tier + 1) : null;

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Standing Defenses</div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        When you are attacked, fate picks one of your presets at random. Set at least one — a Hold with no defense
        cannot be defended.
      </div>

      <div className="space-y-2">
        {Array.from({ length: allowedSlots }, (_, index) => {
          const slot = data?.slots[index];
          const saved = !!data && index < data.presetCount;
          const isEditing = editingIndex === index;

          if (isEditing) {
            return (
              <div key={index} className="border border-[#daa520]/40 rounded p-3 bg-[#0d0b0a]/40 space-y-3">
                <div className="text-[10px] tracking-wider uppercase text-[#daa520] font-serif">
                  Preset {index + 1}
                </div>
                <ConquestAllocator
                  values={draft}
                  budget={DEFENDER_BUDGET}
                  onChange={setDraft}
                  disabled={submitting}
                />
                {error && <div className="text-[#ff3344] text-[10px]">{error}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(index)}
                    disabled={submitting}
                    className="flex-1 py-2 rounded text-[10px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {submitting ? "SAVING..." : "SAVE"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={submitting}
                    className="px-4 py-2 rounded text-[10px] text-[#7a7060] border border-[#3d3428] hover:text-[#d4cfc6] disabled:opacity-30"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={index}
              onClick={() => startEdit(index, slot)}
              disabled={editingIndex !== null}
              className="w-full flex items-center justify-between border border-[#3d3428] rounded px-3 py-2 bg-[#0d0b0a]/40 text-left transition-colors hover:border-[#daa520]/50 disabled:opacity-40 disabled:hover:border-[#3d3428]"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-wider uppercase text-[#7a7060] font-serif">
                  Preset {index + 1}
                </span>
                {saved && slot ? (
                  <span className="text-[11px] text-[#d4cfc6] tabular-nums font-mono">
                    A {GATE_LABELS.map((g, i) => `${g}${slot[`p${i}` as keyof PresetSlot]}`).join(" ")}
                    {"  ·  "}
                    G {GATE_LABELS.map((g, i) => `${g}${slot[`g${i}` as keyof PresetSlot]}`).join(" ")}
                  </span>
                ) : (
                  <span className="text-[11px] text-[#7a7060] italic">Not set</span>
                )}
              </div>
              <span className="text-[9px] tracking-wider uppercase text-[#daa520]">
                {saved ? `Edit · ${slotTotal(slot!)}/${DEFENDER_BUDGET}` : "Set"}
              </span>
            </button>
          );
        })}
      </div>

      {nextTierName && (
        <div className="text-[10px] text-[#7a7060] italic border-t border-[#3d3428] pt-2">
          Reach <span className="text-[#daa520] not-italic font-bold">{nextTierName}</span> to unlock another preset
          slot.
        </div>
      )}
    </div>
  );
}
