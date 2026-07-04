// frontend/src/components/AllocationForm1v1.tsx
"use client";

import React from "react";
import Image from "next/image";
import type { NodeOwner } from "@/lib/gameState1v1";
import { AbilitySelector } from "./AbilitySelector";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
  onCommit: () => void;
  submitting: boolean;
  confirming: boolean;
  error: string;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  // Ability selection (Phase 2B)
  abilities: [number, number, number];
  abilitiesUsed: [boolean, boolean, boolean];
  selectedAbility: number;
  selectedTarget: number;
  onAbilitySelect: (abilityId: number, abilityTarget: number) => void;
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const GATE_ORDER = [
  { di: 0, name: "East" },
  { di: 2, name: "Under." },
  { di: 1, name: "West" },
];
const NODE_NAMES = ["Forge", "Quarry", "Grove"];
const NODE_RESOURCES = ["Iron + Linen", "Stone + Wood", "Ember + Seeds"];
const NODE_SPRITES = ["/sprites/node-forge.png", "/sprites/node-quarry.png", "/sprites/node-grove.png"];

export function AllocationForm1v1({
  budget,
  allocations,
  onChange,
  onCommit,
  submitting,
  confirming,
  error,
  nodes,
  isPlayerA,
  abilities,
  abilitiesUsed,
  selectedAbility,
  selectedTarget,
  onAbilitySelect,
}: AllocationForm1v1Props) {
  const busy = submitting || confirming;
  // Repair (index 6) costs 2 budget per HP; traps (10-12) cost 2 each.
  const spendOf = (alloc: number[]) => {
    const trapCost = ((alloc[10] || 0) + (alloc[11] || 0) + (alloc[12] || 0)) * 2;
    const repairCost = (alloc[6] || 0) * 2;
    const pointCost = alloc.slice(0, 10).reduce((a, b) => a + b, 0) - (alloc[6] || 0);
    return pointCost + repairCost + trapCost;
  };
  const trapCost = ((allocations[10] || 0) + (allocations[11] || 0) + (allocations[12] || 0)) * 2;
  const allocationTotal = spendOf(allocations) - trapCost;
  const total = allocationTotal + trapCost;
  const remaining = budget - total;
  const budgetExact = remaining === 0;

  const myTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";

  const handleChange = (index: number, value: number) => {
    const clamped = Math.max(0, value);
    const newAlloc = [...allocations];
    newAlloc[index] = clamped;
    if (spendOf(newAlloc) <= budget) {
      onChange(newAlloc);
    }
  };

  const handleTrapToggle = (nodeIndex: number) => {
    const trapIdx = 10 + nodeIndex;
    const newAlloc = [...allocations];
    if (newAlloc[trapIdx] === 1) {
      newAlloc[trapIdx] = 0;
    } else {
      newAlloc[trapIdx] = 1;
      newAlloc[7 + nodeIndex] = 0;
    }
    if (spendOf(newAlloc) <= budget) {
      onChange(newAlloc);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* Budget header */}
      <div className="flex justify-between items-center">
        <span className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Deploy Orders</span>
        <span
          className={`text-sm font-bold ${remaining === 0 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-[#daa520]"}`}
        >
          {remaining === 0 ? "BUDGET SPENT" : `${remaining} pts left`}
        </span>
      </div>

      {/* Ability selector — Phase 2B */}
      <AbilitySelector
        abilities={abilities}
        used={abilitiesUsed}
        selectedAbility={selectedAbility}
        selectedTarget={selectedTarget}
        onSelect={onAbilitySelect}
      />

      {/* 2-column grid: Attack | Defense */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Column headers */}
        <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-[#ff8800] uppercase font-bold border-b border-[#ff8800]/20 pb-0.5 mb-1">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
            <path d="M13 7l4-4 4 4-4 4" />
            <path d="M8 12l-4 4 4 4 4-4" />
          </svg>
          ATTACK
        </div>
        <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-[#6b8cae] uppercase font-bold border-b border-[#6b8cae]/20 pb-0.5 mb-1">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          DEFENSE
        </div>

        {/* Gate rows: attack (0,1,2) paired with defense (3,4,5) */}
        {GATE_ORDER.map((gate) => (
          <React.Fragment key={gate.di}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#d4cfc6] w-10 shrink-0">{gate.name}</span>
              <input
                type="range"
                min={0}
                max={budget}
                value={allocations[gate.di] || 0}
                onChange={(e) => handleChange(gate.di, parseInt(e.target.value))}
                className="flex-1 accent-[#ff8800] text-[#ff8800] h-2 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={budget}
                value={allocations[gate.di] || 0}
                onChange={(e) => handleChange(gate.di, Math.max(0, parseInt(e.target.value) || 0))}
                className="w-8 text-center bg-[#252019] border border-[#3d3428] rounded text-sm py-0.5 text-[#ff8800]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#d4cfc6] w-10 shrink-0">{gate.name}</span>
              <input
                type="range"
                min={0}
                max={budget}
                value={allocations[3 + gate.di] || 0}
                onChange={(e) => handleChange(3 + gate.di, parseInt(e.target.value))}
                className="flex-1 accent-[#6b8cae] text-[#6b8cae] h-2 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={budget}
                value={allocations[3 + gate.di] || 0}
                onChange={(e) => handleChange(3 + gate.di, Math.max(0, parseInt(e.target.value) || 0))}
                className="w-8 text-center bg-[#252019] border border-[#3d3428] rounded text-sm py-0.5 text-[#6b8cae]"
              />
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Repair — full-width */}
      <div className="border-t border-[#3d3428] pt-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] tracking-wider text-[#66cc66] uppercase w-16 shrink-0">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            Repair
          </span>
          <input
            type="range"
            min={0}
            max={Math.floor(budget / 2)}
            value={allocations[6] || 0}
            onChange={(e) => handleChange(6, parseInt(e.target.value))}
            className="flex-1 accent-[#66cc66] text-[#66cc66] h-2 cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={Math.floor(budget / 2)}
            value={allocations[6] || 0}
            onChange={(e) => handleChange(6, Math.max(0, parseInt(e.target.value) || 0))}
            className="w-8 text-center bg-[#252019] border border-[#3d3428] rounded text-sm py-0.5 text-[#66cc66]"
          />
          <span className="text-[10px] text-[#7a7060]">2 pts / HP</span>
        </div>
      </div>

      {/* Nodes — 3-column grid with integrated traps */}
      <div className="border-t border-[#3d3428] pt-2">
        <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-[#daa520] uppercase font-bold mb-2 font-serif">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          CONTESTED NODES
        </div>
        <div className="grid grid-cols-3 gap-2">
          {NODE_NAMES.map((name, ni) => {
            const nodeIdx = 7 + ni;
            const trapIdx = 10 + ni;
            const isTrapped = allocations[trapIdx] === 1;
            const isMine = nodes[ni] === myTeam;
            const isEnemy = nodes[ni] !== myTeam && nodes[ni] !== "neutral";
            const canTrap = isMine;

            return (
              <div
                key={ni}
                className={`bg-[#252019] rounded-lg p-2 space-y-1.5 flex flex-col items-center border ${
                  isMine ? "border-[#c8a44e]/50" : isEnemy ? "border-[#ff3344]/40" : "border-transparent"
                }`}
              >
                <div
                  className={`w-full text-center text-[9px] tracking-widest font-bold rounded py-0.5 ${
                    isMine
                      ? "bg-[#c8a44e]/15 text-[#c8a44e]"
                      : isEnemy
                        ? "bg-[#ff3344]/15 text-[#ff3344]"
                        : "bg-[#3d3428]/40 text-[#7a7060]"
                  }`}
                >
                  {isMine ? "YOUR NODE" : isEnemy ? "ENEMY NODE" : "UNCLAIMED"}
                </div>
                <Image
                  src={NODE_SPRITES[ni]}
                  alt={name}
                  width={80}
                  height={80}
                  className="w-20 h-20 object-contain rounded-lg"
                />
                <div className="text-xs text-[#d4cfc6] font-bold text-center">{name}</div>
                <div className="text-[10px] text-[#7a7060] text-center">{NODE_RESOURCES[ni]}</div>
                {isTrapped ? (
                  <div className="text-center text-[10px] text-[#ff3344] font-bold py-1">TRAPPED (2 pts)</div>
                ) : (
                  <div className="flex items-center gap-1 px-1">
                    <input
                      type="range"
                      min={0}
                      max={budget}
                      value={allocations[nodeIdx] || 0}
                      onChange={(e) => handleChange(nodeIdx, parseInt(e.target.value))}
                      className="flex-1 accent-[#daa520] text-[#daa520] h-2 cursor-pointer"
                    />
                    <input
                      type="number"
                      min={0}
                      max={budget}
                      value={allocations[nodeIdx] || 0}
                      onChange={(e) => handleChange(nodeIdx, Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-8 text-center bg-[#0d0b0a] border border-[#3d3428] rounded text-xs py-0.5"
                    />
                  </div>
                )}
                {canTrap && (
                  <button
                    onClick={() => handleTrapToggle(ni)}
                    className={`w-full py-1 text-[10px] rounded border transition-colors ${
                      isTrapped
                        ? "border-[#ff3344] bg-[#ff3344]/20 text-[#ff3344]"
                        : "border-[#3d3428] text-[#7a7060] hover:border-[#ff3344] hover:text-[#ff3344]"
                    }`}
                  >
                    {isTrapped ? "DISARM" : "TRAP (2 pts)"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget summary */}
      <div className="flex justify-between text-xs text-[#7a7060] pt-2 border-t border-[#3d3428]">
        <span>
          Points: {allocationTotal} + Traps: {trapCost} = {total} / {budget}
        </span>
        {remaining !== 0 && <span className="text-[#daa520]">Must use all {budget}</span>}
      </div>

      {/* Commit button — full-width, prominent */}
      <button
        onClick={onCommit}
        disabled={busy || !budgetExact}
        className={`w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all disabled:cursor-not-allowed ${
          busy
            ? "bg-[#c8a44e]/10 border-2 border-[#c8a44e] text-[#c8a44e] animate-pulse"
            : budgetExact
              ? "bg-green-500/10 border-2 border-green-400 text-green-400 commit-ready hover:bg-green-500/20"
              : remaining > 0
                ? "bg-[#daa520]/10 border-2 border-[#daa520]/40 text-[#daa520] opacity-30"
                : "bg-[#ff3344]/10 border-2 border-[#ff3344]/40 text-[#ff3344] opacity-30"
        }`}
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            SUBMITTING...
          </span>
        ) : confirming ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            CONFIRMING ON-CHAIN...
          </span>
        ) : (
          "\u2694 COMMIT ORDERS \u2694"
        )}
      </button>
      {error && <div className="text-[#ff3344] text-xs text-center">{error}</div>}
    </div>
  );
}
