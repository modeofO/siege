"use client";

import { useEffect, useRef } from "react";
import { createTimeline } from "animejs";
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";
import {
  buildGateImpacts,
  buildDamageNumbers,
  buildNodeFlips,
  buildTrapEffects,
  buildAbilityEffect,
  type EffectDescriptor,
} from "@/lib/animationEffects";
import { POSITIONS } from "./BattlefieldView";

interface ResolutionOverlayProps {
  result: RoundResult1v1;
  prevNodes: [NodeOwner, NodeOwner, NodeOwner];
  newNodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Helper: call onComplete exactly once
// ---------------------------------------------------------------------------
function makeCompleter(ref: React.RefObject<boolean>, cb: () => void) {
  return () => {
    if (!ref.current) {
      ref.current = true;
      cb();
    }
  };
}

// ---------------------------------------------------------------------------
// Sub-components for each effect type
// ---------------------------------------------------------------------------

interface GateFlashProps {
  effect: EffectDescriptor;
  elRef: (el: HTMLElement | null) => void;
}
function GateFlash({ effect, elRef }: GateFlashProps) {
  const idx = effect.gateIndex ?? 0;
  const pos = POSITIONS.gates[idx];
  const size = 40 + effect.intensity * 60; // 40–100 px
  const alpha = 0.4 + effect.intensity * 0.5; // 0.4–0.9
  return (
    <div
      ref={elRef}
      className="fx-gate-flash absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(255,200,80,${alpha}) 0%, rgba(255,80,20,${alpha * 0.6}) 50%, transparent 100%)`,
        opacity: 0,
        transform: "translate(-50%, -50%) scale(0.3)",
        animation: "resolution-gate-flash 400ms ease-out forwards",
      }}
    />
  );
}

interface DamageNumberProps {
  effect: EffectDescriptor;
  elRef: (el: HTMLElement | null) => void;
  offsetX?: number;
}
function DamageNumber({ effect, elRef, offsetX = 0 }: DamageNumberProps) {
  const idx = effect.gateIndex ?? 0;
  const pos = POSITIONS.gates[idx];
  const isDealt = effect.variant === "dealt";
  const label = isDealt ? `+${effect.value}` : `-${effect.value}`;
  return (
    <div
      ref={elRef}
      className="fx-damage-number absolute pointer-events-none font-mono font-bold text-sm select-none"
      style={{
        left: `calc(${pos.x}% + ${offsetX}px)`,
        top: `${pos.y}%`,
        color: effect.color ?? (isDealt ? "#4ade80" : "#ef4444"),
        opacity: 0,
        transform: "translate(-50%, 0)",
        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        animation: "resolution-float-up 800ms ease-out 100ms forwards",
      }}
    >
      {label}
    </div>
  );
}

interface NodeFlipProps {
  effect: EffectDescriptor;
  elRef: (el: HTMLElement | null) => void;
}
function NodeFlip({ effect, elRef }: NodeFlipProps) {
  const idx = effect.nodeIndex ?? 0;
  const pos = POSITIONS.nodes[idx];
  return (
    <div
      ref={elRef}
      className="fx-node-flip absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${effect.color ?? "#c8a44e"}99 0%, transparent 70%)`,
        border: `2px solid ${effect.color ?? "#c8a44e"}`,
        opacity: 0,
        transform: "translate(-50%, -50%) scale(1)",
        animation: "resolution-node-bounce 500ms ease-out forwards",
      }}
    />
  );
}

interface TrapRingProps {
  effect: EffectDescriptor;
  elRef: (el: HTMLElement | null) => void;
}
function TrapRing({ effect, elRef }: TrapRingProps) {
  const idx = effect.nodeIndex ?? 0;
  const pos = POSITIONS.nodes[idx];
  return (
    <div
      ref={elRef}
      className="fx-trap-ring absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: `3px solid ${effect.color ?? "#daa520"}`,
        opacity: 0,
        transform: "translate(-50%, -50%) scale(0.2)",
        animation: "resolution-trap-ring 350ms ease-out forwards",
      }}
    />
  );
}

interface TrapNumberProps {
  effect: EffectDescriptor;
  elRef: (el: HTMLElement | null) => void;
}
function TrapNumber({ effect, elRef }: TrapNumberProps) {
  const idx = effect.nodeIndex ?? 0;
  const pos = POSITIONS.nodes[idx];
  return (
    <div
      ref={elRef}
      className="fx-trap-number absolute pointer-events-none font-mono font-bold text-xs select-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        color: effect.color ?? "#daa520",
        opacity: 0,
        transform: "translate(-50%, 0)",
        textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        animation: "resolution-float-up 800ms ease-out 50ms forwards",
      }}
    >
      {effect.isMine ? `TRAP +${effect.value ?? 5}` : `-${effect.value ?? 5}`}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ability effect sub-components
// ---------------------------------------------------------------------------

interface AbilityEffectRendererProps {
  effect: EffectDescriptor;
  isPlayerA: boolean;
  elRef: (el: HTMLElement | SVGElement | null) => void;
}

