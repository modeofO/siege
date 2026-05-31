"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { BattlefieldView, POSITIONS } from "@/components/BattlefieldView";
import { createMarchTimeline, type TroopTarget } from "@/lib/animations/troopMarch";
import { createClashTimeline, type ClashElements } from "@/lib/animations/gateClash";
import { createAbilityTimeline, type AbilityElements } from "@/lib/animations/abilityEffects";
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
void MOCK_PREV_NODES;
void MOCK_NEW_NODES;
void MOCK_VAULT_BREACH_RESULT;
void mockResultWithAbility;

const TROOP_SPRITES: Record<string, Record<string, string>> = {
  attack: { a: "/sprites/troops/troop_attacka.png", b: "/sprites/troops/troop_attackb.png" },
  defense: { a: "/sprites/troops/troop_defensea.png", b: "/sprites/troops/troop_defenseb.png" },
  healer: { a: "/sprites/troops/troop_healera.png", b: "/sprites/troops/troop_healerb.png" },
  node: { a: "/sprites/troops/troop_nodea.png", b: "/sprites/troops/troop_nodeb.png" },
};

interface MarchGroup {
  type: string;
  team: "a" | "b";
  count: number;
  toX: number;
  toY: number;
}

function getMarchGroups(): MarchGroup[] {
  const atk = MOCK_ALLOCATIONS_A;
  const attackPos = [
    { x: POSITIONS.baseB.x - 8, y: POSITIONS.gates[0].y },
    { x: POSITIONS.baseB.x, y: POSITIONS.gates[1].y },
    { x: POSITIONS.baseB.x - 8, y: 48 },
  ];
  const defensePos = [
    { x: POSITIONS.baseA.x + 5, y: POSITIONS.gates[0].y },
    { x: POSITIONS.baseA.x + 5, y: POSITIONS.gates[1].y },
    { x: POSITIONS.baseA.x + 8, y: 48 },
  ];
  const nodePos = POSITIONS.nodes.map((n) => ({ x: n.x - 2, y: n.y }));
  const repairPos = POSITIONS.repairA;

  const groups: MarchGroup[] = [];
  for (let i = 0; i < 3; i++) {
    if (atk[i] > 0)
      groups.push({ type: "attack", team: "a", count: atk[i], toX: attackPos[i].x, toY: attackPos[i].y });
  }
  for (let i = 0; i < 3; i++) {
    if (atk[3 + i] > 0)
      groups.push({ type: "defense", team: "a", count: atk[3 + i], toX: defensePos[i].x, toY: defensePos[i].y });
  }
  if (atk[6] > 0)
    groups.push({ type: "healer", team: "a", count: atk[6], toX: repairPos.x, toY: repairPos.y });
  for (let i = 0; i < 3; i++) {
    if (atk[7 + i] > 0)
      groups.push({ type: "node", team: "a", count: atk[7 + i], toX: nodePos[i].x, toY: nodePos[i].y });
  }
  return groups;
}

