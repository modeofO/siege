import type { RoundResult1v1, NodeOwner } from "./gameState1v1";

export interface EffectDescriptor {
  type: string;
  gateIndex?: number;
  nodeIndex?: number;
  variant?: string;
  value?: number;
  intensity: number;
  tier?: number;
  target?: number;
  color?: string;
  isMine?: boolean;
}

export function buildGateImpacts(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const dmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
    const dmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
    const totalDmg = dmgDealt + dmgTaken;
    if (totalDmg === 0) continue;
    effects.push({
      type: "gate-flash",
      gateIndex: i,
      intensity: Math.min(totalDmg / 8, 1),
      value: totalDmg,
    });
  }
  return effects;
}

export function buildDamageNumbers(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const dmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
    const dmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
    if (dmgDealt > 0) {
      effects.push({
        type: "damage-number",
        gateIndex: i,
        variant: "dealt",
        value: dmgDealt,
        intensity: Math.min(dmgDealt / 8, 1),
        color: "#4ade80",
      });
    }
    if (dmgTaken > 0) {
      effects.push({
        type: "damage-number",
        gateIndex: i,
        variant: "taken",
        value: dmgTaken,
        intensity: Math.min(dmgTaken / 8, 1),
        color: "#ef4444",
      });
    }
  }
  return effects;
}

export function buildNodeFlips(
  prevNodes: [NodeOwner, NodeOwner, NodeOwner],
  newNodes: [NodeOwner, NodeOwner, NodeOwner],
  isPlayerA: boolean,
): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  for (let i = 0; i < 3; i++) {
    if (prevNodes[i] !== newNodes[i]) {
      const myTeam = isPlayerA ? "teamA" : "teamB";
      effects.push({
        type: "node-flip",
        nodeIndex: i,
        intensity: 1,
        isMine: newNodes[i] === myTeam,
        color: newNodes[i] === myTeam ? "#c8a44e" : "#ef4444",
      });
    }
  }
  return effects;
}

export function buildTrapEffects(result: RoundResult1v1, isPlayerA: boolean): EffectDescriptor[] {
  const effects: EffectDescriptor[] = [];
  const myTraps = isPlayerA ? result.aTraps : result.bTraps;
  const theirTraps = isPlayerA ? result.bTraps : result.aTraps;

  for (let i = 0; i < 3; i++) {
    if (myTraps[i] > 0) {
      effects.push({ type: "trap-ring", nodeIndex: i, intensity: 1, isMine: true, color: "#daa520" });
      effects.push({ type: "trap-number", nodeIndex: i, intensity: 1, value: 5, isMine: true, color: "#daa520" });
    }
    if (theirTraps[i] > 0) {
      effects.push({ type: "trap-ring", nodeIndex: i, intensity: 1, isMine: false, color: "#ff6633" });
      effects.push({ type: "trap-number", nodeIndex: i, intensity: 1, value: 5, isMine: false, color: "#ff6633" });
    }
  }
  return effects;
}

const ABILITY_TYPE_MAP: Record<number, string> = {
  1: "ability-slash",
  2: "ability-shield",
  3: "ability-ember",
  4: "ability-hex",
  5: "ability-fortify",
};

export function buildAbilityEffect(
  abilityId: number,
  target: number,
  isMine: boolean,
): EffectDescriptor | null {
  if (abilityId === 0) return null;
  const abilityTypeNum = ((abilityId - 1) % 5) + 1;
  const tier = Math.floor((abilityId - 1) / 5) + 1;
  const effectType = ABILITY_TYPE_MAP[abilityTypeNum];
  if (!effectType) return null;
  return {
    type: effectType,
    target,
    tier,
    intensity: tier === 2 ? 1 : 0.7,
    isMine,
  };
}