function AbilityEffectRenderer({ effect, isPlayerA, elRef }: AbilityEffectRendererProps) {
  // Positioning helpers
  const myBase = isPlayerA ? POSITIONS.baseA : POSITIONS.baseB;
  const enemyBase = isPlayerA ? POSITIONS.baseB : POSITIONS.baseA;
  const gateIdx = typeof effect.target === "number" ? Math.max(0, Math.min(2, effect.target)) : 0;
  const gatePos = POSITIONS.gates[gateIdx];

  switch (effect.type) {
    case "ability-slash": {
      // Siege Sword: two crossing SVG lines at targeted gate
      const cx = gatePos.x;
      const cy = gatePos.y;
      const size = effect.tier === 2 ? 8 : 5; // percent
      return (
        <svg
          ref={elRef as (el: SVGElement | null) => void}
          className="fx-ability absolute pointer-events-none"
          style={{
            left: `${cx}%`,
            top: `${cy}%`,
            width: `${size * 2}%`,
            height: `${size * 2}%`,
            transform: "translate(-50%, -50%)",
            overflow: "visible",
            opacity: 0,
          }}
          viewBox="-10 -10 20 20"
        >
          <line
            x1="-8" y1="-8" x2="8" y2="8"
            stroke="#daa520"
            strokeWidth={effect.tier === 2 ? 2.5 : 1.8}
            strokeLinecap="round"
            strokeDasharray="60"
            strokeDashoffset="60"
            style={{ animation: "resolution-slash 600ms ease-out forwards" }}
          />
          <line
            x1="8" y1="-8" x2="-8" y2="8"
            stroke="#ff8800"
            strokeWidth={effect.tier === 2 ? 2.5 : 1.8}
            strokeLinecap="round"
            strokeDasharray="60"
            strokeDashoffset="60"
            style={{ animation: "resolution-slash 600ms ease-out 60ms forwards" }}
          />
        </svg>
      );
    }

    case "ability-shield": {
      // Stone Cloak: oval border shield dome around player's base
      const bx = myBase.x;
      const by = myBase.y;
      const w = effect.tier === 2 ? 18 : 13; // % width
      const h = effect.tier === 2 ? 22 : 16; // % height
      return (
        <div
          ref={elRef as (el: HTMLElement | null) => void}
          className="fx-ability absolute pointer-events-none"
          style={{
            left: `${bx}%`,
            top: `${by}%`,
            width: `${w}%`,
            height: `${h}%`,
            borderRadius: "50%",
            border: `3px solid ${effect.tier === 2 ? "#c8a44e" : "#a0c4ff"}`,
            boxShadow: `0 0 12px 4px ${effect.tier === 2 ? "rgba(200,164,78,0.5)" : "rgba(160,196,255,0.4)"}`,
            opacity: 0,
            transform: "translate(-50%, -50%) scaleY(0.3)",
            animation: "resolution-shield-shimmer 600ms ease-out forwards",
          }}
        />
      );
    }

    case "ability-ember": {
      // Ember Blast: radial gradient circle at enemy base
      const ex = enemyBase.x;
      const ey = enemyBase.y;
      const sz = effect.tier === 2 ? 120 : 80;
      return (
        <div
          ref={elRef as (el: HTMLElement | null) => void}
          className="fx-ability absolute pointer-events-none"
          style={{
            left: `${ex}%`,
            top: `${ey}%`,
            width: sz,
            height: sz,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(255,100,20,0.9) 0%, rgba(255,50,10,0.6) 40%, transparent 100%)`,
            opacity: 0,
            transform: "translate(-50%, -50%) scale(0.1)",
            animation: "resolution-ember-burst 600ms ease-out forwards",
          }}
        />
      );
    }

    case "ability-hex": {
      // Hex: large ripple circle centered on battlefield
      const sz2 = effect.tier === 2 ? 160 : 110;
      return (
        <div
          ref={elRef as (el: HTMLElement | null) => void}
          className="fx-ability absolute pointer-events-none"
          style={{
            left: "50%",
            top: "50%",
            width: sz2,
            height: sz2,
            borderRadius: "50%",
            border: `3px solid ${effect.tier === 2 ? "#ff3344" : "#cc2233"}`,
            boxShadow: `0 0 20px 8px ${effect.tier === 2 ? "rgba(255,51,68,0.4)" : "rgba(204,34,51,0.3)"}`,
            opacity: 0,
            transform: "translate(-50%, -50%) scale(0.5)",
            animation: "resolution-hex-ripple 600ms ease-out forwards",
          }}
        />
      );
    }

    case "ability-fortify": {
      // Fortify: vertical gradient line at player's base
      const fx = myBase.x;
      const fy = myBase.y;
      return (
        <div
          ref={elRef as (el: HTMLElement | null) => void}
          className="fx-ability absolute pointer-events-none"
          style={{
            left: `${fx}%`,
            top: `${fy}%`,
            width: effect.tier === 2 ? 6 : 4,
            height: effect.tier === 2 ? 140 : 100,
            background: `linear-gradient(to bottom, transparent, ${effect.tier === 2 ? "#c8a44e" : "#a0c4ff"}, transparent)`,
            opacity: 0,
            transform: "translate(-50%, -50%) scaleY(0.5)",
            animation: "resolution-fortify-glow 600ms ease-out forwards",
          }}
        />
      );
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main ResolutionOverlay component
// ---------------------------------------------------------------------------

export function ResolutionOverlay({
  result,
  prevNodes,
  newNodes,
  isPlayerA,
  onComplete,
}: ResolutionOverlayProps) {
  const completedRef = useRef(false);
  const tlRef = useRef<ReturnType<typeof createTimeline> | null>(null);

  const gateImpacts = buildGateImpacts(result, isPlayerA);
  const damageNumbers = buildDamageNumbers(result, isPlayerA);
  const nodeFlips = buildNodeFlips(prevNodes, newNodes, isPlayerA);
  const trapEffects = buildTrapEffects(result, isPlayerA);

  const myAbilityId = isPlayerA ? result.aAbilityId : result.bAbilityId;
  const myAbilityTarget = isPlayerA ? result.aAbilityTarget : result.bAbilityTarget;
  const enemyAbilityId = isPlayerA ? result.bAbilityId : result.aAbilityId;
  const enemyAbilityTarget = isPlayerA ? result.bAbilityTarget : result.aAbilityTarget;

  const myAbilityEffect = buildAbilityEffect(myAbilityId, myAbilityTarget, true);
  const enemyAbilityEffect = buildAbilityEffect(enemyAbilityId, enemyAbilityTarget, false);

  const abilityEffects: EffectDescriptor[] = [];
  if (myAbilityEffect) abilityEffects.push(myAbilityEffect);
  if (enemyAbilityEffect) abilityEffects.push(enemyAbilityEffect);

  const overlayElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reduced motion: skip immediately
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete();
      return;
    }

    const complete = makeCompleter(completedRef, onComplete);

    const overlay = overlayElRef.current;
    if (!overlay) {
      complete();
      return;
    }

    // Total animation is ~1.5s: effects (0–800ms) + fade-out (1300–1500ms)
    const tl = createTimeline({
      autoplay: true,
      onComplete: () => {
        complete();
      },
    });
    tlRef.current = tl;

    tl.add(
      overlay,
      { opacity: [1, 0], duration: 200, ease: "easeOutQuad" },
      1300,
    );

    return () => {
      // Cleanup on unmount — ensure onComplete fires
      tl.pause();
      complete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = () => {
    tlRef.current?.pause();
    makeCompleter(completedRef, onComplete)();
  };

  // Separate counts to give dealt/taken numbers different horizontal offsets
  const gateDealtCount: number[] = [0, 0, 0];
  const gateTakenCount: number[] = [0, 0, 0];

  return (
    <div
      ref={overlayElRef}
      className="absolute inset-0 pointer-events-none z-20"
      style={{ opacity: 1 }}
    >
      {/* Dark vignette backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.45) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Skip button */}
      <button
        className="absolute top-2 right-2 text-[10px] tracking-widest text-[#d4cfc6]/60 hover:text-[#d4cfc6] font-mono uppercase border border-[#3d3428]/60 px-2 py-0.5 rounded transition-colors"
        style={{ pointerEvents: "auto", zIndex: 30 }}
        onClick={handleSkip}
      >
        SKIP
      </button>

      {/* Gate impact flashes */}
      {gateImpacts.map((effect, i) => (
        <GateFlash
          key={`gate-flash-${i}`}
          effect={effect}
          elRef={() => {}}
        />
      ))}

      {/* Floating damage numbers */}
      {damageNumbers.map((effect, i) => {
        const idx = effect.gateIndex ?? 0;
        let offsetX = 0;
        if (effect.variant === "dealt") {
          offsetX = -10 - gateDealtCount[idx] * 14;
          gateDealtCount[idx]++;
        } else {
          offsetX = 10 + gateTakenCount[idx] * 14;
          gateTakenCount[idx]++;
        }
        return (
          <DamageNumber
            key={`dmg-num-${i}`}
            effect={effect}
            elRef={() => {}}
            offsetX={offsetX}
          />
        );
      })}

      {/* Node ownership flips */}
      {nodeFlips.map((effect, i) => (
        <NodeFlip
          key={`node-flip-${i}`}
          effect={effect}
          elRef={() => {}}
        />
      ))}

      {/* Trap rings and numbers */}
      {trapEffects.map((effect, i) => {
        if (effect.type === "trap-ring") {
          return (
            <TrapRing
              key={`trap-ring-${i}`}
              effect={effect}
              elRef={() => {}}
            />
          );
        }
        if (effect.type === "trap-number") {
          return (
            <TrapNumber
              key={`trap-num-${i}`}
              effect={effect}
              elRef={() => {}}
            />
          );
        }
        return null;
      })}

      {/* Ability effects */}
      {abilityEffects.map((effect, i) => (
        <AbilityEffectRenderer
          key={`ability-${i}`}
          effect={effect}
          isPlayerA={isPlayerA}
          elRef={() => {}}
        />
      ))}
    </div>
  );
}
