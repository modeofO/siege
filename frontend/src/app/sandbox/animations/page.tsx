"use client";

import { useState, useRef, useCallback } from "react";
import { BattlefieldView, POSITIONS } from "@/components/BattlefieldView";
import {
  MOCK_ALLOCATIONS_A,
  MOCK_ALLOCATIONS_B,
  MOCK_MODIFIERS,
  MOCK_RESULT,
  MOCK_PREV_NODES,
  MOCK_NEW_NODES,
  MOCK_VAULT_BREACH_RESULT,
  mockResultWithAbility,
} from "./mockData";

type Scene =
  | "idle"
  | "troop-march"
  | "gate-clash"
  | "full-round"
  | "siege-sword"
  | "stone-cloak"
  | "ember-blast"
  | "hex"
  | "fortify"
  | "vault-breach";

const SCENES: { key: Scene; label: string }[] = [
  { key: "troop-march", label: "Troop March" },
  { key: "gate-clash", label: "Gate Clash" },
  { key: "full-round", label: "Full Round" },
  { key: "siege-sword", label: "Siege Sword" },
  { key: "stone-cloak", label: "Stone Cloak" },
  { key: "ember-blast", label: "Ember Blast" },
  { key: "hex", label: "Hex" },
  { key: "fortify", label: "Fortify" },
  { key: "vault-breach", label: "Vault Breach" },
];

// Suppress unused-import warnings for mock data that will be wired up in later tasks
void MOCK_RESULT;
void MOCK_PREV_NODES;
void MOCK_NEW_NODES;
void MOCK_VAULT_BREACH_RESULT;
void mockResultWithAbility;
void POSITIONS;

export default function AnimationSandboxPage() {
  const [activeScene, setActiveScene] = useState<Scene>("idle");
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const playScene = useCallback((scene: Scene) => {
    setActiveScene("idle");
    setPlaying(false);
    requestAnimationFrame(() => {
      setActiveScene(scene);
      setPlaying(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#12100e] text-[#d4cfc6]">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#1a1714] border-b border-[#3d3428] flex-wrap">
        <span className="text-[#c8a44e] text-xs tracking-[2px] font-serif mr-2">
          ANIMATIONS
        </span>
        {SCENES.map((s) => (
          <button
            key={s.key}
            onClick={() => playScene(s.key)}
            disabled={playing && activeScene === s.key}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              activeScene === s.key
                ? "border-[#c8a44e] bg-[#c8a44e]/15 text-[#c8a44e]"
                : "border-[#3d3428] hover:border-[#c8a44e]/50 text-[#d4cfc6]"
            } disabled:opacity-50`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="max-w-4xl mx-auto p-4">
        <div ref={containerRef} className="relative">
          <BattlefieldView
            allocations={activeScene === "idle" ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : MOCK_ALLOCATIONS_A}
            isPlayerA={true}
            committed={activeScene !== "idle"}
            modifiers={MOCK_MODIFIERS}
            opponentAllocations={activeScene === "idle" ? null : MOCK_ALLOCATIONS_B}
          />
          {activeScene !== "idle" && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-[#c8a44e]/60 tracking-wider font-mono pointer-events-auto">
                Playing: {activeScene}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
