"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { BattlefieldView, POSITIONS } from "@/components/BattlefieldView";
import { createMarchTimeline, type TroopTarget } from "@/lib/animations/troopMarch";
import { createClashTimeline, type ClashElements } from "@/lib/animations/gateClash";
import { createAbilityTimeline, type AbilityElements } from "@/lib/animations/abilityEffects";
import { createBreachTimeline, type BreachElements } from "@/lib/animations/vaultBreach";
import { createRoundTimeline, type RoundElements, type RoundConfig } from "@/lib/animations/roundResolution";
import {
  MOCK_ALLOCATIONS_A,
  MOCK_ALLOCATIONS_B,
  MOCK_MODIFIERS,
  MOCK_RESULT,
  MOCK_PREV_NODES,
  MOCK_NEW_NODES,
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

const TROOP_TYPE_DELAY: Record<string, number> = {
  attack: 0,
  defense: 200,
  node: 350,
  healer: 450,
};

function TroopMarchScene({ onComplete }: { onComplete: () => void }) {
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRef = useRef<HTMLDivElement>(null);
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
      delay: TROOP_TYPE_DELAY[groups[i].type] ?? 0,
    }));

    // Fade in DEPLOYING label, fade out when march completes
    const label = labelRef.current;
    if (label) {
      label.style.opacity = "0";
      label.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 300, fill: "forwards" },
      );
    }

    const tl = createMarchTimeline(targets, () => {
      if (label) {
        label.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 300, fill: "forwards" },
        );
      }
      setTimeout(onComplete, 350);
    });
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <div
        ref={labelRef}
        className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] tracking-[3px] font-serif text-[#c8a44e] select-none"
        style={{ opacity: 0 }}
      >
        DEPLOYING...
      </div>
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

const CLASH_SPARK_DIRECTIONS = [
  { x: -30, y: -25 },
  { x: 25, y: -35 },
  { x: 35, y: 20 },
  { x: -20, y: 30 },
  { x: 15, y: -40 },
];

function GateClashScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const whiteFlashRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRefs = useRef<(HTMLDivElement | null)[][]>([[], [], []]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { onComplete(); return; }

    const els: ClashElements = {
      container,
      gates: gateRefs.current.filter(Boolean) as HTMLElement[],
      whiteFlashes: whiteFlashRefs.current.filter(Boolean) as HTMLElement[],
      rings: ringRefs.current.filter(Boolean) as HTMLElement[],
      sparks: sparkRefs.current.map((arr) => arr.filter(Boolean) as HTMLElement[]),
      damageNumbers: dmgRefs.current.filter(Boolean) as HTMLElement[],
      vignetteEl: vignetteRef.current,
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
      {/* Red vignette overlay for damage taken */}
      <div
        ref={vignetteRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(200,30,30,0.5) 100%)",
          opacity: 0,
        }}
      />
      {/* White flash on impact */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`white-flash-${i}`}
          ref={(el) => { whiteFlashRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            width: 60,
            height: 60,
            transform: "translate(-50%, -50%) scale(0.5)",
            background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 40%, transparent 70%)",
            opacity: 0,
          }}
        />
      ))}
      {/* Ring shockwave per gate */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`ring-${i}`}
          ref={(el) => { ringRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            width: 60,
            height: 60,
            transform: "translate(-50%, -50%) scale(0.3)",
            border: "2px solid rgba(255,255,255,0.7)",
            opacity: 0,
          }}
        />
      ))}
      {/* Spark particles per gate */}
      {POSITIONS.gates.map((pos, gateIdx) => (
        CLASH_SPARK_DIRECTIONS.map((_, sparkIdx) => (
          <div
            key={`spark-${gateIdx}-${sparkIdx}`}
            ref={(el) => {
              if (!sparkRefs.current[gateIdx]) sparkRefs.current[gateIdx] = [];
              sparkRefs.current[gateIdx][sparkIdx] = el;
            }}
            className="absolute rounded-full"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: 4,
              height: 4,
              transform: "translate(-50%, -50%)",
              background: "rgba(255,200,80,0.9)",
              opacity: 0,
              willChange: "transform",
            }}
          />
        ))
      ))}
      {/* Orange gate flashes */}
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
      {/* Damage numbers - dealt appears before taken */}
      {dmgNumbers.map((d, i) => {
        const pos = POSITIONS.gates[d.gateIndex];
        const offsetX = d.variant === "dealt" ? -20 : 20;
        return (
          <div
            key={`dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-lg select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`,
              top: `${pos.y}%`,
              transform: "translate(-50%, 0) scale(0.5)",
              color: d.color,
              opacity: 0,
              textShadow: "0 2px 6px rgba(0,0,0,0.9)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}
    </div>
  );
}

const ABILITY_ICONS: Record<number, string> = {
  1: "/sprites/abilities/siege-sword.svg",
  2: "/sprites/abilities/stone-cloak.svg",
  3: "/sprites/abilities/ember-blast.svg",
  4: "/sprites/abilities/hex.svg",
  5: "/sprites/abilities/fortify.svg",
};

function AbilityScene({
  abilityId,
  onComplete,
}: {
  abilityId: number;
  onComplete: () => void;
}) {
  const effectRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const abilityType = ((abilityId - 1) % 5) + 1;

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

  // Determine icon position based on ability type
  const iconSrc = ABILITY_ICONS[abilityType];
  let posX: number;
  let posY: number;
  switch (abilityType) {
    case 1: posX = gatePos.x; posY = gatePos.y; break;     // Siege Sword: at gate
    case 2: posX = myBase.x; posY = myBase.y; break;        // Stone Cloak: player base
    case 3: posX = enemyBase.x; posY = enemyBase.y; break;  // Ember Blast: enemy base
    case 4: posX = 50; posY = 50; break;                     // Hex: center
    case 5: posX = myBase.x; posY = myBase.y; break;        // Fortify: player base
    default: return null;
  }

  // Secondary effect styles per ability type
  const secondaryStyles: Record<number, React.CSSProperties> = {
    1: { // Gold slash trail
      left: `${posX}%`, top: `${posY}%`, width: 160, height: 40,
      transform: "translate(-50%, -50%) rotate(-30deg) scaleX(0.1)",
      background: "linear-gradient(90deg, transparent, rgba(218,165,32,0.8), rgba(255,136,0,0.6), transparent)",
      borderRadius: "50%",
      opacity: 0,
    },
    2: { // Blue/silver shimmer dome
      left: `${posX}%`, top: `${posY}%`, width: 200, height: 200,
      transform: "translate(-50%, -50%) scale(0.3)",
      background: "radial-gradient(circle, rgba(160,196,255,0.5) 0%, rgba(100,160,255,0.2) 40%, transparent 70%)",
      border: "2px solid rgba(160,196,255,0.4)",
      borderRadius: "50%",
      opacity: 0,
    },
    3: { // Orange radial explosion burst
      left: `${posX}%`, top: `${posY}%`, width: 220, height: 220,
      transform: "translate(-50%, -50%) scale(0.2)",
      background: "radial-gradient(circle, rgba(255,100,20,0.9) 0%, rgba(255,50,10,0.5) 40%, transparent 70%)",
      borderRadius: "50%",
      opacity: 0,
    },
    4: { // Red ripple rings
      left: `${posX}%`, top: `${posY}%`, width: 240, height: 240,
      transform: "translate(-50%, -50%) scale(0.3)",
      border: "3px solid rgba(204,34,51,0.6)",
      boxShadow: "0 0 30px 15px rgba(255,51,68,0.3), inset 0 0 20px rgba(255,51,68,0.2)",
      borderRadius: "50%",
      opacity: 0,
    },
    5: { // Golden shimmer particles rising
      left: `${posX}%`, top: `${posY}%`, width: 80, height: 160,
      transform: "translate(-50%, -50%) scaleY(0.3)",
      background: "linear-gradient(to top, rgba(200,164,78,0.6), rgba(218,165,32,0.3), transparent)",
      borderRadius: "40%",
      opacity: 0,
    },
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Secondary environmental effect (behind icon) */}
      <div
        ref={secondaryRef}
        className="absolute"
        style={secondaryStyles[abilityType]}
      />
      {/* Primary ability icon */}
      <div
        ref={effectRef}
        className="absolute"
        style={{
          left: `${posX}%`,
          top: `${posY}%`,
          width: 100,
          height: 100,
          transform: "translate(-50%, -50%) scale(0.2)",
          opacity: 0,
          filter: "drop-shadow(0 0 12px rgba(218,165,32,0.6))",
        }}
      >
        <img
          src={iconSrc}
          alt={`Ability ${abilityType}`}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

function VaultBreachScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const bannerTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const vault = vaultRef.current;
    const flash = flashRef.current;
    const banner = bannerRef.current;
    const bannerText = bannerTextRef.current;
    if (!container || !vault || !flash || !banner || !bannerText) {
      onComplete();
      return;
    }
    const els: BreachElements = { container, vault, flash, banner, bannerText };
    const tl = createBreachTimeline(els, true, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      <div
        ref={vaultRef}
        className="absolute"
        style={{
          left: `${POSITIONS.baseB.x}%`,
          top: `${POSITIONS.baseB.y}%`,
          transform: "translate(-50%, -50%)",
          width: 60,
          height: 60,
          borderRadius: 8,
          background: "radial-gradient(circle, rgba(255,50,20,0.6) 0%, rgba(200,40,10,0.3) 60%, transparent 100%)",
          border: "2px solid rgba(255,80,30,0.5)",
        }}
      />
      <div
        ref={flashRef}
        className="absolute inset-0"
        style={{ background: "rgba(255,220,150,0.8)", opacity: 0 }}
      />
      <div
        ref={bannerRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          background: "linear-gradient(135deg, #1a1714 0%, #2a2420 100%)",
          border: "2px solid #c8a44e",
          borderRadius: 8,
          padding: "20px 40px",
          opacity: 0,
          boxShadow: "0 0 40px rgba(200,164,78,0.3)",
        }}
      >
        <div
          ref={bannerTextRef}
          className="text-center"
          style={{ opacity: 0 }}
        >
          <div className="text-[#c8a44e] text-2xl font-serif tracking-wider">VICTORY</div>
          <div className="text-[#7a7060] text-xs mt-1">Enemy vault destroyed</div>
        </div>
      </div>
    </div>
  );
}

const SPARK_DIRECTIONS = [
  { x: -30, y: -25 },
  { x: 25, y: -35 },
  { x: 35, y: 20 },
  { x: -20, y: 30 },
  { x: 15, y: -40 },
];

function FullRoundScene({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const troopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const whiteFlashRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRefs = useRef<(HTMLDivElement | null)[][]>([[], [], []]);
  const dmgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeBurstRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hpRefA = useRef<HTMLDivElement | null>(null);
  const hpRefB = useRef<HTMLDivElement | null>(null);

  const marchGroups = getMarchGroups();
  const base = POSITIONS.baseA;

  const dmgNumbers: { gateIndex: number; value: number; color: string; variant: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = MOCK_RESULT.gateBreakdown[i];
    if (gate.dmgToB > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToB, color: "#4ade80", variant: "dealt" });
    if (gate.dmgToA > 0) dmgNumbers.push({ gateIndex: i, value: gate.dmgToA, color: "#ef4444", variant: "taken" });
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { onComplete(); return; }

    const roundEls: RoundElements = {
      container,
      vignetteEl: vignetteRef.current,
      troopEls: troopRefs.current.filter(Boolean) as HTMLElement[],
      troopTargets: marchGroups.map((g) => ({
        toX: g.toX,
        toY: g.toY,
        delay: TROOP_TYPE_DELAY[g.type] ?? 0,
      })),
      gateFlashEls: gateRefs.current.filter(Boolean) as HTMLElement[],
      whiteFlashEls: whiteFlashRefs.current.filter(Boolean) as HTMLElement[],
      ringEls: ringRefs.current.filter(Boolean) as HTMLElement[],
      sparkEls: sparkRefs.current.map((arr) => arr.filter(Boolean) as HTMLElement[]),
      damageNumberEls: dmgRefs.current.filter(Boolean) as HTMLElement[],
      abilityEl: null,
      abilitySecondaryEl: null,
      nodeEls: nodeRefs.current.filter(Boolean) as HTMLElement[],
      nodeBurstEls: nodeBurstRefs.current.filter(Boolean) as HTMLElement[],
      vaultHpElA: hpRefA.current,
      vaultHpElB: hpRefB.current,
    };
    const config: RoundConfig = {
      abilityId: MOCK_RESULT.aAbilityId,
      abilityTier: 1,
      abilityType: ((MOCK_RESULT.aAbilityId - 1) % 5) + 1,
      gateDamages: MOCK_RESULT.gateBreakdown,
      nodesChanged: [
        MOCK_PREV_NODES[0] !== MOCK_NEW_NODES[0],
        MOCK_PREV_NODES[1] !== MOCK_NEW_NODES[1],
        MOCK_PREV_NODES[2] !== MOCK_NEW_NODES[2],
      ],
      vaultAHpFrom: 45,
      vaultAHpTo: 45 - MOCK_RESULT.damageToA,
      vaultBHpFrom: 42,
      vaultBHpTo: 42 - MOCK_RESULT.damageToB,
    };
    const tl = createRoundTimeline(roundEls, config, onComplete);
    tl.play();
    return () => { tl.pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
      {/* Dark cinematic vignette */}
      <div
        ref={vignetteRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          opacity: 0,
        }}
      />
      {marchGroups.map((g, i) => (
        <div
          key={`round-troop-${i}`}
          ref={(el) => { troopRefs.current[i] = el; }}
          className="absolute pointer-events-none"
          style={{
            left: `${base.x}%`, top: `${base.y}%`,
            transform: "translate(-50%, -50%)", width: "7%", opacity: 0.5,
          }}
        >
          <Image
            src={TROOP_SPRITES[g.type]["a"]}
            alt={g.type} width={64} height={64}
            className="w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />
        </div>
      ))}
      {/* White flash on impact */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`round-white-${i}`}
          ref={(el) => { whiteFlashRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.5)",
            background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 40%, transparent 70%)",
            opacity: 0,
          }}
        />
      ))}
      {/* Ring shockwaves per gate */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`round-ring-${i}`}
          ref={(el) => { ringRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.3)",
            border: "2px solid rgba(255,255,255,0.7)",
            opacity: 0,
          }}
        />
      ))}
      {/* Sparks per gate */}
      {POSITIONS.gates.map((pos, gateIdx) => (
        SPARK_DIRECTIONS.map((_, sparkIdx) => (
          <div
            key={`round-spark-${gateIdx}-${sparkIdx}`}
            ref={(el) => {
              if (!sparkRefs.current[gateIdx]) sparkRefs.current[gateIdx] = [];
              sparkRefs.current[gateIdx][sparkIdx] = el;
            }}
            className="absolute rounded-full"
            style={{
              left: `${pos.x}%`, top: `${pos.y}%`,
              width: 4, height: 4,
              transform: "translate(-50%, -50%)",
              background: "rgba(255,200,80,0.9)",
              opacity: 0,
              willChange: "transform",
            }}
          />
        ))
      ))}
      {/* Orange gate flashes */}
      {POSITIONS.gates.map((pos, i) => (
        <div
          key={`round-gate-${i}`}
          ref={(el) => { gateRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 80, height: 80,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: "radial-gradient(circle, rgba(255,200,80,0.8) 0%, rgba(255,80,20,0.5) 50%, transparent 100%)",
            opacity: 0,
          }}
        />
      ))}
      {/* Damage numbers */}
      {dmgNumbers.map((d, i) => {
        const pos = POSITIONS.gates[d.gateIndex];
        const offsetX = d.variant === "dealt" ? -20 : 20;
        return (
          <div
            key={`round-dmg-${i}`}
            ref={(el) => { dmgRefs.current[i] = el; }}
            className="absolute font-mono font-bold text-lg select-none"
            style={{
              left: `calc(${pos.x}% + ${offsetX}px)`, top: `${pos.y}%`,
              transform: "translate(-50%, 0) scale(0.5)", color: d.color, opacity: 0,
              textShadow: "0 2px 6px rgba(0,0,0,0.9)",
            }}
          >
            {d.variant === "dealt" ? `+${d.value}` : `-${d.value}`}
          </div>
        );
      })}
      {/* Nodes */}
      {POSITIONS.nodes.map((pos, i) => (
        <div
          key={`round-node-${i}`}
          ref={(el) => { nodeRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 36, height: 36,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${MOCK_NEW_NODES[i] === "teamA" ? "#c8a44e" : "#ef4444"}99 0%, transparent 70%)`,
            border: `2px solid ${MOCK_NEW_NODES[i] === "teamA" ? "#c8a44e" : "#ef4444"}`,
            opacity: 0,
          }}
        />
      ))}
      {/* Node burst elements */}
      {POSITIONS.nodes.map((pos, i) => (
        <div
          key={`round-node-burst-${i}`}
          ref={(el) => { nodeBurstRefs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`, width: 60, height: 60,
            transform: "translate(-50%, -50%) scale(0.3)",
            background: `radial-gradient(circle, ${MOCK_NEW_NODES[i] === "teamA" ? "rgba(200,164,78,0.8)" : "rgba(239,68,68,0.8)"} 0%, transparent 70%)`,
            opacity: 0,
          }}
        />
      ))}
      <div
        ref={hpRefA}
        className="absolute font-mono font-bold text-lg"
        style={{
          left: `${POSITIONS.baseA.x}%`, top: `${POSITIONS.baseA.y - 12}%`,
          transform: "translateX(-50%)",
          color: "#ef4444",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        45 HP
      </div>
      <div
        ref={hpRefB}
        className="absolute font-mono font-bold text-lg"
        style={{
          left: `${POSITIONS.baseB.x}%`, top: `${POSITIONS.baseB.y - 12}%`,
          transform: "translateX(-50%)",
          color: "#ef4444",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        42 HP
      </div>
    </div>
  );
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
              activeScene === "idle" || activeScene === "troop-march" || activeScene === "full-round"
                ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                : MOCK_ALLOCATIONS_A
            }
            isPlayerA={true}
            committed={activeScene !== "idle" && activeScene !== "troop-march" && activeScene !== "full-round"}
            modifiers={MOCK_MODIFIERS}
            opponentAllocations={
              activeScene === "idle" || activeScene === "troop-march" || activeScene === "full-round"
                ? null
                : MOCK_ALLOCATIONS_B
            }
          >
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
            {activeScene === "vault-breach" && (
              <VaultBreachScene onComplete={() => setPlaying(false)} />
            )}
            {activeScene === "full-round" && (
              <FullRoundScene onComplete={() => setPlaying(false)} />
            )}
          </BattlefieldView>
        </div>
      </div>
    </div>
  );
}