function TroopMarchScene({ onComplete }: { onComplete: () => void }) {
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const groups = getMarchGroups();
  const base = POSITIONS.baseA;

  useEffect(() => {
    const els = troopRefs.current.filter(Boolean) as HTMLElement[];
    if (els.length === 0) {
      onComplete();
      return;
    }
    const targets: TroopTarget[] = els.map((el, i) => ({
      el,
      toX: groups[i].toX,
      toY: groups[i].toY,
    }));
    const tl = createMarchTimeline(targets, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {groups.map((g, i) => (
        <div
          key={`march-${i}`}
          ref={(el) => { troopRefs.current[i] = el; }}
          className="absolute pointer-events-none"
          style={{
            left: `${base.x}%`,
            top: `${base.y}%`,
            transform: "translate(-50%, -50%)",
            width: "7%",
            opacity: 0.5,
          }}
        >
          <Image
            src={TROOP_SPRITES[g.type]["a"]}
            alt={`${g.type}`}
            width={64}
            height={64}
            className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />
          <span className="block text-center text-[9px] text-[#d4cfc6] bg-[#1a1714]/80 border border-[#3d3428] rounded px-1 mt-0.5">
            x{g.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function GateClashScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { onComplete(); return; }

    const els: ClashElements = {
      container,
      gates: gateRefs.current.filter(Boolean) as HTMLElement[],
      damageNumbers: dmgRefs.current.filter(Boolean) as HTMLElement[],
    };
    const tl = createClashTimeline(els, MOCK_RESULT, true, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dmgNumbers: { gateIndex: number; value: number; color: string; variant: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = MOCK_RESULT.gateBreakdown[i];
    if (gate.dmgToB > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToB, color: "#4ade80", variant: "dealt" });
    if (gate.dmgToA > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToA, color: "#ef4444", variant: "taken" });
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`gate-flash-${i}`}
          ref={(el) => { gateRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            width: 80,
            height: 80,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: "radial-gradient(circle, rgba(255,200,80,0.8) 0%, rgba(255,80,20,0.5) 50%, transparent 100%)",
            opacity: 0,
          }}
        />
      ))}
      {dmgNumbers.map((d, i) => {
        const pos = POSITIONS.gates[d.gateIndex];
        const offsetX = d.variant === "dealt" ? -16 : 16;
        return (
          <div
            key={`dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-sm select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`,
              top: `${pos.y}%`,
              transform: "translate(-50%, 0)",
              color: d.color,
              opacity: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}
    </div>
  );
}

function AbilityScene({
  abilityId,
  onComplete,
}: {
  abilityId: number;
  onComplete: () => void;
}) {
  const effectRef = useRef<HTMLDivElement | SVGSVGElement | null>(null);
  const secondaryRef = useRef<HTMLDivElement | SVGLineElement | null>(null);
  const abilityType = ((abilityId - 1) % 5) + 1;
  const tier = Math.floor((abilityId - 1) / 5) + 1;

  useEffect(() => {
    const el = effectRef.current;
    if (!el) { onComplete(); return; }
    const els: AbilityElements = { effectEl: el, secondaryEl: secondaryRef.current };
    const tl = createAbilityTimeline(abilityId, els, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gatePos = POSITIONS.gates[0];
  const myBase = POSITIONS.baseA;
  const enemyBase = POSITIONS.baseB;

  switch (abilityType) {
    case 1: { // Siege Sword
      const size = tier === 2 ? 16 : 10;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <svg
            className="absolute"
            style={{ left: `${gatePos.x}%`, top: `${gatePos.y}%`, width: `${size}%`, height: `${size}%`, transform: "translate(-50%, -50%)", overflow: "visible" }}
            viewBox="-10 -10 20 20"
          >
            <line ref={effectRef as React.Ref<SVGLineElement>} x1="-8" y1="-8" x2="8" y2="8" stroke="#daa520" strokeWidth={tier === 2 ? 3 : 2} strokeLinecap="round" strokeDasharray="60" strokeDashoffset="60" opacity="0" />
            <line ref={secondaryRef as React.Ref<SVGLineElement>} x1="8" y1="-8" x2="-8" y2="8" stroke="#ff8800" strokeWidth={tier === 2 ? 3 : 2} strokeLinecap="round" strokeDasharray="60" strokeDashoffset="60" opacity="0" />
          </svg>
        </div>
      );
    }
    case 2: { // Stone Cloak
      const w = tier === 2 ? 18 : 13;
      const h = tier === 2 ? 22 : 16;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: `${myBase.x}%`, top: `${myBase.y}%`,
              width: `${w}%`, height: `${h}%`,
              transform: "translate(-50%, -50%) scaleY(0.3)",
              border: `3px solid ${tier === 2 ? "#c8a44e" : "#a0c4ff"}`,
              boxShadow: `0 0 16px 6px ${tier === 2 ? "rgba(200,164,78,0.5)" : "rgba(160,196,255,0.4)"}`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 3: { // Ember Blast
      const sz = tier === 2 ? 140 : 100;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: `${enemyBase.x}%`, top: `${enemyBase.y}%`,
              width: sz, height: sz,
              transform: "translate(-50%, -50%) scale(0.1)",
              background: "radial-gradient(circle, rgba(255,100,20,0.9) 0%, rgba(255,50,10,0.6) 40%, transparent 100%)",
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 4: { // Hex
      const sz = tier === 2 ? 180 : 130;
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%",
              width: sz, height: sz,
              transform: "translate(-50%, -50%) scale(0.3)",
              border: `3px solid ${tier === 2 ? "#ff3344" : "#cc2233"}`,
              boxShadow: `0 0 24px 10px ${tier === 2 ? "rgba(255,51,68,0.4)" : "rgba(204,34,51,0.3)"}`,
              opacity: 0,
            }}
          />
          <div
            ref={secondaryRef as React.Ref<HTMLDivElement>}
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%",
              width: sz * 0.7, height: sz * 0.7,
              transform: "translate(-50%, -50%) scale(0.2)",
              border: `2px solid ${tier === 2 ? "#ff3344" : "#cc2233"}`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    case 5: { // Fortify
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            ref={effectRef as React.Ref<HTMLDivElement>}
            className="absolute"
            style={{
              left: `${myBase.x}%`, top: `${myBase.y}%`,
              width: tier === 2 ? 8 : 5,
              height: tier === 2 ? 160 : 120,
              transform: "translate(-50%, -50%) scaleY(0.3)",
              background: `linear-gradient(to bottom, transparent, ${tier === 2 ? "#c8a44e" : "#a0c4ff"}, transparent)`,
              opacity: 0,
            }}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

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
            allocations={
              activeScene === "idle" || activeScene === "troop-march"
                ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                : MOCK_ALLOCATIONS_A
            }
            isPlayerA={true}
            committed={activeScene !== "idle" && activeScene !== "troop-march"}
            modifiers={MOCK_MODIFIERS}
            opponentAllocations={
              activeScene === "idle" || activeScene === "troop-march"
                ? null
                : MOCK_ALLOCATIONS_B
            }
          />
          {activeScene === "troop-march" && (
            <TroopMarchScene onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "gate-clash" && (
            <GateClashScene onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "siege-sword" && (
            <AbilityScene abilityId={1} onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "stone-cloak" && (
            <AbilityScene abilityId={2} onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "ember-blast" && (
            <AbilityScene abilityId={3} onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "hex" && (
            <AbilityScene abilityId={4} onComplete={() => setPlaying(false)} />
          )}
          {activeScene === "fortify" && (
            <AbilityScene abilityId={5} onComplete={() => setPlaying(false)} />
          )}
          {activeScene !== "idle" && activeScene !== "troop-march" && activeScene !== "gate-clash" && activeScene !== "siege-sword" && activeScene !== "stone-cloak" && activeScene !== "ember-blast" && activeScene !== "hex" && activeScene !== "fortify" && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-[#c8a44e]/60 tracking-wider font-mono">
                TODO: {activeScene}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
